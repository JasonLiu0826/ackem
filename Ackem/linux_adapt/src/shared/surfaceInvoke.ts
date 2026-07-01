import type { ExtensionSurfaceConfig, SurfaceInvokeDispatchMeta } from './extensionSurface'

/** Surface 触发时的宿主行为（OFU-Surface invoke 协议） */
export type SurfaceInvokeMode = 'inject_only' | 'open' | 'open_and_inject'

export type SurfaceInvokeTrigger = 'slash' | 'keyword' | 'explicit_open' | 'manual'

export type SurfaceInvokePolicy = {
  onSlash?: SurfaceInvokeMode
  onKeyword?: SurfaceInvokeMode
  /** 扩展中心 / IPC 手动打开 */
  onManual?: SurfaceInvokeMode
  focusIfOpen?: boolean
  /** slash 命中后是否跳过主聊天 LLM（仅系统确认） */
  skipMainChatLlmOnSlash?: boolean
}

export const DEFAULT_SURFACE_INVOKE: SurfaceInvokePolicy = {
  onSlash: 'open',
  onKeyword: 'open_and_inject',
  onManual: 'open',
  focusIfOpen: true,
  skipMainChatLlmOnSlash: true
}

export type ResolvedSurfaceInvoke = {
  mode: 'open' | 'open_and_inject'
  skipMainChatLlm: boolean
}

export function normalizeSurfaceInvokePolicy(
  invoke?: SurfaceInvokePolicy | null
): SurfaceInvokePolicy {
  return { ...DEFAULT_SURFACE_INVOKE, ...invoke }
}

export function resolveSurfaceInvokeMode(
  surface: ExtensionSurfaceConfig | null | undefined,
  trigger: SurfaceInvokeTrigger
): SurfaceInvokeMode {
  if (!surface?.enabled) return 'inject_only'
  const policy = normalizeSurfaceInvokePolicy(surface.invoke)
  switch (trigger) {
    case 'slash':
      return policy.onSlash ?? DEFAULT_SURFACE_INVOKE.onSlash!
    case 'keyword':
      return policy.onKeyword ?? DEFAULT_SURFACE_INVOKE.onKeyword!
    case 'explicit_open':
    case 'manual':
      return policy.onManual ?? 'open'
    default:
      return 'open'
  }
}

export function resolveSurfaceDispatch(
  surface: ExtensionSurfaceConfig | null | undefined,
  trigger: SurfaceInvokeTrigger
): ResolvedSurfaceInvoke | null {
  const raw = resolveSurfaceInvokeMode(surface, trigger)
  if (raw === 'inject_only') return null
  const policy = normalizeSurfaceInvokePolicy(surface?.invoke)
  return {
    mode: raw === 'open_and_inject' ? 'open_and_inject' : 'open',
    skipMainChatLlm:
      trigger === 'slash' ? (policy.skipMainChatLlmOnSlash ?? true) : false
  }
}

/** 注入主聊天 LLM：窗口已由宿主打开，禁止编造 UI */
export const SURFACE_OPENED_LLM_HINT =
  '【Surface·硬性】Ackem 主进程已打开该扩展的独立窗口。可简要确认窗口已打开；禁止编造未发生的界面操作（如「帮你点了开始」）。'

export const SURFACE_SLASH_LLM_HINT =
  '【slash·Surface·硬性】用户通过 slash 命令触发 Surface 插件；独立窗口已由系统打开。勿假装窗口未开或仅做闲聊。'

export function buildSurfaceInvokeMeta(
  surface: ExtensionSurfaceConfig | null | undefined,
  trigger: SurfaceInvokeTrigger
): SurfaceInvokeDispatchMeta | undefined {
  const resolved = resolveSurfaceDispatch(surface, trigger)
  if (!resolved) return undefined
  return {
    mode: resolved.mode,
    skipMainChatLlm: resolved.skipMainChatLlm
  }
}
