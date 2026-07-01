import type { CompanionAvatarState as AvatarState } from '../../../shared/companionSkin'

export type AvatarStateInput = {
  busy: boolean
  /** 当前轮 assistant 已输出字符数（流式或占位） */
  assistantContentLength: number
  /** 用户正在输入（输入框获焦且有内容或 IME 组字中） */
  composing?: boolean
}

/** 将聊天页状态映射为交互形象动画状态 */
export function resolveAvatarState(input: AvatarStateInput): AvatarState {
  const { busy, assistantContentLength, composing } = input
  if (busy) {
    return assistantContentLength > 0 ? 'speaking' : 'thinking'
  }
  if (composing) return 'listening'
  return 'idle'
}
