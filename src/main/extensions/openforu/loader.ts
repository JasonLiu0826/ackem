// [openforu/loader] 鈥?鐢ㄦ埛鑷垱鎵╁睍鍔犺浇鍣?
//
// 鑱岃矗锛?
//   1. 鎵弿 data/openforu/uskills/ 鍜?data/openforu/uplugins/ 鐩綍
//   2. 瑙ｆ瀽 manifest.json锛屾牎楠屾牸寮?
//   3. 灏?uskills 娉ㄥ唽鍒?SkillRegistry锛寀plugins 娉ㄥ唽鍒?PluginRegistry
//   4. uplugin 鍙楅檺鏉冮檺闆嗭紙榛樿浣庝簬瀹樻柟 Plugin锛?
//   5. 鎻愪緵鍚敤/绂佺敤/鍗歌浇鎺ュ彛
//
// 鏋舵瀯锛?
//   ExtensionsCoordinator.boot() 鈫?OpenForULoader.boot()
//     鈫?scanUskills() 鈫?SkillRegistry.register()
//     鈫?scanUplugins() 鈫?PluginRegistry.registerBuiltin()
//
// 瀹夊叏锛?
//   - uplugin 榛樿鏉冮檺闄愬埗涓?readonly + engine_read锛屽叾浠栨潈闄愰渶鐢ㄦ埛閫愰」瀹℃壒
//   - uplugin 杩愯鍦ㄥ彈闄愭矙绠变腑
//   - uskill 鏈川涓?JSON 閰嶇疆锛屼笉鍖呭惈鍙墽琛屼唬鐮侊紝瀹夊叏椋庨櫓浣?

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExtensionOpResult } from '../protocols'
import type { SkillRegistry } from '../skills/registry'
import type { SkillManifest, SkillHandler, SkillInvocation, SkillResult } from '../skills/types'
import type { PluginRegistry } from '../plugins/registry'
import type { PluginManifest, PluginPermission } from '../plugins/types'
import { validateDispatchConfig } from '../dispatch/validateDispatchConfig'
import {
  buildUskillContextInjection,
  buildUskillProactiveMessage,
  buildUskillUserFacing,
  isUskillAutonomousEnabled
} from './uskillRuntime'
import { type UpluginMeta } from './upluginRuntime'
import { UpluginSandboxHost } from './sandbox/upluginSandboxHost'
import type { SandboxHostDeps } from './sandbox/sandboxTypes'
import { resolveUpluginHooks } from './sandbox/resolveUpluginHooks'
import {
  computePermissionState,
  formatPermissionDeniedError,
  type OpenForUPermissionId
} from '../../../shared/openforuPermissions'
import {
  approvedPermissionsFromDecision,
  requestUserPermissionApproval
} from './permissionGate'
import { readRevisionIndex, restoreExtensionRevision } from './refine/revisionStore'

export type DeployUpluginOptions = {
  /** 鍗曟祴 / 鍐呴儴璺緞璺宠繃瀹℃壒寮圭獥 */
  skipApproval?: boolean
}

export type { UpluginMeta } from './upluginRuntime'

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 绫诲瀷
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export interface UskilConfig {
  version: string
  onKeyword?: {
    reply: string
    variables?: Record<string, string[]>
  }
  onFunctionCall?: {
    handler: string | null
  }
  onProactive?: {
    enabled: boolean
    interval?: string
  }
  promptTemplates?: {
    system?: string
    userFacing?: string
    contextInjection?: string
  }
  variables?: Record<string, unknown>
  allowedApiDomains?: string[]
}

export interface UskilInstance {
  manifest: SkillManifest
  config: UskilConfig
  status: 'installed' | 'active' | 'disabled' | 'error'
  lastError?: string
  installedAt: string
  dirPath: string
}

export interface UpluginInstance {
  manifest: PluginManifest
  meta?: UpluginMeta
  status: 'installed' | 'active' | 'disabled' | 'error'
  lastError?: string
  installedAt: string
  dirPath: string
  grantedPermissions: PluginPermission[]
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// OpenForU 鍔犺浇鍣?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export class OpenForULoader {
  private dataRoot: string
  private uskillsDir: string
  private upluginsDir: string
  private skillRegistry: SkillRegistry
  private pluginRegistry: PluginRegistry
  private sandboxHost: UpluginSandboxHost

  private uskills = new Map<string, UskilInstance>()
  private uplugins = new Map<string, UpluginInstance>()

  private persistGrantedToMeta(pluginDir: string, meta: UpluginMeta, granted: PluginPermission[]): UpluginMeta {
    const next: UpluginMeta = { ...meta, grantedPermissions: granted }
    writeFileSync(join(pluginDir, 'plugin.meta.json'), JSON.stringify(next, null, 2), 'utf-8')
    return next
  }

  private resolveGrantedForManifest(
    manifest: PluginManifest,
    meta?: UpluginMeta
  ): {
    granted: PluginPermission[]
    pending: OpenForUPermissionId[]
    forbidden: OpenForUPermissionId[]
  } {
    const state = computePermissionState(manifest.permissions, meta?.grantedPermissions)
    return {
      granted: state.granted as PluginPermission[],
      pending: state.pending,
      forbidden: state.forbidden
    }
  }

  private hasPendingPermissions(instance: UpluginInstance): boolean {
    return this.resolveGrantedForManifest(instance.manifest, instance.meta).pending.length > 0
  }

  constructor(
    dataRoot: string,
    skillRegistry: SkillRegistry,
    pluginRegistry: PluginRegistry,
    sandboxDeps: SandboxHostDeps = {}
  ) {
    this.dataRoot = dataRoot
    const openforuDir = join(dataRoot, 'openforu')
    this.uskillsDir = join(openforuDir, 'uskills')
    this.upluginsDir = join(openforuDir, 'uplugins')
    this.skillRegistry = skillRegistry
    this.pluginRegistry = pluginRegistry
    this.sandboxHost = new UpluginSandboxHost(dataRoot, sandboxDeps)

    mkdirSync(this.uskillsDir, { recursive: true })
    mkdirSync(this.upluginsDir, { recursive: true })
  }

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  // 鍚姩
  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

  async boot(): Promise<ExtensionOpResult> {
    const skillResult = await this.scanUskills()
    const pluginResult = await this.scanUplugins()

    if (!skillResult.ok || !pluginResult.ok) {
      return {
        ok: false,
        error: [skillResult.error, pluginResult.error].filter(Boolean).join('; ')
      }
    }

    return { ok: true }
  }

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  // uskill 鎵弿涓庢敞鍐?
  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

  async scanUskills(): Promise<ExtensionOpResult> {
    if (!existsSync(this.uskillsDir)) return { ok: true }

    const entries = readdirSync(this.uskillsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue

      const skillDir = join(this.uskillsDir, entry.name)
      const manifestPath = join(skillDir, 'manifest.json')
      const configPath = join(skillDir, 'skill.json')

      if (!existsSync(manifestPath)) continue

      try {
        const manifest: SkillManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        const config: UskilConfig = existsSync(configPath)
          ? JSON.parse(readFileSync(configPath, 'utf-8'))
          : { version: '1.0.0' }

        // 鏍￠獙 id 鏍煎紡锛坲/ 鍓嶇紑鏍囪瘑鐢ㄦ埛鑷垱锛?
        if (!manifest.id.startsWith('u/')) {
          continue // 璺宠繃闈?uskill
        }

        const instance: UskilInstance = {
          manifest,
          config,
          status: 'installed',
          installedAt: new Date().toISOString(),
          dirPath: skillDir
        }

        // 娉ㄥ唽涓?SkillHandler锛坲skill 閫氳繃閰嶇疆椹卞姩锛屾棤闇€缂栬瘧浠ｇ爜锛?
        const handler = this.createUskilHandler(instance)
        const regResult = await this.skillRegistry.register(handler)
        if (!regResult.ok) {
          instance.status = 'error'
          instance.lastError = regResult.error
        } else {
          await this.syncUskillActivation(instance)
        }

        this.uskills.set(manifest.id, instance)
      } catch (err) {
        // 璺宠繃鎹熷潖鐨?uskill
        console.error(`[openforu] 鍔犺浇 uskill '${entry.name}' 澶辫触:`, err)
      }
    }

    return { ok: true }
  }

  /** 鍚屾 registry 婵€娲荤姸鎬侊紱甯﹀悎娉?dispatch 鐨勬柊 uskill 鑷姩婵€娲讳互杩涘叆璋冨害 catalog */
  private async syncUskillActivation(instance: UskilInstance): Promise<void> {
    const { manifest } = instance
    const reg = this.skillRegistry.get(manifest.id)
    if (reg?.status === 'active') {
      instance.status = 'active'
      return
    }
    if (reg?.status === 'disabled') {
      instance.status = 'disabled'
      return
    }
    if (reg?.status === 'error') {
      instance.status = 'error'
      instance.lastError = reg.lastError
      return
    }
    // 浠呭棣栨鎵弿銆佸皻鏈縺娲昏繃鐨?installed 鎬佽嚜鍔ㄦ縺娲伙紙灏婇噸鐢ㄦ埛鎵嬪姩鍏抽棴锛?
    if (reg?.status !== 'installed') return
    if (!manifest.dispatch) return
    if (validateDispatchConfig(manifest.dispatch).length > 0) return

    const actResult = await this.skillRegistry.activate(manifest.id)
    if (actResult.ok) instance.status = 'active'
  }

  private syncUpluginRegistryStatus(id: string): void {
    const instance = this.uplugins.get(id)
    const reg = this.pluginRegistry.get(id)
    if (!instance || !reg) return
    if (reg.status === 'active' || reg.status === 'disabled' || reg.status === 'error') {
      instance.status = reg.status
      instance.lastError = reg.lastError
    }
  }

  /** 鍚屾 registry 婵€娲荤姸鎬侊紱甯﹀悎娉?dispatch 鐨勬柊 uplugin 鑷姩婵€娲?*/
  private async syncUpluginActivation(instance: UpluginInstance): Promise<void> {
    const { manifest } = instance
    const reg = this.pluginRegistry.get(manifest.id)
    if (reg?.status === 'active') {
      instance.status = 'active'
      return
    }
    if (reg?.status === 'disabled') {
      instance.status = 'disabled'
      return
    }
    if (reg?.status === 'error') {
      if (Object.keys(reg.hooks).length === 0) {
        instance.status = 'error'
        instance.lastError = reg.lastError
        return
      }
      reg.status = 'installed'
      reg.lastError = undefined
    }
    if (reg?.status !== 'installed') return
    if (!manifest.dispatch) return
    if (validateDispatchConfig(manifest.dispatch).length > 0) return
    if (this.hasPendingPermissions(instance)) return
    if (!instance.meta?.injectTemplate?.trim()) return

    const actResult = await this.pluginRegistry.activate(manifest.id)
    if (actResult.ok) instance.status = 'active'
  }

  /** 涓?uskill 鍒涘缓 SkillHandler锛堜粠閰嶇疆椹卞姩锛屼笉鎵ц浠ｇ爜锛?*/
  private createUskilHandler(instance: UskilInstance): SkillHandler {
    const { manifest, config } = instance
    const autonomousEnabled = isUskillAutonomousEnabled(manifest, config)

    const handler: SkillHandler = {
      manifest,

      execute: async (invocation: SkillInvocation): Promise<SkillResult> => {
        const start = Date.now()
        try {
          if (invocation.trigger === 'scheduled') {
            const output = buildUskillProactiveMessage(manifest, config)
            return {
              ok: true,
              output,
              injectToContext: false,
              events: [],
              durationMs: Date.now() - start
            }
          }

          const injection = buildUskillContextInjection(manifest, config)
          const userFacing = buildUskillUserFacing(manifest, config)

          return {
            ok: true,
            output: userFacing,
            injectToContext: injection.length > 0,
            events: injection.length > 0
              ? [{
                  id: `uskill-${manifest.id}-${Date.now()}`,
                  category: 'skill',
                  sourceId: manifest.id,
                  type: `${manifest.skillType}_triggered`,
                  payload: { config, triggerDetail: invocation.triggerDetail },
                  injectToContext: true,
                  contextInjection: injection,
                  timestamp: new Date().toISOString()
                }]
              : [],
            durationMs: Date.now() - start
          }
        } catch (err) {
          return {
            ok: false,
            output: '',
            error: String(err),
            injectToContext: false,
            events: [],
            durationMs: Date.now() - start
          }
        }
      },

      shouldTrigger: (userMessage: string): boolean => {
        if (!manifest.triggers.includes('keyword')) return false
        if (!manifest.keywords) return false
        const msg = userMessage.toLowerCase()
        return manifest.keywords.some(kw => msg.includes(kw.toLowerCase()))
      }
    }

    if (autonomousEnabled) {
      handler.shouldActivate = async () => true
      handler.getProactiveInvocation = async (snapshot) => ({
        invocationId: `uskill-auto-${Date.now()}`,
        skillId: manifest.id,
        trigger: 'scheduled',
        triggerDetail: 'autonomous:interval',
        snapshot
      })
    }

    return handler
  }

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  // uplugin 鎵弿涓庢敞鍐?
  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

  /** 鑻?live 鐩綍涓㈠け浣?revisions 鏈夊揩鐓э紝浠庢渶鏂?revision 鎭㈠锛堜粎 registry 浠嶇櫥璁拌鎵╁睍鏃讹級 */
  private isUpluginSlugInRegistry(slug: string): boolean {
    for (const p of this.pluginRegistry.listInstalled()) {
      if (!p.manifest.id.startsWith('u/')) continue
      const regSlug = p.manifest.id.replace(/^u\//, '').replace(/@.*$/, '')
      if (regSlug === slug) return true
    }
    return false
  }

  private recoverUpluginsFromRevisions(): void {
    const revRoot = join(this.dataRoot, 'openforu', 'revisions')
    if (!existsSync(revRoot)) return
    for (const slug of readdirSync(revRoot)) {
      if (slug.startsWith('.')) continue
      if (!this.isUpluginSlugInRegistry(slug)) continue
      const liveManifest = join(this.upluginsDir, slug, 'manifest.json')
      if (existsSync(liveManifest)) continue
      const index = readRevisionIndex(this.dataRoot, slug)
      if (!index || index.kind !== 'uplugin' || index.entries.length === 0) continue
      const version = index.entries[0]?.version ?? '1.0.0'
      restoreExtensionRevision(this.dataRoot, 'uplugin', slug, version)
    }
  }

  async scanUplugins(): Promise<ExtensionOpResult> {
    mkdirSync(this.upluginsDir, { recursive: true })
    this.recoverUpluginsFromRevisions()

    const entries = readdirSync(this.upluginsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue

      const pluginDir = join(this.upluginsDir, entry.name)
      const manifestPath = join(pluginDir, 'manifest.json')

      if (!existsSync(manifestPath)) continue

      try {
        const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

        if (!manifest.id.startsWith('u/')) {
          continue
        }

        const metaPath = join(pluginDir, 'plugin.meta.json')
        const meta: UpluginMeta | undefined = existsSync(metaPath)
          ? (JSON.parse(readFileSync(metaPath, 'utf-8')) as UpluginMeta)
          : undefined

        const { granted: grantedPermissions, pending, forbidden } = this.resolveGrantedForManifest(
          manifest,
          meta
        )

        if (forbidden.length > 0) {
          this.uplugins.set(manifest.id, {
            manifest,
            meta,
            status: 'error',
            lastError: `绂佹鐢宠鐨勬潈闄愶細${forbidden.join('銆?)}`,
            installedAt: new Date().toISOString(),
            dirPath: pluginDir,
            grantedPermissions
          })
          continue
        }

        const effectiveGranted =
          grantedPermissions.length > 0
            ? grantedPermissions
            : (['readonly', 'engine_read'] as PluginPermission[])

        const hookResolution = await resolveUpluginHooks(
          pluginDir,
          manifest,
          meta,
          effectiveGranted,
          this.sandboxHost
        )
        if (!hookResolution.ok) {
          this.uplugins.set(manifest.id, {
            manifest,
            meta,
            status: 'error',
            lastError: hookResolution.error,
            installedAt: new Date().toISOString(),
            dirPath: pluginDir,
            grantedPermissions
          })
          continue
        }

        const regResult = await this.pluginRegistry.registerBuiltin(
          manifest,
          hookResolution.hooks,
          effectiveGranted
        )

        if (!regResult.ok) {
          this.uplugins.set(manifest.id, {
            manifest,
            meta,
            status: 'error',
            lastError: regResult.error,
            installedAt: new Date().toISOString(),
            dirPath: pluginDir,
            grantedPermissions
          })
          continue
        }

        const instance: UpluginInstance = {
          manifest,
          meta,
          status: pending.length > 0 ? 'installed' : 'installed',
          installedAt: new Date().toISOString(),
          dirPath: pluginDir,
          grantedPermissions
        }
        this.uplugins.set(manifest.id, instance)
        if (pending.length === 0) {
          await this.syncUpluginActivation(instance)
        }
      } catch (err) {
        console.error(`[openforu] 鍔犺浇 uplugin '${entry.name}' 澶辫触:`, err)
      }
    }

    return { ok: true }
  }

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  // 鏌ヨ
  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

  listUskills(): UskilInstance[] {
    return Array.from(this.uskills.values())
  }

  listUplugins(): UpluginInstance[] {
    return Array.from(this.uplugins.values())
  }

  getUskil(id: string): UskilInstance | undefined {
    return this.uskills.get(id)
  }

  getUplugin(id: string): UpluginInstance | undefined {
    return this.uplugins.get(id)
  }

  /** 鍒楀嚭鎵€鏈夊凡瀹夎鐨勭敤鎴锋墿灞曪紙鍚堝苟 uskills + uplugins锛?*/
  listAll(): Array<{ type: 'uskill' | 'uplugin'; instance: UskilInstance | UpluginInstance }> {
    return [
      ...Array.from(this.uskills.values()).map(i => ({ type: 'uskill' as const, instance: i })),
      ...Array.from(this.uplugins.values()).map(i => ({ type: 'uplugin' as const, instance: i }))
    ]
  }

  /** 鑾峰彇闇€瑕佺敤鎴峰鎵圭殑鏉冮檺鍒楄〃 */
  getPendingApprovals(): Array<{
    pluginId: string
    pluginName: string
    permissions: PluginPermission[]
    reasons: string[]
  }> {
    const result: Array<{
      pluginId: string
      pluginName: string
      permissions: PluginPermission[]
      reasons: string[]
    }> = []
    for (const [id, instance] of this.uplugins) {
      const { pending } = this.resolveGrantedForManifest(instance.manifest, instance.meta)
      if (pending.length > 0) {
        result.push({
          pluginId: id,
          pluginName: instance.manifest.name,
          permissions: pending as PluginPermission[],
          reasons: pending.map((p) => {
            switch (p) {
              case 'network_outbound': return '闇€瑕佽闂閮?API'
              case 'clipboard_read': return '闇€瑕佽鍙栧壀璐存澘鍐呭'
              case 'foreground_detect': return '闇€瑕佹娴嬪墠鍙扮獥鍙ｆ爣棰?
              case 'data_write': return '闇€瑕佸啓鍏ユ暟鎹埌纾佺洏'
              case 'system_notification': return '闇€瑕佸彂閫佺郴缁熼€氱煡'
              case 'engine_inject': return '闇€瑕佸悜瀵硅瘽涓婁笅鏂囨敞鍏ユ彁绀?
              default: return `闇€瑕?${p} 鏉冮檺`
            }
          })
        })
      }
    }
    return result
  }

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  // 鐢熷懡鍛ㄦ湡绠＄悊
  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

  /** 鍚敤 uskill */
  async activateUskil(id: string): Promise<ExtensionOpResult> {
    const instance = this.uskills.get(id)
    if (!instance) return { ok: false, error: `uskill '${id}' 鏈畨瑁卄 }

    const handler = this.createUskilHandler(instance)
    const regResult = await this.skillRegistry.register(handler)
    if (!regResult.ok) return regResult

    const actResult = await this.skillRegistry.activate(id)
    if (!actResult.ok) return actResult

    instance.status = 'active'
    return { ok: true }
  }

  /** 绂佺敤 uskill */
  async deactivateUskil(id: string): Promise<ExtensionOpResult> {
    const instance = this.uskills.get(id)
    if (!instance) return { ok: false, error: `uskill '${id}' 鏈畨瑁卄 }

    const result = await this.skillRegistry.deactivate(id)
    if (result.ok) instance.status = 'disabled'
    return result
  }

  /** 鍒犻櫎 uskill锛堝垹闄ょ洰褰?+ 浠庢敞鍐岃〃绉婚櫎锛?*/
  async removeUskil(id: string): Promise<ExtensionOpResult> {
    if (!this.uskills.get(id)) {
      await this.scanUskills()
    }
    const instance = this.uskills.get(id)
    const slug = id.replace(/^u\//, '').replace(/@.*$/, '')
    const dirPath = instance?.dirPath ?? join(this.uskillsDir, slug)

    await this.skillRegistry.unregister(id)
    try {
      const { rmSync } = await import('node:fs')
      rmSync(dirPath, { recursive: true, force: true })
    } catch { /* 鐩綍鍙兘宸插垹闄?*/ }
    this.uskills.delete(id)
    return { ok: true }
  }

  /**
   * 浠庣鐩橀噸杞?manifest / main.ts / meta锛屽埛鏂?hooks锛堟棤闇€閲嶅惎 Ackem锛夈€?
   * 鎵╁睍涓績銆屽惎鐢ㄣ€嶅墠浼氳嚜鍔ㄨ皟鐢ㄣ€?
   */
  async reloadUpluginFromDisk(id: string): Promise<ExtensionOpResult & { mode?: 'worker' | 'inject' }> {
    let instance = this.uplugins.get(id)
    if (!instance) {
      await this.scanUplugins()
      instance = this.uplugins.get(id)
    }
    if (!instance) return { ok: false, error: `uplugin '${id}' 鏈畨瑁卄 }

    const pluginDir = instance.dirPath
    const manifestPath = join(pluginDir, 'manifest.json')
    if (!existsSync(manifestPath)) {
      return { ok: false, error: 'manifest.json 缂哄け' }
    }

    const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    const metaPath = join(pluginDir, 'plugin.meta.json')
    const meta: UpluginMeta | undefined = existsSync(metaPath)
      ? (JSON.parse(readFileSync(metaPath, 'utf-8')) as UpluginMeta)
      : undefined

    const { granted: effectiveGranted } = this.resolveGrantedForManifest(manifest, meta)
    instance.grantedPermissions = effectiveGranted

    this.sandboxHost.terminate(id)

    const hookResolution = await resolveUpluginHooks(
      pluginDir,
      manifest,
      meta,
      effectiveGranted,
      this.sandboxHost
    )
    if (!hookResolution.ok) {
      instance.status = 'error'
      instance.lastError = hookResolution.error
      return { ok: false, error: hookResolution.error }
    }

    const reg = this.pluginRegistry.get(id)
    if (reg) {
      reg.hooks = hookResolution.hooks
      reg.manifest = manifest
      if (reg.status === 'error') {
        reg.status = 'installed'
        reg.lastError = undefined
      }
    } else {
      const regResult = await this.pluginRegistry.registerBuiltin(
        manifest,
        hookResolution.hooks,
        effectiveGranted
      )
      if (!regResult.ok) {
        return { ok: false, error: regResult.error }
      }
    }

    instance.manifest = manifest
    instance.meta = meta
    instance.lastError = undefined
    if (instance.status === 'error') instance.status = 'installed'

    return { ok: true, mode: hookResolution.mode }
  }

  /** 鍚敤 uplugin锛堝厛閲嶈浇纾佺洏鍐嶆縺娲伙級 */
  async activateUplugin(id: string): Promise<ExtensionOpResult> {
    const reload = await this.reloadUpluginFromDisk(id)
    if (!reload.ok) return reload

    const instance = this.uplugins.get(id)
    if (!instance) return { ok: false, error: `uplugin '${id}' 鏈畨瑁卄 }

    if (this.hasPendingPermissions(instance)) {
      const { pending } = this.resolveGrantedForManifest(instance.manifest, instance.meta)
      return { ok: false, error: formatPermissionDeniedError(pending) }
    }

    const result = await this.pluginRegistry.activate(id)
    if (result.ok) instance.status = 'active'
    return result
  }

  /** 绂佺敤 uplugin */
  async deactivateUplugin(id: string): Promise<ExtensionOpResult> {
    const instance = this.uplugins.get(id)
    if (!instance) return { ok: false, error: `uplugin '${id}' 鏈畨瑁卄 }

    const result = await this.pluginRegistry.deactivate(id)
    if (result.ok) instance.status = 'disabled'
    return result
  }

  /** 鍒犻櫎 uplugin锛堝垹闄ょ洰褰?+ 浠庢敞鍐岃〃绉婚櫎锛?*/
  async removeUplugin(id: string): Promise<ExtensionOpResult> {
    if (!this.uplugins.get(id)) {
      await this.scanUplugins()
    }
    const instance = this.uplugins.get(id)
    const slug = id.replace(/^u\//, '').replace(/@.*$/, '')
    const dirPath = instance?.dirPath ?? join(this.upluginsDir, slug)

    this.sandboxHost.terminate(id)
    await this.pluginRegistry.forgetRegistryEntry(id)
    try {
      const { rmSync } = await import('node:fs')
      rmSync(dirPath, { recursive: true, force: true })
    } catch { /* 鐩綍鍙兘宸插垹闄?*/ }
    this.uplugins.delete(id)
    return { ok: true }
  }

  /** 瀹℃壒 uplugin 鐨勫崌绾ф潈闄?*/
  async approvePermission(pluginId: string, permission: PluginPermission): Promise<ExtensionOpResult> {
    const instance = this.uplugins.get(pluginId)
    if (!instance) return { ok: false, error: `uplugin '${pluginId}' 鏈畨瑁卄 }

    if (!instance.manifest.permissions.includes(permission)) {
      return { ok: false, error: `uplugin 鏈姹?${permission} 鏉冮檺` }
    }

    if (instance.grantedPermissions.includes(permission)) {
      return { ok: true }
    }

    instance.grantedPermissions = [...instance.grantedPermissions, permission]
    if (instance.meta) {
      instance.meta = this.persistGrantedToMeta(
        instance.dirPath,
        instance.meta,
        instance.grantedPermissions
      )
    }
    return { ok: true }
  }

  /** 鎵╁睍涓績锛氭壒鍑嗗叏閮?pending 骞堕噸杞芥縺娲?*/
  async approveAllPendingAndActivate(pluginId: string): Promise<ExtensionOpResult> {
    let instance = this.uplugins.get(pluginId)
    if (!instance) {
      await this.scanUplugins()
      instance = this.uplugins.get(pluginId)
    }
    if (!instance) return { ok: false, error: `uplugin '${pluginId}' 鏈畨瑁卄 }

    const { pending } = this.resolveGrantedForManifest(instance.manifest, instance.meta)
    for (const p of pending) {
      const r = await this.approvePermission(pluginId, p as PluginPermission)
      if (!r.ok) return r
    }
    return this.activateUplugin(pluginId)
  }

  getUskillsDir(): string { return this.uskillsDir }
  getUpluginsDir(): string { return this.upluginsDir }

  /** 鍐欏叆 uskill 鏂囦欢骞舵敞鍐?+ 婵€娲伙紙OF-04 閮ㄧ讲锛?*/
  async deployUskill(
    dirName: string,
    manifest: SkillManifest,
    config: UskilConfig
  ): Promise<ExtensionOpResult & { id?: string }> {
    const skillDir = join(this.uskillsDir, dirName)
    mkdirSync(skillDir, { recursive: true })

    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')
    writeFileSync(join(skillDir, 'skill.json'), JSON.stringify(config, null, 2), 'utf-8')

    const existing = this.uskills.get(manifest.id)
    if (existing) {
      await this.skillRegistry.unregister(manifest.id)
      this.uskills.delete(manifest.id)
    }

    const instance: UskilInstance = {
      manifest,
      config,
      status: 'installed',
      installedAt: new Date().toISOString(),
      dirPath: skillDir
    }

    const handler = this.createUskilHandler(instance)
    const regResult = await this.skillRegistry.register(handler)
    if (!regResult.ok) {
      instance.status = 'error'
      instance.lastError = regResult.error
      this.uskills.set(manifest.id, instance)
      return { ok: false, error: regResult.error }
    }

    const actResult = await this.skillRegistry.activate(manifest.id)
    if (!actResult.ok) {
      instance.status = 'error'
      instance.lastError = actResult.error
      this.uskills.set(manifest.id, instance)
      return { ok: false, error: actResult.error }
    }

    instance.status = 'active'
    this.uskills.set(manifest.id, instance)
    return { ok: true, id: manifest.id }
  }

  /** 鍐欏叆 uplugin 鏂囦欢骞舵敞鍐?+ 婵€娲伙紙OF-06 閮ㄧ讲锛?*/
  async deployUplugin(
    dirName: string,
    manifest: PluginManifest,
    meta: UpluginMeta,
    extraFiles?: Record<string, string>,
    opts?: DeployUpluginOptions
  ): Promise<ExtensionOpResult & { id?: string; code?: string }> {
    const pluginDir = join(this.upluginsDir, dirName)
    mkdirSync(pluginDir, { recursive: true })

    const files: Record<string, string> = {
      'manifest.json': JSON.stringify(manifest, null, 2),
      'plugin.meta.json': JSON.stringify(meta, null, 2),
      ...extraFiles
    }
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(pluginDir, name), content, 'utf-8')
    }

    let workingMeta = meta
    let { granted: grantedPermissions, pending, forbidden } = this.resolveGrantedForManifest(
      manifest,
      meta
    )

    if (forbidden.length > 0) {
      const err = `绂佹鐢宠鐨勬潈闄愶細${forbidden.join('銆?)}`
      const instance: UpluginInstance = {
        manifest,
        meta: workingMeta,
        status: 'error',
        lastError: err,
        installedAt: new Date().toISOString(),
        dirPath: pluginDir,
        grantedPermissions
      }
      this.uplugins.set(manifest.id, instance)
      return { ok: false, error: err, code: 'permission_forbidden' }
    }

    if (pending.length > 0 && !opts?.skipApproval) {
      const decision = await requestUserPermissionApproval(
        {
          pluginId: manifest.id,
          pluginName: manifest.name,
          permissions: pending,
          tier: pending.some((p) =>
            ['network_outbound', 'system_notification', 'data_write'].includes(p)
          )
            ? 'T2'
            : 'T1',
          source: 'deploy'
        },
        { skip: opts?.skipApproval }
      )

      if (decision !== 'approved') {
        const err = formatPermissionDeniedError(pending)
        const instance: UpluginInstance = {
          manifest,
          meta: workingMeta,
          status: 'installed',
          lastError: err,
          installedAt: new Date().toISOString(),
          dirPath: pluginDir,
          grantedPermissions
        }
        this.uplugins.set(manifest.id, instance)
        return { ok: false, error: err, code: 'permission_denied' }
      }

      const approved = approvedPermissionsFromDecision(decision, pending) as PluginPermission[]
      grantedPermissions = [
        ...new Set([...grantedPermissions, ...approved])
      ] as PluginPermission[]
      workingMeta = this.persistGrantedToMeta(pluginDir, workingMeta, grantedPermissions)
      pending = []
    }

    const effectiveGranted =
      grantedPermissions.length > 0
        ? grantedPermissions
        : (['readonly', 'engine_read'] as PluginPermission[])

    const hookResolution = await resolveUpluginHooks(
      pluginDir,
      manifest,
      workingMeta,
      effectiveGranted,
      this.sandboxHost
    )
    if (!hookResolution.ok) {
      const instance: UpluginInstance = {
        manifest,
        meta: workingMeta,
        status: 'error',
        lastError: hookResolution.error,
        installedAt: new Date().toISOString(),
        dirPath: pluginDir,
        grantedPermissions: effectiveGranted
      }
      this.uplugins.set(manifest.id, instance)
      return { ok: false, error: hookResolution.error }
    }

    const existing = this.uplugins.get(manifest.id)
    if (existing) {
      this.sandboxHost.terminate(manifest.id)
    }
    if (existing?.status === 'active') {
      await this.pluginRegistry.deactivate(manifest.id)
    }

    const regResult = await this.pluginRegistry.registerBuiltin(
      manifest,
      hookResolution.hooks,
      effectiveGranted
    )
    if (!regResult.ok) {
      const instance: UpluginInstance = {
        manifest,
        meta: workingMeta,
        status: 'error',
        lastError: regResult.error,
        installedAt: new Date().toISOString(),
        dirPath: pluginDir,
        grantedPermissions: effectiveGranted
      }
      this.uplugins.set(manifest.id, instance)
      return { ok: false, error: regResult.error }
    }

    const instance: UpluginInstance = {
      manifest,
      meta: workingMeta,
      status: 'installed',
      installedAt: new Date().toISOString(),
      dirPath: pluginDir,
      grantedPermissions: effectiveGranted
    }
    this.uplugins.set(manifest.id, instance)

    const actResult = await this.pluginRegistry.activate(manifest.id)
    if (!actResult.ok) {
      instance.status = 'error'
      instance.lastError = actResult.error
      this.uplugins.set(manifest.id, instance)
      return { ok: false, error: actResult.error }
    }

    instance.status = 'active'
    this.uplugins.set(manifest.id, instance)
    return { ok: true, id: manifest.id }
  }
}
