// [openforu/types] — 用户自创扩展类型定义
//
// 沿用现有 Plugin/Skill 协议，对用户自创扩展做细粒度限制。
// 所有类型完全兼容 PluginManifest / SkillManifest。

import type { SkillManifest, SkillTrigger, SkillFunctionDef } from '../skills/types'
import type { PluginManifest, PluginPermission, PluginType, PluginSandboxApi } from '../plugins/types'
import type { ExtensionLifecycleHooks, EngineSnapshot, ExtensionEvent } from '../protocols'

export type { UskilConfig, UskilInstance, UpluginInstance } from './loader'

// ═══════════════════════════════════════════════════════════════
// 用户扩展 ID 规范
// ═══════════════════════════════════════════════════════════════

/** 用户自创 Skill ID 格式：u/<name>@<semver> */
export type UskilId = `u/${string}@${string}`

/** 用户自创 Plugin ID 格式：u/<name>@<semver> */
export type UpluginId = `u/${string}@${string}`

/** 校验是否为合法的用户扩展 ID */
export function isValidUextensionId(id: string): boolean {
  return /^u\/[a-z0-9_-]+@\d+\.\d+\.\d+$/i.test(id)
}

// ═══════════════════════════════════════════════════════════════
// 用户扩展状态
// ═══════════════════════════════════════════════════════════════

export type UextensionStatus = 'installed' | 'active' | 'disabled' | 'error'

// ═══════════════════════════════════════════════════════════════
// 权限审批
// ═══════════════════════════════════════════════════════════════

/** 用户 Plugin 默认自动授予的权限集 */
export const DEFAULT_USER_PLUGIN_PERMISSIONS: PluginPermission[] = [
  'readonly',
  'engine_read'
]

/** 用户 Plugin 可申请升级的权限（需手动审批） */
export const ELEVATED_USER_PLUGIN_PERMISSIONS: PluginPermission[] = [
  'data_write',
  'engine_inject',
  'network_outbound',
  'system_notification'
]

/** 用户 Plugin 禁止申请的权限（安全红线） */
export const FORBIDDEN_USER_PLUGIN_PERMISSIONS: PluginPermission[] = [
  'clipboard_read',
  'foreground_detect'
]

/** 权限分组 */
export const PERMISSION_GROUPS: Record<string, { level: 'auto' | 'approval_required' | 'forbidden'; description: string }> = {
  readonly:              { level: 'auto', description: '读取自身数据目录' },
  engine_read:           { level: 'auto', description: '读取引擎只读快照' },
  data_write:            { level: 'approval_required', description: '写入数据目录' },
  engine_inject:         { level: 'approval_required', description: '向对话上下文注入文本' },
  network_outbound:      { level: 'approval_required', description: '发起网络请求' },
  system_notification:   { level: 'approval_required', description: '发送系统通知' },
  clipboard_read:        { level: 'forbidden', description: '读取剪贴板内容（用户扩展禁用）' },
  foreground_detect:     { level: 'forbidden', description: '检测前台窗口标题（用户扩展禁用）' }
} as const

// ═══════════════════════════════════════════════════════════════
// 沙箱配置
// ═══════════════════════════════════════════════════════════════

export interface UpluginSandboxConfig {
  /** 最大 CPU 时间（毫秒） */
  maxCpuTimeMs: number
  /** 最大内存（MB） */
  maxMemoryMb: number
  /** 最大执行时长（毫秒） */
  maxExecutionMs: number
  /** 网络请求白名单 URL 前缀 */
  allowedNetworkPrefixes: string[]
  /** 写入路径白名单 */
  allowedWritePaths: string[]
}

export const DEFAULT_SANDBOX_CONFIG: UpluginSandboxConfig = {
  maxCpuTimeMs: 5000,
  maxMemoryMb: 128,
  maxExecutionMs: 30000,
  allowedNetworkPrefixes: [],
  allowedWritePaths: [] // 运行时由 loader 填入 data/openforu/uplugins/<id>/
}

// ═══════════════════════════════════════════════════════════════
// Agent 生成结果（Plan 模式产物）
// ═══════════════════════════════════════════════════════════════

export interface AgentGenerationResult {
  /** 生成的 manifest */
  manifest: SkillManifest | PluginManifest
  /** 生成的文件列表：相对路径 → 内容 */
  files: Record<string, string>
  /** 推断的权限清单 */
  suggestedPermissions: string[]
  /** 权限用途说明 */
  permissionReasons: Record<string, string>
  /** 生成过程日志 */
  generationLog: string[]
}

// ═══════════════════════════════════════════════════════════════
// ExtensionDemand 意图（扩展意图探针 — 非 L0）
// 显式：规则匹配；隐式：规则预筛 + LLM 分类（见 openforu-详细设计（综合版）§2.3）
// ═══════════════════════════════════════════════════════════════

/** L0 解释层检测到的"用户想要创建扩展"事件 */
export interface ExtensionDemandEvent {
  /** 是否为扩展创建意图 */
  isExtensionDemand: boolean
  /** 推断的扩展类型 */
  inferredType?: 'uskill' | 'uplugin'
  /** 推断的功能描述 */
  inferredDescription?: string
  /** 触发关键词 */
  matchedKeywords: string[]
}

/** L0 关键词检测 */
export const EXTENSION_DEMAND_KEYWORDS = [
  '帮我做', '帮我写', '帮我做一个', '帮我写一个',
  '做一个', '写一个', '创建一个',
  '插件', 'skill', '技能', '功能', '扩展',
  '能不能做', '会不会做', '可以帮我'
]
