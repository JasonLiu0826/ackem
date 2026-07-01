import type { OpenForUPermissionId } from './openforuPermissions'
import { inferCapabilityTier, normalizePermissionId } from './openforuPermissions'

export type CapabilityTierId = 'T0' | 'T1' | 'T2'

export const CAPABILITY_TIER_LABELS: Record<CapabilityTierId, string> = {
  T0: 'T0 · 只读对话',
  T1: 'T1 · 上下文注入',
  T2: 'T2 · 真副作用'
}

export const CAPABILITY_TIER_DESCRIPTIONS: Record<CapabilityTierId, string> = {
  T0: '扩展只读取引擎快照与自身数据，不主动改变对话或系统。',
  T1: '扩展可在对话中注入提示（engine_inject），不访问网络或发系统通知。',
  T2:
    '扩展可发系统通知、发起 HTTPS 请求、定时主动提醒（uskill autonomous / uplugin onEngineUpdate）；部署前需你逐项批准。'
}

/** Plan Agent 系统提示中的 tier 能力说明（JE-1e 诚实文案） */
export const PLAN_AGENT_CAPABILITY_TIER_GUIDE = [
  'OpenForU 能力 tier（Plan 须如实告知，勿说「将来才有」）：',
  '- **T0**：只读 engine · 自身数据',
  '- **T1**：对话注入 engine_inject',
  '- **T2（已实装）**：system_notification · network_outbound · uskill **autonomous** 定时 proactive · uplugin **onEngineUpdate** 定时 tick',
  '- **T3（已实装）**：uplugin **Surface 独立窗口** — 扩展中心或 slash 触发后可打开专用界面（HTML 面板 + 按钮/状态区）；部署前用户在 Plan 侧栏看 wireframe 并点 **「界面 OK」**',
  '- uplugin 需 notify/fetch/定时：在 permissions 声明 system_notification / network_outbound，部署时批准',
  '- uskill 定时提醒：mode=autonomous + schedule（interval_ms），到点主界面 proactive 或系统通知',
  '- 用户明确要「按钮、面板、窗口、界面、点击、输入框、进度条」→ **uplugin + Surface（T3）**，禁止改口成「按钮变 slash 命令」或「暂不开发」'
].join('\n')

export function formatCapabilityTierLabel(tier: CapabilityTierId): string {
  return CAPABILITY_TIER_LABELS[tier]
}

export function describeCapabilityTier(tier: CapabilityTierId): {
  tier: CapabilityTierId
  label: string
  description: string
} {
  return {
    tier,
    label: CAPABILITY_TIER_LABELS[tier],
    description: CAPABILITY_TIER_DESCRIPTIONS[tier]
  }
}

export function normalizePermissionIds(raw: string[]): OpenForUPermissionId[] {
  return raw
    .map(normalizePermissionId)
    .filter((p): p is OpenForUPermissionId => p != null)
}

export function inferTierFromPermissionIds(raw: string[]): CapabilityTierId {
  return inferCapabilityTier(normalizePermissionIds(raw))
}

export function describePermissionsTier(raw: string[]): {
  tier: CapabilityTierId
  label: string
  description: string
} {
  const tier = inferTierFromPermissionIds(raw)
  return describeCapabilityTier(tier)
}

/** Plan 摘要 / 产物 hint 用的一行 tier 说明 */
export function formatTierSummaryForPermissions(raw: string[]): string {
  if (!raw.length) return CAPABILITY_TIER_DESCRIPTIONS.T0
  const { label, description } = describePermissionsTier(raw)
  return `${label} — ${description}`
}
