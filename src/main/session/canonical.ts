// [session/canonical] — Unified Bond 唯一关系线 session

export const CANONICAL_SESSION_ID = 'default'

/** 引擎 state / 记忆 / 合并聊天历史使用的 session */
export function engineSessionId(_channel?: 'desktop' | 'weixin'): string {
  return CANONICAL_SESSION_ID
}

export type ChatChannel = 'desktop' | 'weixin'

export function channelLabel(ch: ChatChannel): '电脑端' | '微信端' {
  return ch === 'weixin' ? '微信端' : '电脑端'
}
