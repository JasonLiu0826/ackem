// [extensions/plugins/types] — 插件系统类型定义
//
// 插件类型：
//   - skin       : 视觉皮肤（Live2D 模型、CSS 主题、表情包）
//   - personality: 人格预设包（新性格、种子记忆、语气模组）
//   - behavior   : 行为扩展（新的事件反应链、主动行为规则）
//   - tool       : 工具插件（新的工具调用能力，如文件操作、网页搜索）
//   - game_provider: 游戏陪伴 Provider（适配新游戏）
//   - skill_pack : 技能包（一组 Skills 的集合）
//   - theme      : 主题包（亮色/暗色/自定义配色）
//
// 安全模型：
//   - 每个插件在安装时声明所需权限
//   - 权限分级：readonly / data_write / engine_read / engine_inject / system_access
//   - 用户必须逐项批准敏感权限
//   - 插件运行在受限沙箱中，不可直接访问文件系统、网络或引擎内部

import type { CompanionSkinManifest } from '../../../shared/companionSkin'
import type {
  ExtensionManifestBase,
  ExtensionLifecycleHooks,
  EngineSnapshot,
  ExtensionEvent
} from '../protocols'

export type SandboxFetchInit = {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export type SandboxFetchResult = {
  ok: boolean
  status: number
  body: string
}

// ═══════════════════════════════════════════════════════════════
// 插件类型枚举
// ═══════════════════════════════════════════════════════════════

export type PluginType =
  | 'skin'
  | 'personality'
  | 'behavior'
  | 'tool'
  | 'game_provider'
  | 'skill_pack'
  | 'theme'

// ═══════════════════════════════════════════════════════════════
// 插件权限
// ═══════════════════════════════════════════════════════════════

export type PluginPermission =
  | 'readonly'           // 只读访问 data/ 下的自身目录
  | 'data_write'         // 可写入 data/plugins/<id>/ 和 data/staging/
  | 'engine_read'        // 可读取引擎只读快照（EngineSnapshot）
  | 'engine_inject'      // 可注入上下文到 LLM prompt
  | 'network_outbound'   // 可发起出站网络请求
  | 'system_notification'// 可发送系统通知
  | 'clipboard_read'     // 可读取剪贴板（需用户逐次确认）
  | 'foreground_detect'  // 可检测前台窗口标题（需独立子开关）

// ═══════════════════════════════════════════════════════════════

export interface PluginManifest extends ExtensionManifestBase {
  category: 'plugin'
  /** 插件类型 */
  pluginType: PluginType
  /** 请求的权限列表 */
  permissions: PluginPermission[]
  /** 最小权限（降级模式） */
  fallbackPermissions?: PluginPermission[]
  /** 插件图标 */
  icon?: string
  /** 预览图列表 */
  screenshots?: string[]
  /** 与哪些人格预设兼容（空=全部兼容） */
  compatiblePersonalities?: string[]
  /** skin 插件：声明后可覆盖主界面左侧伴侣交互形象 */
  companionSkin?: CompanionSkinManifest
}

// ═══════════════════════════════════════════════════════════════
// 插件运行时
// ═══════════════════════════════════════════════════════════════

export type PluginStatus = 'planned' | 'deprecated' | 'installed' | 'active' | 'disabled' | 'error'

export interface PluginInstance {
  manifest: PluginManifest
  status: PluginStatus
  /** 安装时间 ISO */
  installedAt: string
  /** 最后激活时间 */
  lastActiveAt?: string
  /** 运行时错误信息 */
  lastError?: string
  /** 生命周期钩子 */
  hooks: ExtensionLifecycleHooks
  /** 授权状态：批准的权限子集 */
  grantedPermissions: PluginPermission[]
}

// ═══════════════════════════════════════════════════════════════
// 插件注册表
// ═══════════════════════════════════════════════════════════════

export interface PluginRegistryEntry {
  manifest: PluginManifest
  /** 安装数（若连接了社区仓库） */
  installs?: number
  /** 评分 */
  rating?: number
  /** 仓库来源 URL */
  repository?: string
}

// ═══════════════════════════════════════════════════════════════
// 插件 API — 插件可调用的受限接口
// ═══════════════════════════════════════════════════════════════

/** 插件在沙箱内可调用的受限 API */
export interface PluginSandboxApi {
  /** 获取引擎只读快照 */
  getEngineSnapshot(): EngineSnapshot | null
  /** 产出扩展事件（由协调器处理后送入引擎） */
  emitEvent(event: Omit<ExtensionEvent, 'id' | 'timestamp'>): void
  /** 读取插件自身目录下的文件（相对路径，自动限制在 data/plugins/<id>/ 内） */
  readOwnFile(relativePath: string): Promise<string>
  /** 写入插件自身目录下的文件 */
  writeOwnFile(relativePath: string, content: string): Promise<void>
  /** 记录日志 */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void
  /** 系统通知 — 需 system_notification（JE-1b · uplugin 网关） */
  notify?(title: string, body: string, opts?: { silent?: boolean }): Promise<void>
  /** 主进程代发 HTTPS — 需 network_outbound（JE-1b） */
  fetch?(url: string, init?: SandboxFetchInit): Promise<SandboxFetchResult>
  /** 获取插件数据目录绝对路径 */
  getDataDir(): string
}

// ═══════════════════════════════════════════════════════════════
// 插件安装包格式
// ═══════════════════════════════════════════════════════════════

export interface PluginPackage {
  /** manifest.json 内容 */
  manifest: PluginManifest
  /** 文件列表：相对路径 → 文件内容 */
  files: Record<string, string>
  /** 签名（可选，用于验证来源） */
  signature?: string
}
