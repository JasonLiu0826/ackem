// [extensions/skills/registry] — 技能注册表与执行器

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { EngineSnapshot, ExtensionEvent, ExtensionOpResult } from '../protocols'
import type { RuntimeContext } from '../../context/types'
import type {
  SkillManifest,
  SkillInstance,
  SkillHandler,
  SkillInvocation,
  SkillResult,
  SkillTrigger
} from './types'
import { CORE_EXTENSION_DEACTIVATE_ERROR, isCoreSkill } from '../../../shared/coreExtensions'
import { publishSkillExecutionTriggered } from '../../extensionTriggerBus'
import { kvGet, kvSet } from '../../db/repos/kv'
import { getDatabase } from '../../db/database'

const SKILLS_REGISTRY_KV_NS = 'extensions.skills.registry'
const SKILLS_REGISTRY_KV_KEY = 'entries'

export class SkillRegistry {
  private skills = new Map<string, SkillInstance>()
  private handlers = new Map<string, SkillHandler>()
  private skillsDir: string
  private engineSnapshot: EngineSnapshot | null = null
  private eventSink: ((event: ExtensionEvent) => void) | null = null
  private executionQueue: Promise<void> = Promise.resolve()
  private runtimeProvider: (() => RuntimeContext | null) | null = null

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir
    mkdirSync(skillsDir, { recursive: true })
  }

  async register(handler: SkillHandler): Promise<ExtensionOpResult> {
    const { manifest } = handler
    const existing = this.skills.get(manifest.id)
    if (existing) {
      existing.manifest = manifest
      if (existing.status === 'planned') {
        existing.status = 'installed'
      }
      this.handlers.set(manifest.id, handler)
      this.persistRegistry()
      return { ok: true }
    }
    const instance: SkillInstance = {
      manifest,
      status: 'installed',
      installedAt: new Date().toISOString(),
      executionCount: 0,
      hooks: {}
    }
    this.skills.set(manifest.id, instance)
    this.handlers.set(manifest.id, handler)
    this.persistRegistry()
    return { ok: true }
  }

  async registerPlaceholder(manifest: SkillManifest): Promise<ExtensionOpResult> {
    if (this.handlers.has(manifest.id)) {
      return { ok: true }
    }
    const existing = this.skills.get(manifest.id)
    if (existing) {
      if (this.handlers.has(manifest.id)) return { ok: true }
      if (existing.status !== 'planned') return { ok: true }
      existing.manifest = manifest
      this.persistRegistry()
      return { ok: true }
    }
    this.skills.set(manifest.id, {
      manifest,
      status: 'planned',
      installedAt: new Date().toISOString(),
      executionCount: 0,
      hooks: {}
    })
    this.persistRegistry()
    return { ok: true }
  }

  /** FIX-031：无 handler 的 catalog 占位强制回到 planned */
  enforceCatalogPlanned(id: string, manifest: SkillManifest): void {
    if (this.handlers.has(id)) return
    const existing = this.skills.get(id)
    if (!existing) return
    existing.status = 'planned'
    existing.manifest = manifest
    this.persistRegistry()
  }

  isRunnable(id: string): boolean {
    return this.handlers.has(id)
  }

  async activate(id: string): Promise<ExtensionOpResult> {
    const instance = this.skills.get(id)
    if (!instance) return { ok: false, error: `Skill '${id}' 未安装` }
    if (instance.status === 'planned' || !this.handlers.has(id)) {
      return { ok: false, error: '该 Skill 尚在规划中，尚未实装' }
    }
    instance.status = 'active'
    this.persistRegistry()
    return { ok: true }
  }

  async deactivate(id: string): Promise<ExtensionOpResult> {
    const instance = this.skills.get(id)
    if (!instance) return { ok: false, error: `Skill '${id}' 未安装` }
    if (isCoreSkill(id)) {
      return { ok: false, error: CORE_EXTENSION_DEACTIVATE_ERROR }
    }
    instance.status = 'disabled'
    this.persistRegistry()
    return { ok: true }
  }

  async unregister(id: string): Promise<ExtensionOpResult> {
    this.skills.delete(id)
    this.handlers.delete(id)
    this.persistRegistry()
    return { ok: true }
  }

  listAll(): SkillInstance[] {
    return Array.from(this.skills.values())
  }

  listActiveByType(type?: SkillInstance['manifest']['skillType']): SkillInstance[] {
    const active = Array.from(this.skills.values()).filter((s) => s.status === 'active')
    return type ? active.filter((s) => s.manifest.skillType === type) : active
  }

  get(id: string): SkillInstance | undefined {
    return this.skills.get(id)
  }

  getHandler(id: string): SkillHandler | undefined {
    return this.handlers.get(id)
  }

  matchByKeyword(userMessage: string): SkillHandler[] {
    const msg = userMessage.toLowerCase()
    const results: SkillHandler[] = []
    for (const [id, instance] of this.skills) {
      if (instance.status !== 'active') continue
      if (!instance.manifest.triggers.includes('keyword')) continue
      if (!instance.manifest.keywords) continue
      for (const kw of instance.manifest.keywords) {
        if (msg.includes(kw.toLowerCase())) {
          const handler = this.handlers.get(id)
          if (handler) {
            results.push(handler)
            break
          }
        }
      }
    }
    return results
  }

  getFunctionDefs() {
    const defs = []
    for (const [, instance] of this.skills) {
      if (instance.status !== 'active') continue
      if (!instance.manifest.triggers.includes('llm_function_call')) continue
      if (!instance.manifest.functionDef) continue
      defs.push(instance.manifest.functionDef)
    }
    return defs
  }

  findByFunctionName(name: string): SkillHandler | undefined {
    for (const [id, instance] of this.skills) {
      if (instance.status !== 'active') continue
      if (instance.manifest.functionDef?.name === name) {
        return this.handlers.get(id)
      }
    }
    return undefined
  }

  async getProactiveSkills(): Promise<SkillHandler[]> {
    if (!this.engineSnapshot) return []
    const results: SkillHandler[] = []
    for (const [id, instance] of this.skills) {
      if (instance.status !== 'active') continue
      if (
        !instance.manifest.triggers.includes('scheduled') &&
        !instance.manifest.triggers.includes('engine_event')
      ) {
        continue
      }
      const handler = this.handlers.get(id)
      if (!handler?.shouldActivate) continue
      try {
        const should = await handler.shouldActivate(this.engineSnapshot)
        if (should) results.push(handler)
      } catch {
        /* ignore */
      }
    }
    return results
  }

  async execute(invocation: SkillInvocation): Promise<SkillResult> {
    const handler = this.handlers.get(invocation.skillId)
    if (!handler) {
      return {
        ok: false,
        output: '',
        error: `Skill '${invocation.skillId}' 未找到`,
        injectToContext: false,
        events: [],
        durationMs: 0
      }
    }
    const instance = this.skills.get(invocation.skillId)
    if (!instance || instance.status !== 'active') {
      return {
        ok: false,
        output: '',
        error: `Skill '${invocation.skillId}' 未激活`,
        injectToContext: false,
        events: [],
        durationMs: 0
      }
    }
    const conflicts = instance.manifest.conflicts ?? []
    for (const conflictId of conflicts) {
      const conflict = this.skills.get(conflictId)
      if (conflict?.status === 'active') {
        return {
          ok: false,
          output: '',
          error: `与 Skill '${conflictId}' 冲突，无法同时执行`,
          injectToContext: false,
          events: [],
          durationMs: 0
        }
      }
    }
    const runtime = invocation.runtime ?? this.runtimeProvider?.() ?? undefined
    const fullInvocation = { ...invocation, runtime }
    return new Promise((resolve) => {
      this.executionQueue = this.executionQueue.then(async () => {
        const start = Date.now()
        try {
          const timeout = instance.manifest.timeoutMs || 30_000
          const result = await Promise.race([
            handler.execute(fullInvocation),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('执行超时')), timeout)
            )
          ])
          instance.executionCount++
          instance.lastExecutedAt = new Date().toISOString()
          this.persistRegistry()
          if (result.ok) {
            publishSkillExecutionTriggered(fullInvocation, instance.manifest)
          }
          for (const event of result.events) {
            this.eventSink?.(event)
          }
          resolve({
            ...result,
            durationMs: Date.now() - start
          })
        } catch (err) {
          instance.lastError = String(err)
          resolve({
            ok: false,
            output: '',
            error: String(err),
            injectToContext: false,
            events: [],
            durationMs: Date.now() - start
          })
        }
      })
    })
  }

  createInvocation(
    skillId: string,
    trigger: SkillTrigger,
    triggerDetail: string,
    args?: Record<string, unknown>,
    userMessage?: string
  ): SkillInvocation | null {
    if (!this.engineSnapshot) return null
    return {
      invocationId: randomUUID(),
      skillId,
      trigger,
      triggerDetail,
      args,
      userMessage,
      snapshot: this.engineSnapshot
    }
  }

  updateEngineSnapshot(snapshot: EngineSnapshot): void {
    this.engineSnapshot = snapshot
  }

  setEventSink(sink: (event: ExtensionEvent) => void): void {
    this.eventSink = sink
  }

  setRuntimeProvider(provider: () => RuntimeContext | null): void {
    this.runtimeProvider = provider
  }

  private persistRegistry(): void {
    const registryPath = join(this.skillsDir, '_registry.json')
    const data = Array.from(this.skills.entries()).map(([id, instance]) => ({
      id,
      manifest: instance.manifest,
      status: instance.status,
      installedAt: instance.installedAt,
      lastError: instance.lastError,
      executionCount: instance.executionCount,
      lastExecutedAt: instance.lastExecutedAt
    }))
    const body = JSON.stringify(data, null, 2)
    writeFileSync(registryPath, body, 'utf-8')
    const dataRoot = join(this.skillsDir, '..', '..')
    if (getDatabase(dataRoot)) {
      kvSet(dataRoot, SKILLS_REGISTRY_KV_NS, SKILLS_REGISTRY_KV_KEY, body)
    }
  }

  loadRegistry(): void {
    const registryPath = join(this.skillsDir, '_registry.json')
    const dataRoot = join(this.skillsDir, '..', '..')
    if (getDatabase(dataRoot)) {
      const blob = kvGet(dataRoot, SKILLS_REGISTRY_KV_NS, SKILLS_REGISTRY_KV_KEY)
      if (blob) {
        try {
          const data = JSON.parse(blob) as Array<{
            id: string
            manifest: SkillManifest
            status: SkillInstance['status']
            installedAt: string
            lastError?: string
            executionCount?: number
            lastExecutedAt?: string
          }>
          for (const entry of data) {
            this.skills.set(entry.id, {
              manifest: entry.manifest,
              status: entry.status,
              installedAt: entry.installedAt,
              lastError: entry.lastError,
              executionCount: entry.executionCount ?? 0,
              lastExecutedAt: entry.lastExecutedAt,
              hooks: {}
            })
          }
          return
        } catch {
          /* fall through */
        }
      }
    }
    if (!existsSync(registryPath)) return
    try {
      const data = JSON.parse(readFileSync(registryPath, 'utf-8')) as Array<{
        id: string
        manifest: SkillManifest
        status: SkillInstance['status']
        installedAt: string
        lastError?: string
        executionCount?: number
        lastExecutedAt?: string
      }>
      for (const entry of data) {
        this.skills.set(entry.id, {
          manifest: entry.manifest,
          status: entry.status,
          installedAt: entry.installedAt,
          lastError: entry.lastError,
          executionCount: entry.executionCount ?? 0,
          lastExecutedAt: entry.lastExecutedAt,
          hooks: {}
        })
      }
      if (getDatabase(dataRoot)) {
        kvSet(dataRoot, SKILLS_REGISTRY_KV_NS, SKILLS_REGISTRY_KV_KEY, readFileSync(registryPath, 'utf-8'))
      }
    } catch {
      /* registry 损坏 */
    }
  }
}
