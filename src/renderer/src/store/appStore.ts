import { create } from 'zustand'
import type { AppSettings } from '../Ackem'
import type { DispatchTriggerStatus } from '../../../shared/dispatchTrigger'
import type { CompanionAvatarState as AvatarState } from '../../../shared/companionSkin'
import type { SearchCardPayload } from '../../../shared/searchCard'
import type { MemoryAuditCardPayload } from '../../../shared/memoryAudit'

import type { SettingsSectionId } from '../components/settings/settingsUi'

export type Tab =
  | 'chat'
  | 'memory'
  | 'diary'
  | 'gamemode'
  | 'extensions'
  | 'agent'
  | 'settings'
  /** 鐢辫缃?璁板繂瀛愬叆鍙ｈ繘鍏ワ紝涓嶅湪涓诲鑸睍绀?*/
  | 'trace'
  | 'import'

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
export type ChatImageRow = {
  kind: 'image'
  prompt: string
  imagePath?: string
  imageUrl?: string
  revisedPrompt?: string
  loading?: boolean
  error?: string
}
export type ChatRow = ChatMessageRow | ChatSearchRow | ChatMemoryAuditRow | ChatSystemRow | ChatPlanCreateAskRow | ChatImageRow

/** 鍏煎鏃х増鑱婂ぉ璁板綍锛堟棤 kind 瀛楁锛?*/
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
            : '锛堟棤鎽樺綍姝ｆ枃锛?

    const copyText =
      typeof o.copyText === 'string'
        ? o.copyText
        : cardBody + (sources.length ? `\n\n鍙傝€冩潵婧愶細\n${sources.map((s, i) => `${i + 1}. ${s.title} ${s.url}`).join('\n')}` : '')

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
  if (o.kind === 'image' && typeof o.prompt === 'string') {
    return {
      kind: 'image',
      prompt: o.prompt,
      imagePath: typeof o.imagePath === 'string' ? o.imagePath : undefined,
      imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl : undefined,
      revisedPrompt: typeof o.revisedPrompt === 'string' ? o.revisedPrompt : undefined,
      loading: false,
      error: typeof o.error === 'string' ? o.error : undefined
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
  /** 娓告垙闄即锛氬綋鍓嶉€変腑鐨?gameId锛宯ull 琛ㄧず娓告垙鍒楄〃 */
  selectedGameId: string | null
  settings: AppSettings | null
  toast: Toast | null
  chatRows: ChatRow[]
  chatResetKey: number
  chatTurnCount: number
  deleteAttempted: boolean
  personalityAwakening: string | null
  /** 閫掑鍚庤 ChatPage 閲嶆柊鑱氱劍杈撳叆妗嗭紙褰掓。鍙栨秷銆佸垏鍥炲璇濈瓑锛?*/
  chatFocusToken: number
  /** 宸︿晶瀵艰埅鏍忎即渚ｅ舰璞＄姸鎬侊紙鐢?ChatPage 鍚屾锛?*/
  companionAvatarState: AvatarState
  /** listening 鎬佷笅鏄惁姝ｅ湪閿叆锛堝姞寮哄厜鐞冨姩鏁堬級 */
  companionAvatarTyping: boolean
  /** 褰撳墠杞宸茶Е鍙戠殑鎵╁睍锛堝彸渚ф儏缁潰鏉垮簳閮ㄥ睍绀猴級 */
  dispatchTriggerStatus: DispatchTriggerStatus | null
  /** 涓昏亰澶?/ 鍓ч櫌 / 妗屽疇鍏辩敤鐨勬祦寮忚繘琛屼腑鐘舵€?*/
  chatBusy: boolean
  /** 鐢佃剳鍔╂墜鍚庡彴浠诲姟杩涜涓紙涓嶉樆濉炶緭鍏ワ級 */
  agentBusy: boolean
  /** 鎵撳紑璁剧疆椤垫椂瀹氫綅鍒版寚瀹氬垎鍖猴紙娑堣垂鍚庢竻绌猴級 */
  settingsDeepLink: SettingsDeepLink | null
  setTab: (t: Tab) => void
  openSettingsAt: (section: SettingsSectionId, anchorId?: string) => void
  clearSettingsDeepLink: () => void
  setSelectedGameId: (id: string | null) => void
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
  setTab: (tab) => set({ tab }),
  openSettingsAt: (section, anchorId) =>
    set({ tab: 'settings', settingsDeepLink: { section, anchorId } }),
  clearSettingsDeepLink: () => set({ settingsDeepLink: null }),
  setSelectedGameId: (selectedGameId) => set({ selectedGameId }),
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
