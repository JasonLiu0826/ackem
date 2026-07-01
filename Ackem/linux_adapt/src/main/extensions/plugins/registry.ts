// [extensions/plugins/registry] — 插件注册表与生命周期管理
//
// 职责：
//   1. 插件的安装、激活、禁用、卸载
//   2. 权限审批与沙箱隔离
//   3. 插件间依赖解析
//   4. 与核心引擎的边界：只通过 ExtensionEvent 通信，不直接修改引擎

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EngineSnapshot, ExtensionEvent, ExtensionOpResult } from '../protocols'
import type { ExtensionLifecycleHooks } from '../protocols'
import type {
  PluginManifest,
  PluginInstance,
  PluginPackage,
  PluginPermission,
  PluginSandboxApi,
  PluginStatus,
  PluginType
} from './types'
import { CORE_EXTENSION_DEACTIVATE_ERROR, isCorePlugin } from '../../../shared/coreExtensions'
import { kvGet, kvSet } from '../../db/repos/kv'
import { getDatabase } from '../../db/database'

const PLUGINS_REGISTRY_KV_NS = 'extensions.plugins.registry'
const PLUGINS_REGISTRY_KV_KEY = 'entries'

// ═══════════════════════════════════════════════════════════════
// 权限分级定义
// ═══════════════════════════════════════════════════════════════

const PERMISSION_LEVELS: Record<PluginPermission, { level: number; requiresApproval: boolean; description: string }> = {
  readonly:              { level: 0, requiresApproval: false,  description: '读取自身数据目录' },
  data_write:            { level: 1, requiresApproval: true,   description: '写入数据目录（staging/ 和自身目录）' },
  engine_read:           { level: 1, requiresApproval: true,   description: '读取伴侣的情绪和记忆状态' },
  engine_inject:         { level: 2, requiresApproval: true,   description: '向对话上下文注入文本' },
  network_outbound:      { level: 2, requiresApproval: true,   description: '发起网络请求' },
  system_notification:   { level: 2, requiresApproval: true,   description: '发送系统通知' },
  clipboard_read:        { level: 3, requiresApproval: true,   description: '读取剪贴板内容（每次需确认）' },
  foreground_detect:     { level: 3, requiresApproval: true,   description: '检测前台窗口标题' }
}

// ═══════════════════════════════════════════════════════════════
// 注册表
// ═══════════════════════════════════════════════════════════════

const AUTONOMOUS_PLUGIN_TICK_TIMEOUT_MS = 8_000

export class PluginRegistry {
  private plugins = new Map<string, PluginInstance>()
  private pluginsDir: string
  private engineSnapshot: EngineSnapshot | null = null
  private eventSink: ((event: ExtensionEvent) => void) | null = null

  constructor(pluginsDir: string) {
    this.pluginsDir = pluginsDir
    mkdirSync(pluginsDir, { recursive: true })
  }

  // ═══════════════════════════════════════════════════════════
  // 安装
  // ═══════════════════════════════════════════════════════════

  /** 从插件包安装 */
  async install(pkg: PluginPackage, approvedPermissions?: PluginPermission[]): Promise<ExtensionOpResult> {
    const { manifest, files } = pkg

    // 校验 id 格式
    if (!/^[a-z0-9_-]+\/[a-z0-9_-]+@\d+\.\d+\.\d+$/i.test(manifest.id)) {
      return { ok: false, error: `无效的插件 ID 格式: ${manifest.id}。应为 scope/name@version` }
    }

    // 检查已安装
    const existing = this.plugins.get(manifest.id)
    if (existing) {
      return { ok: false, error: `插件 '${manifest.id}' 已安装（状态: ${existing.status}）` }
    }

    // 检查依赖
    if (manifest.dependencies) {
      for (const depId of manifest.dependencies) {
        if (!this.plugins.has(depId)) {
          return { ok: false, error: `缺少依赖: ${depId}` }
        }
        const dep = this.plugins.get(depId)!
        if (dep.status !== 'active') {
          return { ok: false, error: `依赖 '${depId}' 未激活（状态: ${dep.status}）` }
        }
      }
    }

    // 写文件到插件目录
    const pluginDir = join(this.pluginsDir, this.sanitizeDirName(manifest.id))
    try {
      mkdirSync(pluginDir, { recursive: true })
      for (const [relPath, content] of Object.entries(files)) {
        const absPath = join(pluginDir, relPath)
        // 安全检查：不允许路径穿越
        if (!absPath.startsWith(pluginDir)) {
          return { ok: false, error: `路径穿越检测: ${relPath}` }
        }
        mkdirSync(join(absPath, '..'), { recursive: true })
        writeFileSync(absPath, content, 'utf-8')
      }
    } catch (err) {
      // 清理失败的安装
      try { rmSync(pluginDir, { recursive: true, force: true }) } catch { /* */ }
      return { ok: false, error: `安装文件写入失败: ${String(err)}` }
    }

    // 审批权限
    const granted = approvedPermissions ?? manifest.fallbackPermissions ?? ['readonly']
    const instance: PluginInstance = {
      manifest,
      status: 'installed',
      installedAt: new Date().toISOString(),
      grantedPermissions: granted,
      hooks: {} // 由 loader 填充
    }

    this.plugins.set(manifest.id, instance)
    this.persistRegistry()

    return { ok: true, data: undefined }
  }

  /**
   * 注册内置插件（源码在 extensions/plugins/builtin/，不复制到 data 目录）。
   * 用于 knowledge-presentation、desktop-companion 等随应用发布的模块。
   */
  async registerBuiltin(
    manifest: PluginManifest,
    hooks: ExtensionLifecycleHooks = {},
    grantedPermissions?: PluginPermission[]
  ): Promise<ExtensionOpResult> {
    if (this.plugins.has(manifest.id)) {
      const existing = this.plugins.get(manifest.id)!
      // 用户 uplugin 重载须整表替换 hooks（inject ↔ worker）；官方内置仍合并
      existing.hooks = manifest.id.startsWith('u/')
        ? hooks
        : { ...existing.hooks, ...hooks }
      if (existing.status === 'planned') {
        existing.status = 'installed'
      }
      // 用户 uplugin 扫描/重载后 hooks 已恢复，清除历史 worker 崩溃等 error 残留
      if (
        manifest.id.startsWith('u/') &&
        Object.keys(hooks).length > 0 &&
        existing.status === 'error'
      ) {
        existing.status = 'installed'
        existing.lastError = undefined
      }
      if (grantedPermissions?.length) {
        existing.grantedPermissions = grantedPermissions
      }
      this.persistRegistry()
      return { ok: true }
    }

    const granted =
      grantedPermissions ?? manifest.fallbackPermissions ?? manifest.permissions ?? ['readonly']
    const instance: PluginInstance = {
      manifest,
      status: 'installed',
      installedAt: new Date().toISOString(),
      grantedPermissions: granted,
      hooks
    }
    this.plugins.set(manifest.id, instance)
    this.persistRegistry()
    return { ok: true }
  }

  /** 登记规划中占位 Plugin（无运行时 hooks，不可 activate） */
  async registerPlaceholder(manifest: PluginManifest): Promise<ExtensionOpResult> {
    const existing = this.plugins.get(manifest.id)
    if (existing) {
      const hasRuntime = Object.keys(existing.hooks).length > 0
      if (hasRuntime || existing.status !== 'planned') return { ok: true }
      existing.manifest = manifest
      this.persistRegistry()
      return { ok: true }
    }
    this.plugins.set(manifest.id, {
      manifest,
      status: 'planned',
      installedAt: new Date().toISOString(),
      grantedPermissions: manifest.fallbackPermissions ?? ['readonly'],
      hooks: {}
    })
    this.persistRegistry()
    return { ok: true }
  }

  /** FIX-031：无运行时的 catalog 占位强制回到 planned（修复误激活的持久化状态） */
  enforceCatalogPlanned(id: string, manifest: PluginManifest): void {
    const existing = this.plugins.get(id)
    if (!existing) return
    if (Object.keys(existing.hooks).length > 0) return
    existing.status = 'planned'
    existing.manifest = manifest
    this.persistRegistry()
  }

  /** FIX-032：登记已下线 catalog Plugin（无运行时，不可 activate） */
  async registerDeprecated(manifest: PluginManifest): Promise<ExtensionOpResult> {
    const existing = this.plugins.get(manifest.id)
    if (existing) {
      existing.manifest = manifest
      if (Object.keys(existing.hooks).length === 0) {
        existing.status = 'deprecated'
        existing.hooks = {}
      }
      this.persistRegistry()
      return { ok: true }
    }
    this.plugins.set(manifest.id, {
      manifest,
      status: 'deprecated',
      installedAt: new Date().toISOString(),
      grantedPermissions: manifest.fallbackPermissions ?? ['readonly'],
      hooks: {}
    })
    this.persistRegistry()
    return { ok: true }
  }

  /** FIX-032：已下线项强制 deprecated 并清除遗留 hooks（旧版曾 active 的 screenshot 等） */
  enforceCatalogDeprecated(id: string, manifest: PluginManifest): void {
    const existing = this.plugins.get(id)
    if (!existing) return
    existing.status = 'deprecated'
    existing.manifest = manifest
    existing.hooks = {}
    this.persistRegistry()
  }

  isRunnable(id: string): boolean {
    const instance = this.plugins.get(id)
    if (!instance) return false
    if (instance.status === 'planned' || instance.status === 'deprecated') return false
    return Object.keys(instance.hooks).length > 0
  }

  // ═══════════════════════════════════════════════════════════
  // 激活/禁用/卸载
  // ═══════════════════════════════════════════════════════════

  /** 激活插件 */
  async activate(id: string): Promise<ExtensionOpResult> {
    const instance = this.plugins.get(id)
    if (!instance) return { ok: false, error: `插件 '${id}' 未安装` }
    if (instance.status === 'planned') {
      return { ok: false, error: '该插件尚在规划中，尚未实装' }
    }
    if (instance.status === 'deprecated') {
      return { ok: false, error: '该插件已下线，无法启用' }
    }
    if (Object.keys(instance.hooks).length === 0) {
      return { ok: false, error: '该插件尚无运行时实现' }
    }

    try {
      if (instance.hooks.onLoad && this.engineSnapshot) {
        const result = await instance.hooks.onLoad(this.engineSnapshot)
        if (!result.ok) return result
      }
      instance.status = 'active'
      instance.lastActiveAt = new Date().toISOString()
      instance.lastError = undefined
      this.persistRegistry()
      return { ok: true }
    } catch (err) {
      instance.status = 'error'
      instance.lastError = String(err)
      return { ok: false, error: String(err) }
    }
  }

  /** 禁用插件 */
  async deactivate(id: string): Promise<ExtensionOpResult> {
    const instance = this.plugins.get(id)
    if (!instance) return { ok: false, error: `插件 '${id}' 未安装` }

    if (isCorePlugin(id)) {
      return { ok: false, error: CORE_EXTENSION_DEACTIVATE_ERROR }
    }

    try {
      if (instance.hooks.onUnload) {
        await instance.hooks.onUnload()
      }
      instance.status = 'disabled'
      this.persistRegistry()
      return { ok: true }
    } catch (err) {
      instance.status = 'error'
      instance.lastError = String(err)
      return { ok: false, error: String(err) }
    }
  }

  /** 卸载插件（删除文件） */
  async uninstall(id: string): Promise<ExtensionOpResult> {
    const instance = this.plugins.get(id)
    if (!instance) return { ok: false, error: `插件 '${id}' 未安装` }

    // 先禁用
    if (instance.status === 'active') {
      const deactivateResult = await this.deactivate(id)
      if (!deactivateResult.ok) return deactivateResult
    }

    // 删除文件
    const pluginDir = join(this.pluginsDir, this.sanitizeDirName(id))
    try { rmSync(pluginDir, { recursive: true, force: true }) } catch { /* */ }

    this.plugins.delete(id)
    this.persistRegistry()
    return { ok: true }
  }

  /** 仅从注册表移除（OpenForU u/ 扩展删盘由 loader 负责） */
  async forgetRegistryEntry(id: string): Promise<ExtensionOpResult> {
    const instance = this.plugins.get(id)
    if (!instance) return { ok: true }
    if (instance.status === 'active') {
      await this.deactivate(id).catch(() => {})
    }
    this.plugins.delete(id)
    this.persistRegistry()
    return { ok: true }
  }

  // ═══════════════════════════════════════════════════════════
  // 查询
  // ═══════════════════════════════════════════════════════════

  /** 列出所有已安装插件 */
  listInstalled(): PluginInstance[] {
    return Array.from(this.plugins.values())
  }

  /** 按类型筛选 */
  listByType(type: PluginType): PluginInstance[] {
    return Array.from(this.plugins.values()).filter(p => p.manifest.pluginType === type)
  }

  /** 获取活跃插件 */
  listActive(): PluginInstance[] {
    return Array.from(this.plugins.values()).filter(p => p.status === 'active')
  }

  /** 获取单个插件 */
  get(id: string): PluginInstance | undefined {
    return this.plugins.get(id)
  }

  getPluginsDir(): string {
    return this.pluginsDir
  }

  getPluginDir(pluginId: string): string {
    return join(this.pluginsDir, this.sanitizeDirName(pluginId))
  }

  // ═══════════════════════════════════════════════════════════
  // 权限审批
  // ═══════════════════════════════════════════════════════════

  /** 获取插件的待审批权限 */
  getPendingPermissions(id: string): PluginPermission[] {
    const instance = this.plugins.get(id)
    if (!instance) return []
    return instance.manifest.permissions.filter(p => !instance.grantedPermissions.includes(p))
  }

  /** 审批权限（追加授予） */
  grantPermission(id: string, permission: PluginPermission): ExtensionOpResult {
    const instance = this.plugins.get(id)
    if (!instance) return { ok: false, error: `插件 '${id}' 未安装` }
    if (instance.grantedPermissions.includes(permission)) {
      return { ok: true }
    }
    instance.grantedPermissions = [...instance.grantedPermissions, permission]
    this.persistRegistry()
    return { ok: true }
  }

  /** 检查插件是否拥有某项权限 */
  hasPermission(id: string, permission: PluginPermission): boolean {
    const instance = this.plugins.get(id)
    if (!instance) return false
    return instance.grantedPermissions.includes(permission)
  }

  /** 获取权限说明 */
  getPermissionInfo(permission: PluginPermission): { level: number; requiresApproval: boolean; description: string } {
    return PERMISSION_LEVELS[permission]
  }

  // ═══════════════════════════════════════════════════════════
  // 引擎同步
  // ═══════════════════════════════════════════════════════════

  /** scheduler autonomous tick：单插件 onEngineUpdate（不阻塞 updateEngineSnapshot 广播） */
  async invokeOnEngineUpdate(
    id: string,
    snapshot: EngineSnapshot,
    options?: { timeoutMs?: number }
  ): Promise<ExtensionOpResult | null> {
    const instance = this.plugins.get(id)
    if (!instance || instance.status !== 'active') return null
    if (!instance.grantedPermissions.includes('engine_read')) return null
    if (!instance.hooks.onEngineUpdate) return null

    this.engineSnapshot = snapshot
    const timeoutMs = options?.timeoutMs ?? AUTONOMOUS_PLUGIN_TICK_TIMEOUT_MS
    try {
      const result = await Promise.race([
        instance.hooks.onEngineUpdate(snapshot),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`onEngineUpdate 超时（${timeoutMs}ms）`)), timeoutMs)
        )
      ])
      return result
    } catch (err) {
      instance.status = 'error'
      instance.lastError = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  /** 更新引擎快照并通知所有活跃插件 */
  updateEngineSnapshot(snapshot: EngineSnapshot): void {
    this.engineSnapshot = snapshot
    const active = this.listActive()
    for (const instance of active) {
      if (instance.grantedPermissions.includes('engine_read') && instance.hooks.onEngineUpdate) {
        instance.hooks.onEngineUpdate(snapshot).catch(err => {
          instance.status = 'error'
          instance.lastError = String(err)
        })
      }
    }
  }

  /** 设置事件接收器（由主 IPC 设置） */
  setEventSink(sink: (event: ExtensionEvent) => void): void {
    this.eventSink = sink
  }

  /** 构建插件沙箱 API */
  createSandboxApi(manifest: PluginManifest): PluginSandboxApi {
    const pluginDir = join(this.pluginsDir, this.sanitizeDirName(manifest.id))
    return {
      getEngineSnapshot: () => this.engineSnapshot,
      emitEvent: (event) => {
        const fullEvent: ExtensionEvent = {
          ...event,
          id: `plugin-${manifest.id}-${Date.now()}`,
          timestamp: new Date().toISOString()
        }
        this.eventSink?.(fullEvent)
      },
      readOwnFile: async (relativePath) => {
        const absPath = join(pluginDir, relativePath)
        if (!absPath.startsWith(pluginDir)) throw new Error('路径穿越拒绝')
        return readFileSync(absPath, 'utf-8')
      },
      writeOwnFile: async (relativePath, content) => {
        const absPath = join(pluginDir, relativePath)
        if (!absPath.startsWith(pluginDir)) throw new Error('路径穿越拒绝')
        mkdirSync(join(absPath, '..'), { recursive: true })
        writeFileSync(absPath, content, 'utf-8')
      },
      log: (level, message) => {
        // 委托给主 logger
        console.log(`[plugin:${manifest.id}][${level}] ${message}`)
      },
      getDataDir: () => pluginDir
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 持久化
  // ═══════════════════════════════════════════════════════════

  private persistRegistry(): void {
    const registryPath = join(this.pluginsDir, '_registry.json')
    const data = Array.from(this.plugins.entries()).map(([id, instance]) => ({
      id,
      manifest: instance.manifest,
      status: instance.status,
      installedAt: instance.installedAt,
      lastActiveAt: instance.lastActiveAt,
      lastError: instance.lastError,
      grantedPermissions: instance.grantedPermissions
    }))
    const body = JSON.stringify(data, null, 2)
    writeFileSync(registryPath, body, 'utf-8')
    const dataRoot = join(this.pluginsDir, '..', '..')
    if (getDatabase(dataRoot)) {
      kvSet(dataRoot, PLUGINS_REGISTRY_KV_NS, PLUGINS_REGISTRY_KV_KEY, body)
    }
  }

  /** 从磁盘恢复注册表 */
  loadRegistry(): void {
    const registryPath = join(this.pluginsDir, '_registry.json')
    const dataRoot = join(this.pluginsDir, '..', '..')
    if (getDatabase(dataRoot)) {
      const blob = kvGet(dataRoot, PLUGINS_REGISTRY_KV_NS, PLUGINS_REGISTRY_KV_KEY)
      if (blob) {
        try {
          const data = JSON.parse(blob)
          for (const entry of data) {
            this.plugins.set(entry.id, {
              manifest: entry.manifest,
              status: entry.status,
              installedAt: entry.installedAt,
              lastActiveAt: entry.lastActiveAt,
              lastError: entry.lastError,
              grantedPermissions: entry.grantedPermissions,
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
      const data = JSON.parse(readFileSync(registryPath, 'utf-8'))
      for (const entry of data) {
        this.plugins.set(entry.id, {
          manifest: entry.manifest,
          status: entry.status,
          installedAt: entry.installedAt,
          lastActiveAt: entry.lastActiveAt,
          lastError: entry.lastError,
          grantedPermissions: entry.grantedPermissions,
          hooks: {}
        })
      }
      if (getDatabase(dataRoot)) {
        kvSet(dataRoot, PLUGINS_REGISTRY_KV_NS, PLUGINS_REGISTRY_KV_KEY, readFileSync(registryPath, 'utf-8'))
      }
    } catch {
      // registry 损坏，从文件系统恢复
      this.recoverFromFilesystem()
    }
  }

  private recoverFromFilesystem(): void {
    if (!existsSync(this.pluginsDir)) return
    const entries = readdirSync(this.pluginsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const manifestPath = join(this.pluginsDir, entry.name, 'manifest.json')
      if (!existsSync(manifestPath)) continue
      try {
        const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        this.plugins.set(manifest.id, {
          manifest,
          status: 'installed',
          installedAt: new Date().toISOString(),
          grantedPermissions: ['readonly'],
          hooks: {}
        })
      } catch { /* 跳过损坏的插件 */ }
    }
    this.persistRegistry()
  }

  private sanitizeDirName(id: string): string {
    return id.replace(/[^a-zA-Z0-9_@.-]/g, '_').slice(0, 128)
  }
}
