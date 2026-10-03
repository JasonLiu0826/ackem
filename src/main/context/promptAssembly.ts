/**
 * promptAssembly — 社会成员消息组装（嘴分叉）
 * 顺序：social 基座 → Tier A → psyche → Tier B → recent + user
 * 禁止：main-chat、扩展、Canon、完整用户六维画像
 */

import type { AppSettings } from '../settings'
import type { ChatMessage } from '../context'
import { buildSocialSystemPrompt } from '../prompt/social-chat'
import { buildSocialAgentTierA } from '../social/characterCard/contextBuilder'
import { resolveDataRoot } from '../paths'

export type AssembleSocialMemberArgs = {
  agentId: string
  displayName: string
  psycheBlock?: string
  tierBBlock?: string
  recentMessages: { role: 'user' | 'assistant'; content: string }[]
  userText: string
  settings: AppSettings
  /** 测试 / 显式覆盖；缺省走 resolveDataRoot(settings) */
  dataRoot?: string
}

export function assembleSocialMemberMessages(args: AssembleSocialMemberArgs): ChatMessage[] {
  const dataRoot = args.dataRoot ?? resolveDataRoot(args.settings)
  const base = buildSocialSystemPrompt(args.displayName)
  const tierA = buildSocialAgentTierA(dataRoot, args.agentId, args.settings)
  const psyche = args.psycheBlock?.trim() ?? ''
  const tierB = args.tierBBlock?.trim() ?? ''

  const system = [base, tierA, psyche, tierB].filter((p) => p && p.trim().length > 0).join('\n\n')
  const msgs: ChatMessage[] = [{ role: 'system', content: system }]
  for (const m of args.recentMessages.slice(-20)) {
    msgs.push({ role: m.role, content: m.content })
  }
  msgs.push({ role: 'user', content: args.userText })
  return msgs
}
