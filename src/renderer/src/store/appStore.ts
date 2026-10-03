import { create } from 'zustand'
import type { AppSettings } from '../ackem'
import type { DispatchTriggerStatus } from '../../../shared/dispatchTrigger'
import type { CompanionAvatarState as AvatarState } from '../../../shared/companionSkin'
import type { SearchCardPayload } from '../../../shared/searchCard'
import type { MemoryAuditCardPayload } from '../../../shared/memoryAudit'

import type { SettingsSectionId } from '../components/settings/settingsUi'

export type Tab =
  | 'chat'
  /** 壳内 AckemCode：parts/ackemcode 的 GUI */
  | 'code'
  /** 朋友圈/社会页类型保留，主页不再挂载 */
  | 'social'
  | 'memory'
  | 'diary'
  | 'gamemode'
  | 'extensions'
  | 'settings'
  /** 由设置/记忆子入口进入，不在主导航展示 */
  | 'trace'
  | 'import'

/** Ackem 主体 agentId（与 main/social/agents/agentPaths.PRIMARY_AGENT_ID 一致） */
export const PRIMARY_AGENT_ID = 'default'

export function isPrimaryAgent(agentId: string | null | undefined): boolean {
  return !agentId || agentId === PRIMARY_AGENT_ID
}

export type SettingsDeepLink = {
  section: SettingsSectionId
  anchorId?: string
}

type Toast = { id: number; text: string }

export type ChatMessageRow = { kind: 'message'; role: 'user' | 'assistant'; content: string }
export type ChatSearchRow = { kind: 'search' } & SearchCardPayload
export type ChatMemoryAuditRow = { kind: 'memoryAudit' } & MemoryAuditCardPayload
export type ChatSystemRow = {
  kind: 'system'
  content: string
  tone?: 'amber' | 'success' | 'danger'
}
export type ChatPlanCreateAskRow = {
  kind: 'planCreateAsk'
  askMessage: string
  planTopic?: string
  emotionLabel: string
  status: 'pending' | 'accepted' | 'rejected'
}
export type ChatRow = ChatMessageRow | ChatSearchRow | ChatMemoryAuditRow | ChatSystemRow | ChatPlanCreateAskRow

/** 兼容旧版聊天记录（无 kind 字段） */
export function normalizeChatRow(raw: unknown): ChatRow | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.kind === 'search' && typeof o.query === 'string') {
    const parseHits = (arr: unknown[]) =>
      arr
        .filter(
          (r): r is WebSearchHitLike =>
            !!r &&
            typeof r === 'object' &&
            typeof (r as WebSearchHitLike).title === 'string' &&
            typeof (r as WebSearchHitLike).url === 'string'
        )
        .map((r) => ({
          title: r.title,
          url: r.url,
          snippet: typeof r.snippet === 'string' ? r.snippet : ''
        }))

    const sources = Array.isArray(o.sources)
      ? parseHits(o.sources)
      : Array.isArray(o.results)
        ? parseHits(o.results)
        : []

    const cardBody =
      typeof o.cardBody === 'string'
        ? o.cardBody
        : typeof o.copyText === 'string' && o.copyText
          ? o.copyText
          : sources.length > 0
            ? sources.map((s, i) => `${i + 1}. ${s.title}\n${s.url}`).join('\n\n')
            : '（无摘录正文）'

    const copyText =
      typeof o.copyText === 'string'
        ? o.copyText
        : cardBody + (sources.length ? `\n\n参考来源：\n${sources.map((s, i) => `${i + 1}. ${s.title} ${s.url}`).join('\n')}` : '')

    return {
      kind: 'search',
      query: o.query,
      ...(typeof o.displayTitle === 'string' && o.displayTitle.trim()
        ? { displayTitle: o.displayTitle.trim() }
        : {}),
      cardBody,
      sources: o.mode === 'knowledge' || o.mode === 'plan' ? [] : sources,
      copyText,
      mode:
        o.mode === 'search' ? 'search' : o.mode === 'plan' ? 'plan' : 'knowledge',
      ...(typeof o.error === 'string' ? { error: o.error } : {})
    }
  }
  if (o.kind === 'system' && typeof o.content === 'string') {
    const tone = o.tone === 'success' || o.tone === 'danger' ? o.tone : 'amber'
    return { kind: 'system', content: o.content, tone }
  }
  if (o.kind === 'planCreateAsk' && typeof o.askMessage === 'string') {
    const status =
      o.status === 'accepted' || o.status === 'rejected' ? o.status : 'pending'
    return {
      kind: 'planCreateAsk',
      askMessage: o.askMessage,
      planTopic: typeof o.planTopic === 'string' ? o.planTopic : undefined,
      emotionLabel:
        typeof o.emotionLabel === 'string' ? o.emotionLabel : 'CALM_RATIONAL',
      status
    }
  }
  if ((o.role === 'user' || o.role === 'assistant') && typeof o.content === 'string') {
    return { kind: 'message', role: o.role, content: o.content }
  }
  return null
}

type WebSearchHitLike = { title: string; url: string; snippet?: string }

type State = {
  tab: Tab
  /** 游戏陪伴：当前选中的 gameId，null 表示游戏列表 */
  selectedGameId: string | null
  /** 主对话 / 记忆档案当前绑定的角色（default = Ackem） */
  activeAgentId: string
  activeAgentName: string
  settings: AppSettings | null
  toast: Toast | null
  chatRows: ChatRow[]
  chatResetKey: number
  chatTurnCount: number
  deleteAttempted: boolean
  personalityAwakening: string | null
  /** 递增后让 ChatPage 重新聚焦输入框（归档取消、切回对话等） */
  chatFocusToken: number
  /** 左侧导航栏伴侣形象状态（由 ChatPage 同步） */
  companionAvatarState: AvatarState
  /** listening 态下是否正在键入（加强光球动效） */
  companionAvatarTyping: boolean
  /** 当前轮次已触发的扩展（右侧情绪面板底部展示） */
  dispatchTriggerStatus: DispatchTriggerStatus | null
  /** 主聊天 / 剧院 / 桌宠共用的流式进行中状态 */
  chatBusy: boolean
  /** 电脑助手后台任务进行中（不阻塞输入） */
  agentBusy: boolean
  /** 打开设置页时定位到指定分区（消费后清空） */
  settingsDeepLink: SettingsDeepLink | null
  setTab: (t: Tab) => void
  openSettingsAt: (section: SettingsSectionId, anchorId?: string) => void
  clearSettingsDeepLink: () => void
  setSelectedGameId: (id: string | null) => void
  /** 切换主对话角色；换人时重置聊天线程 */
  setActiveAgent: (id: string, name?: string) => void
  setSettings: (s: AppSettings | null) => void
  setChatRows: (rows: ChatRow[] | ((prev: ChatRow[]) => ChatRow[])) => void
  clearChatRows: () => void
  resetChat: () => void
  incrementTurn: () => void
  setDeleteAttempted: (v: boolean) => void
  setPersonalityAwakening: (label: string | null) => void
  requestChatInputFocus: () => void
  setCompanionAvatarState: (state: AvatarState, inputTyping?: boolean) => void
  setDispatchTriggerStatus: (status: DispatchTriggerStatus | null) => void
  setChatBusy: (chatBusy: boolean) => void
  setAgentBusy: (agentBusy: boolean) => void
  pushToast: (text: string) => void
  clearToast: () => void
}

let tid = 0

export const useAppStore = create<State>((set) => ({
  tab: 'chat',
  selectedGameId: null,
  activeAgentId: PRIMARY_AGENT_ID,
  activeAgentName: 'Ackem',
  settings: null,
  toast: null,
  chatRows: [],
  chatResetKey: 0,
  chatTurnCount: 0,
  deleteAttempted: false,
  personalityAwakening: null,
  chatFocusToken: 0,
  companionAvatarState: 'idle',
  companionAvatarTyping: false,
  dispatchTriggerStatus: null,
  chatBusy: false,
  agentBusy: false,
  settingsDeepLink: null,
  setTab: (tab) => set({ tab: tab === 'social' ? 'chat' : tab }),
  openSettingsAt: (section, anchorId) =>
    set({ tab: 'settings', settingsDeepLink: { section, anchorId } }),
  clearSettingsDeepLink: () => set({ settingsDeepLink: null }),
  setSelectedGameId: (selectedGameId) => set({ selectedGameId }),
  setActiveAgent: (id, name) =>
    set((s) => {
      const nextId = id?.trim() || PRIMARY_AGENT_ID
      const nextName =
        name?.trim() ||
        (nextId === PRIMARY_AGENT_ID ? 'Ackem' : s.activeAgentName || nextId)
      if (s.activeAgentId === nextId) {
        return { activeAgentName: nextName }
      }
      return {
        activeAgentId: nextId,
        activeAgentName: nextName,
        chatRows: [],
        chatResetKey: s.chatResetKey + 1,
        dispatchTriggerStatus: null,
        chatBusy: false,
        agentBusy: false,
        chatTurnCount: 0
      }
    }),
  setSettings: (settings) => set({ settings }),
  setChatRows: (chatRows) =>
    set((s) => ({
      chatRows: typeof chatRows === 'function' ? chatRows(s.chatRows) : chatRows
    })),
  clearChatRows: () => set({ chatRows: [] }),
  resetChat: () =>
    set((s) => ({
      chatRows: [],
      chatResetKey: s.chatResetKey + 1,
      dispatchTriggerStatus: null,
      chatBusy: false,
      agentBusy: false
    })),
  incrementTurn: () => set((s) => ({ chatTurnCount: s.chatTurnCount + 1 })),
  setDeleteAttempted: (deleteAttempted) => set({ deleteAttempted }),
  setPersonalityAwakening: (personalityAwakening) => set({ personalityAwakening }),
  requestChatInputFocus: () =>
    set((s) => ({ chatFocusToken: s.chatFocusToken + 1 })),
  setCompanionAvatarState: (companionAvatarState, companionAvatarTyping = false) =>
    set({ companionAvatarState, companionAvatarTyping }),
  setDispatchTriggerStatus: (dispatchTriggerStatus) => set({ dispatchTriggerStatus }),
  setChatBusy: (chatBusy) => set({ chatBusy }),
  setAgentBusy: (agentBusy) => set({ agentBusy }),
  pushToast: (text) => {
    const id = ++tid
    set({ toast: { id, text } })
    setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : {})), 4200)
  },
  clearToast: () => set({ toast: null })
}))
