// [ecosystem/communityLoader] 鈥?community/ 绛惧悕鎵╁睍鎵弿涓庢敞鍐?

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ExtensionOpResult } from '../protocols'
import { validateDispatchConfig } from '../dispatch/validateDispatchConfig'
import type { SkillRegistry } from '../skills/registry'
import type { SkillHandler, SkillInvocation, SkillManifest, SkillResult } from '../skills/types'
import type { PluginRegistry } from '../plugins/registry'
import type { PluginManifest, PluginPermission } from '../plugins/types'
import {
  buildUskillContextInjection,
  buildUskillProactiveMessage,
  buildUskillUserFacing,
  isUskillAutonomousEnabled
} from '../openforu/uskillRuntime'
import { createUpluginLifecycleHooks, type UpluginMeta } from '../openforu/upluginRuntime'
import { resolveUpluginHooks } from '../openforu/sandbox/resolveUpluginHooks'
import { UpluginSandboxHost } from '../openforu/sandbox/upluginSandboxHost'
import type { SandboxHostDeps } from '../openforu/sandbox/sandboxTypes'
import type { UskilConfig } from '../openforu/loader'
import {
  COMMUNITY_EXTENSIONS_REL,
  NAMESPACE_COMMUNITY,
  SIGNATURE_SIDECAR_FILENAME
} from './constants'
import { communityPluginsDir, communitySkillsDir } from './install'
import { validateExtensionManifest } from './manifestValidate'
import { isCommunityExtensionId } from './extensionId'
import type { AckemSignatureSidecar } from './signature'
import { sha256Digest, verifyFileDigests, verifySignatureSidecar } from './signature'
import { resolvePublisherPublicKey, publisherScopeAllowed } from './trustStore'
import { isCommunityExtensionsOpen } from '../../../shared/communityExtensionFeature'

export interface CommunitySkillInstance {
  manifest: SkillManifest
  config: UskilConfig
  status: 'installed' | 'active' | 'disabled' | 'error'
  lastError?: string
  installedAt: string
  dirPath: string
  publisherId: string
}

export interface CommunityPluginInstance {
  manifest: PluginManifest
  meta?: UpluginMeta
  status: 'installed' | 'active' | 'disabled' | 'error'
  lastError?: string
  installedAt: string
  dirPath: string
  publisherId: string
  grantedPermissions: PluginPermission[]
}

function listBundleFiles(dirPath: string, relative = ''): Record<string, string> {
  const files: Record<string, string> = {}
  for (const entry of readdirSync(join(dirPath, relative), { withFileTypes: true })) {
    if (entry.name === SIGNATURE_SIDECAR_FILENAME) continue
    const rel = relative ? `${relative}/${entry.name}` : entry.name
    const abs = join(dirPath, rel)
    if (entry.isDirectory()) {
      Object.assign(files, listBundleFiles(dirPath, rel))
    } else if (entry.isFile()) {
      files[rel.replace(/\\/g, '/')] = readFileSync(abs, 'utf-8')
    }
  }
  return files
}

export function verifyInstalledCommunityBundle(
  dataRoot: string,
  dirPath: string
): { ok: true; sidecar: AckemSignatureSidecar } | { ok: false; error: string } {
  const sidecarPath = join(dirPath, SIGNATURE_SIDECAR_FILENAME)
  if (!existsSync(sidecarPath)) {
    return { ok: false, error: `缂哄皯绛惧悕鏂囦欢 ${SIGNATURE_SIDECAR_FILENAME}` }
  }
  let sidecar: AckemSignatureSidecar
  try {
    sidecar = JSON.parse(readFileSync(sidecarPath, 'utf-8')) as AckemSignatureSidecar
  } catch {
    return { ok: false, error: '绛惧悕鏂囦欢 JSON 鏃犳晥' }
  }

  const files = listBundleFiles(dirPath)
  const digestCheck = verifyFileDigests(sidecar, files)
  if (!digestCheck.ok) return { ok: false, error: digestCheck.error }

  const publisher = resolvePublisherPublicKey(dataRoot, sidecar.publisherId)
  if (!publisher) {
    return { ok: false, error: `鏈俊浠荤殑鍙戝竷鑰? ${sidecar.publisherId}` }
  }
  if (!publisherScopeAllowed(publisher, sidecar.manifestId)) {
    return { ok: false, error: `鍙戝竷鑰呮棤鏉冩彁渚?${sidecar.manifestId}` }
  }
  const sigCheck = verifySignatureSidecar(sidecar, publisher.publicKey)
  if (!sigCheck.ok) return { ok: false, error: sigCheck.error }

  const manifestPath = join(dirPath, 'manifest.json')
  if (!existsSync(manifestPath)) return { ok: false, error: '缂哄皯 manifest.json' }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { id?: string }
  if (manifest.id !== sidecar.manifestId) {
    return { ok: false, error: 'manifest.id 涓庣鍚?manifestId 涓嶄竴鑷? }
  }

  // 浜屾鏍￠獙 manifest.json 鎽樿
  const manifestDigest = sha256Digest(readFileSync(manifestPath, 'utf-8'))
  if (sidecar.fileDigests['manifest.json'] && sidecar.fileDigests['manifest.json'] !== manifestDigest) {
    return { ok: false, error: 'manifest.json 宸茶绡℃敼' }
  }

  return { ok: true, sidecar }
}

export class CommunityExtensionLoader {
  private skills = new Map<string, CommunitySkillInstance>()
  private plugins = new Map<string, CommunityPluginInstance>()
  private sandboxHost: UpluginSandboxHost

  constructor(
    private readonly dataRoot: string,
    private readonly skillRegistry: SkillRegistry,
    private readonly pluginRegistry: PluginRegistry,
    sandboxDeps: SandboxHostDeps = {}
  ) {
    mkdirSync(join(dataRoot, COMMUNITY_EXTENSIONS_REL), { recursive: true })
    this.sandboxHost = new UpluginSandboxHost(dataRoot, sandboxDeps)
  }

  listSkills(): CommunitySkillInstance[] {
    return [...this.skills.values()]
  }

  listPlugins(): CommunityPluginInstance[] {
    return [...this.plugins.values()]
  }

  getSkill(id: string): CommunitySkillInstance | undefined {
    return this.skills.get(id)
  }

  getPlugin(id: string): CommunityPluginInstance | undefined {
    return this.plugins.get(id)
  }

  async boot(): Promise<ExtensionOpResult> {
    if (!isCommunityExtensionsOpen()) {
      return { ok: true }
    }
    const skillResult = await this.scanSkills()
    const pluginResult = await this.scanPlugins()
    if (!skillResult.ok || !pluginResult.ok) {
      return {
        ok: false,
        error: [skillResult.error, pluginResult.error].filter(Boolean).join('; ')
      }
    }
    return { ok: true }
  }

  async scanSkills(): Promise<ExtensionOpResult> {
    const dir = communitySkillsDir(this.dataRoot)
    mkdirSync(dir, { recursive: true })
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue
      await this.loadSkillDir(join(dir, entry.name))
    }
    return { ok: true }
  }

  async scanPlugins(): Promise<ExtensionOpResult> {
    const dir = communityPluginsDir(this.dataRoot)
    mkdirSync(dir, { recursive: true })
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue
      await this.loadPluginDir(join(dir, entry.name))
    }
    return { ok: true }
  }

  private async loadSkillDir(skillDir: string): Promise<void> {
    const manifestPath = join(skillDir, 'manifest.json')
    if (!existsSync(manifestPath)) return

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillManifest
      if (!isCommunityExtensionId(manifest.id)) return

      const sig = verifyInstalledCommunityBundle(this.dataRoot, skillDir)
      if (!sig.ok) {
        this.skills.set(manifest.id, {
          manifest,
          config: { version: '1.0.0' },
          status: 'error',
          lastError: sig.error,
          installedAt: new Date().toISOString(),
          dirPath: skillDir,
          publisherId: 'unknown'
        })
        return
      }

      const manifestCheck = validateExtensionManifest(manifest, { requireEngineApiVersion: true })
      if (!manifestCheck.ok) {
        this.skills.set(manifest.id, {
          manifest,
          config: { version: '1.0.0' },
          status: 'error',
          lastError: manifestCheck.errors.join('; '),
          installedAt: new Date().toISOString(),
          dirPath: skillDir,
          publisherId: sig.sidecar.publisherId
        })
        return
      }

      const configPath = join(skillDir, 'skill.json')
      const config: UskilConfig = existsSync(configPath)
        ? (JSON.parse(readFileSync(configPath, 'utf-8')) as UskilConfig)
        : { version: '1.0.0' }

      const instance: CommunitySkillInstance = {
        manifest,
        config,
        status: 'installed',
        installedAt: sig.sidecar.signedAt,
        dirPath: skillDir,
        publisherId: sig.sidecar.publisherId
      }

      const handler = this.createCommunitySkillHandler(instance)
      const reg = await this.skillRegistry.register(handler)
      if (!reg.ok) {
        instance.status = 'error'
        instance.lastError = reg.error
      } else {
        await this.syncSkillActivation(instance)
      }
      this.skills.set(manifest.id, instance)
    } catch (err) {
      console.error('[community] 鍔犺浇 skill 澶辫触:', err)
    }
  }

  private async loadPluginDir(pluginDir: string): Promise<void> {
    const manifestPath = join(pluginDir, 'manifest.json')
    if (!existsSync(manifestPath)) return

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PluginManifest
      if (!isCommunityExtensionId(manifest.id)) return

      const sig = verifyInstalledCommunityBundle(this.dataRoot, pluginDir)
      if (!sig.ok) {
        this.plugins.set(manifest.id, {
          manifest,
          status: 'error',
          lastError: sig.error,
          installedAt: new Date().toISOString(),
          dirPath: pluginDir,
          publisherId: 'unknown',
          grantedPermissions: ['readonly', 'engine_read']
        })
        return
      }

      const manifestCheck = validateExtensionManifest(manifest, { requireEngineApiVersion: true })
      if (!manifestCheck.ok) {
        this.plugins.set(manifest.id, {
          manifest,
          status: 'error',
          lastError: manifestCheck.errors.join('; '),
          installedAt: new Date().toISOString(),
          dirPath: pluginDir,
          publisherId: sig.sidecar.publisherId,
          grantedPermissions: ['readonly', 'engine_read']
        })
        return
      }

      const metaPath = join(pluginDir, 'plugin.meta.json')
      const meta: UpluginMeta | undefined = existsSync(metaPath)
        ? (JSON.parse(readFileSync(metaPath, 'utf-8')) as UpluginMeta)
        : undefined

      const granted = (meta?.grantedPermissions?.length
        ? meta.grantedPermissions
        : ['readonly', 'engine_read']) as PluginPermission[]

      const hookResolution = await resolveUpluginHooks(
        pluginDir,
        manifest,
        meta,
        granted,
        this.sandboxHost
      )

      const instance: CommunityPluginInstance = {
        manifest,
        meta,
        status: 'installed',
        installedAt: sig.sidecar.signedAt,
        dirPath: pluginDir,
        publisherId: sig.sidecar.publisherId,
        grantedPermissions: granted
      }

      if (!hookResolution.ok) {
        instance.status = 'error'
        instance.lastError = hookResolution.error
        this.plugins.set(manifest.id, instance)
        return
      }

      const hooks =
        Object.keys(hookResolution.hooks).length > 0
          ? hookResolution.hooks
          : meta
            ? createUpluginLifecycleHooks(manifest, meta)
            : {}

      const reg = await this.pluginRegistry.registerBuiltin(manifest, hooks, granted)
      if (!reg.ok) {
        instance.status = 'error'
        instance.lastError = reg.error
      } else {
        await this.syncPluginActivation(instance)
      }
      this.plugins.set(manifest.id, instance)
    } catch (err) {
      console.error('[community] 鍔犺浇 plugin 澶辫触:', err)
    }
  }

  private createCommunitySkillHandler(instance: CommunitySkillInstance): SkillHandler {
    const { manifest, config } = instance
    const autonomousEnabled = isUskillAutonomousEnabled(manifest, config)

    const handler: SkillHandler = {
      manifest,
      execute: async (invocation: SkillInvocation): Promise<SkillResult> => {
        const start = Date.now()
        try {
          if (invocation.trigger === 'scheduled') {
            return {
              ok: true,
              output: buildUskillProactiveMessage(manifest, config),
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
                  id: `community-skill-${manifest.id}-${Date.now()}`,
                  category: 'skill',
                  sourceId: manifest.id,
                  type: `${manifest.skillType}_triggered`,
                  payload: { triggerDetail: invocation.triggerDetail, namespace: NAMESPACE_COMMUNITY },
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
      shouldTrigger: (userMessage: string) => {
        if (!manifest.triggers?.includes('keyword') || !manifest.keywords?.length) return false
        const msg = userMessage.toLowerCase()
        return manifest.keywords.some((kw) => msg.includes(kw.toLowerCase()))
      }
    }

    if (autonomousEnabled) {
      handler.shouldActivate = async () => true
      handler.getProactiveInvocation = async (snapshot) => ({
        invocationId: `community-auto-${Date.now()}`,
        skillId: manifest.id,
        trigger: 'scheduled',
        triggerDetail: 'autonomous:interval',
        snapshot
      })
    }

    return handler
  }

  private async syncSkillActivation(instance: CommunitySkillInstance): Promise<void> {
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
    if (reg?.status !== 'installed' || !manifest.dispatch) return
    if (validateDispatchConfig(manifest.dispatch).length > 0) return
    const act = await this.skillRegistry.activate(manifest.id)
    if (act.ok) instance.status = 'active'
  }

  private async syncPluginActivation(instance: CommunityPluginInstance): Promise<void> {
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
      instance.status = 'error'
      instance.lastError = reg.lastError
      return
    }
    if (reg?.status !== 'installed' || !manifest.dispatch) return
    if (validateDispatchConfig(manifest.dispatch).length > 0) return
    const act = await this.pluginRegistry.activate(manifest.id)
    if (act.ok) instance.status = 'active'
  }
}
