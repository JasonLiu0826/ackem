import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../lib/i18n'
import { useAppStore, type ChatRow, normalizeChatRow } from '../store/appStore'
import { emotionLightColor } from '../lib/emotionColors'
import { useUiStore } from '../store/uiStore'
import { McEventStack } from './McEventStack'
import { useCompanionAvatar } from '../hooks/useCompanionAvatar'
import { useEmbeddingReadiness } from '../hooks/useEmbeddingReadiness'
import { SearchPaperCard } from './SearchPaperCard'
import { MemoryAuditCard } from './MemoryAuditCard'
import { PlanCreateChatCard } from './PlanCreateChatCard'
import { ImageCard } from './ImageCard'
import { ConfirmExtensionDialog } from './ConfirmExtensionDialog'
import {
  ChatDesktopAgentToggle,
  desktopAgentInputPlaceholder,
  isDesktopAgentSettingsReady
} from './ChatDesktopAgentToggle'
import {
  desktopAgentApiMissingMessage,
  isDesktopAgentApiAvailable
} from '../lib/desktopAgentClient'
import { ChatTypingIndicator } from './ChatTypingIndicator'
import { MarkdownContent } from './MarkdownContent'
import { StreamingMessage } from './StreamingMessage'
import { normalizeChatActivityLabel } from '../lib/chatActivityLabel'
import type { SearchCardPayload } from '../../../shared/searchCard'
import { isOpenForUConfigured, OPENFORU_NOT_CONFIGURED_MSG } from '../../../shared/openforuConfig'
import {
  buildChatContextRequest,
  buildChatSendOptimisticRows,
  chatSendBlockReasonMessage,
  validateChatSend,
} from '../lib/chatSend'
import type { MemoryAuditCardPayload } from '../../../shared/memoryAudit'
import { insertSearchCardIntoRows, insertMemoryAuditCardIntoRows } from '../lib/chatStreamRows'
import { InvestigationProgressBar } from './InvestigationProgressBar'
import { DesktopAgentDock } from './DesktopAgentDock'
import type { InvestigationProgressPayload } from '../../../shared/investigation'
import type { TaskPlanProgressPayload } from '../../../shared/desktopAgentTaskPlan'
import {
  DESKTOP_AGENT_TASK_START_ACK,
  type DesktopAgentJobStatePayload,
  type DesktopAgentTaskDeliveryPayload
} from '../../../shared/desktopAgentDock'
import type { DesktopAgentConfirmRequest } from '../../../shared/desktopAgent'
import { isDesktopAgentGrayscalePreview } from '../../../shared/desktopAgentFeature'

type PendingDispatchContext = {
  extensionId: string
  extensionName: string
  askMessage: string
  userText: string
  explicitRel?: string
  recent: Array<{ role: 'user' | 'assistant'; content: string }>
  turnIndex: number
  systemHint?: string
}

function syncDispatchTriggerFromBuilt(
  built: Awaited<ReturnType<typeof window.Ackem.buildContext>>
): void {
  useAppStore.getState().setDispatchTriggerStatus(built.dispatchTriggered ?? null)
}

/** 褰撳墠杞祦寮忓啓鍏ョ殑 assistant 琛屼笅鏍囷紙閬垮厤鐭ヨ瘑鍗℃彃鍏ュ悗璇敼涓婁竴鏉′即渚ｆ皵娉★級 */
function patchAssistantAtIndex(
  setRows: (fn: (prev: ChatRow[]) => ChatRow[]) => void,
  index: number | null,
  content: string
): void {
  setRows((prev) => {
    const n = [...prev]
    if (index != null && index >= 0) {
      if (index < n.length) {
        const row = n[index]
        if (row.kind === 'message' && row.role === 'assistant') {
          n[index] = { kind: 'message', role: 'assistant', content }
          return n
        }
      } else if (index === n.length) {
        n.push({ kind: 'message', role: 'assistant', content })
        return n
      }
    }
    for (let i = n.length - 1; i >= 0; i--) {
      const row = n[i]
      if (row.kind === 'message' && row.role === 'assistant') {
        n[i] = { kind: 'message', role: 'assistant', content }
        return n
      }
    }
    return n
  })
}

export function ChatPage(): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const pushToast = useAppStore((s) => s.pushToast)
  const setTab = useAppStore((s) => s.setTab)
  const openSettingsAt = useAppStore((s) => s.openSettingsAt)
  const rows = useAppStore((s) => s.chatRows)
  const setRows = useAppStore((s) => s.setChatRows)
  const incrementTurn = useAppStore((s) => s.incrementTurn)
  const deleteAttempted = useAppStore((s) => s.deleteAttempted)
  const setDeleteAttempted = useAppStore((s) => s.setDeleteAttempted)
  const personalityAwakening = useAppStore((s) => s.personalityAwakening)
  const setPersonalityAwakening = useAppStore((s) => s.setPersonalityAwakening)
  const chatFocusToken = useAppStore((s) => s.chatFocusToken)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const setChatBusy = useAppStore((s) => s.setChatBusy)
  const setAgentBusy = useAppStore((s) => s.setAgentBusy)
  const agentBusy = useAppStore((s) => s.agentBusy)
  useEffect(() => {
    setChatBusy(busy)
  }, [busy, setChatBusy])
  const [desktopAgentConfirm, setDesktopAgentConfirm] = useState<DesktopAgentConfirmRequest | null>(
    null
  )
  const [agentJobState, setAgentJobState] = useState<DesktopAgentJobStatePayload | null>(null)
  const [agentJobStatus, setAgentJobStatus] = useState<string | null>(null)
  const [pendingTaskDelivery, setPendingTaskDelivery] =
    useState<DesktopAgentTaskDeliveryPayload | null>(null)
  const [activityLabel, setActivityLabel] = useState<string | null>(null)
  const [investigationProgress, setInvestigationProgress] =
    useState<InvestigationProgressPayload | null>(null)
  const [taskPlanProgress, setTaskPlanProgress] = useState<TaskPlanProgressPayload | null>(null)
  const [sessions, setSessions] = useState<Array<{ id: string; name: string }>>([])
  const streamBuf = useRef('')
  /** 鏈疆 startChat / 褰掓。鍙栨秷 姝ｅ湪鍐欏叆鐨?assistant 琛屽彿 */
  const streamingAssistantIndexRef = useRef<number | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const turnRef = useRef(0)
  const [emotionLabel, setEmotionLabel] = useState('CALM_RATIONAL')
  const [prevEmotionLabel, setPrevEmotionLabel] = useState('CALM_RATIONAL')
  const [aff, setAff] = useState(0)
  const chatTurnCount = useAppStore((s) => s.chatTurnCount)
  const setAmbientAff = useUiStore((s) => s.setAmbientAff)
  const setPlanOpen = useUiStore((s) => s.setPlanOpen)
  const theaterOpen = useUiStore((s) => s.theaterOpen)
  const [dispatchPending, setDispatchPending] = useState<PendingDispatchContext | null>(null)
  const [desktopAgentChatMode, setDesktopAgentChatMode] = useState(false)
  const [desktopAgentSettingsReady, setDesktopAgentSettingsReady] = useState(false)
  const { embeddingReadiness, embeddingChatReady, showEmbeddingBanner } = useEmbeddingReadiness()

  const enterPlanWithWorkspace = useCallback(
    async (planTopic?: string): Promise<boolean> => {
      if (!settings) return false
      if (!isOpenForUConfigured(settings)) {
        pushToast(OPENFORU_NOT_CONFIGURED_MSG)
        setTab('settings')
        return false
      }
      try {
        await window.Ackem.openforu.workspaces.create(planTopic?.trim() || undefined)
        setPlanOpen(true)
        return true
      } catch (e) {
        pushToast(e instanceof Error ? e.message : String(e))
        return false
      }
    },
    [settings, pushToast, setTab, setPlanOpen]
  )

  const activeSessionId = settings?.activeSessionId || 'default'

  useEffect(() => {
    if (!settings) return
    setDesktopAgentSettingsReady(isDesktopAgentSettingsReady(settings))
    if (!isDesktopAgentApiAvailable()) return
    void window.Ackem.desktopAgent.sessionMode.get(activeSessionId).then((r) => {
      setDesktopAgentChatMode(r.enabled && r.settingsReady)
      setDesktopAgentSettingsReady(r.settingsReady)
    })
  }, [settings, activeSessionId])

  const handleDesktopAgentToggle = useCallback(
    async (next: boolean) => {
      if (isDesktopAgentGrayscalePreview()) return
      if (!isDesktopAgentApiAvailable()) {
        pushToast(desktopAgentApiMissingMessage())
        return
      }
      const res = await window.Ackem.desktopAgent.sessionMode.set(activeSessionId, next)
      if (!res.ok) {
        pushToast(res.error ?? '鏃犳硶鍒囨崲鐢佃剳鍔╂墜妯″紡')
        return
      }
      setDesktopAgentChatMode(res.enabled === true)
      if (next) {
        const hasUserMsg = useAppStore.getState().chatRows.some(
          (r) => r.kind === 'message' && r.role === 'user'
        )
        if (!hasUserMsg) {
          setBusy(true)
          try {
            const opening = await window.Ackem.desktopAgent.opening()
            if (opening.ok && opening.text.trim()) {
              setRows((prev) => [
                ...prev,
                { kind: 'message', role: 'assistant', content: opening.text.trim() }
              ])
              void window.Ackem.saveChatHistory(useAppStore.getState().chatRows)
            }
          } catch (e) {
            pushToast(e instanceof Error ? e.message : String(e))
          } finally {
            setBusy(false)
          }
        }
      }
    },
    [activeSessionId, pushToast, setRows]
  )

  const streamingAssistantLen = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i]
      if (row.kind === 'message' && row.role === 'assistant') {
        return row.content.length
      }
    }
    return 0
  }, [rows])

  const { bindComposerInput } = useCompanionAvatar({
    surface: 'chat',
    busy,
    streamingAssistantLen,
    input,
    syncToStore: !theaterOpen
  })

  const insertMemoryAuditCard = useCallback(
    (payload: MemoryAuditCardPayload) => {
      setRows((prev) =>
        insertMemoryAuditCardIntoRows(prev, payload, streamingAssistantIndexRef)
      )
    },
    [setRows]
  )

  const insertSearchCard = useCallback(
    (payload: SearchCardPayload) => {
      setRows((prev) =>
        insertSearchCardIntoRows(prev, payload, streamingAssistantIndexRef)
      )
    },
    [setRows]
  )

  const patchStreamingAssistant = useCallback(
    (content: string) => {
      patchAssistantAtIndex(setRows, streamingAssistantIndexRef.current, content)
    },
    [setRows]
  )

  const clearStreamingAssistantIndex = useCallback(() => {
    streamingAssistantIndexRef.current = null
  }, [])

  const bindChatStreamHandlers = useCallback(() => {
    window.Ackem.onChatStreamStart(() => {
      setActivityLabel(null)
      setInvestigationProgress(null)
      if (!useAppStore.getState().agentBusy) {
        setTaskPlanProgress(null)
      }
    })
    window.Ackem.onChatWaveStart(({ newBubble }) => {
      setActivityLabel(null)
      if (!newBubble) {
        streamBuf.current = ''
        return
      }
      streamBuf.current = ''
      setRows((prev) => {
        const n = [...prev, { kind: 'message' as const, role: 'assistant' as const, content: '' }]
        streamingAssistantIndexRef.current = n.length - 1
        return n
      })
    })
    window.Ackem.onChatChunk((c) => {
      setActivityLabel(null)
      streamBuf.current += c
      patchStreamingAssistant(streamBuf.current)
    })
    window.Ackem.onChatWaveEnd(({ text }) => {
      if (text) {
        streamBuf.current = text
        patchStreamingAssistant(text)
      }
    })
    window.Ackem.onChatReplace((text) => {
      setActivityLabel(null)
      setInvestigationProgress(null)
      if (!useAppStore.getState().agentBusy) {
        setTaskPlanProgress(null)
      }
      streamBuf.current = text
      patchStreamingAssistant(text)
    })
    window.Ackem.onChatStatus((text) => {
      const label = normalizeChatActivityLabel(text)
      setActivityLabel(label || null)
    })
    window.Ackem.onInvestigationProgress((payload) => {
      setInvestigationProgress(payload)
    })
    window.Ackem.onTaskPlanProgress((payload) => {
      setTaskPlanProgress(payload)
    })
    window.Ackem.onChatSearchCard((payload) => {
      insertSearchCard(payload)
    })
    window.Ackem.onChatMemoryAudit((payload) => {
      insertMemoryAuditCard(payload)
    })
  }, [insertMemoryAuditCard, insertSearchCard, patchStreamingAssistant, setRows])

  const appendTaskDeliveryToChat = useCallback(
    (payload: DesktopAgentTaskDeliveryPayload) => {
      const prefix = payload.allPassed ? '鉁?鐢佃剳鍔╂墜浠诲姟瀹屾垚' : '鈿狅笍 鐢佃剳鍔╂墜浠诲姟鏈畬鎴?
      const content = `${prefix}锛?{payload.goalSummary}\n\n${payload.text}`
      setRows((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (
          last?.kind === 'message' &&
          last.role === 'assistant' &&
          last.content === DESKTOP_AGENT_TASK_START_ACK
        ) {
          next[next.length - 1] = { kind: 'message', role: 'assistant', content }
        } else {
          next.push({ kind: 'message', role: 'assistant', content })
        }
        void window.Ackem.saveChatHistory(next)
        return next
      })
    },
    [setRows]
  )

  useEffect(() => {
    if (!isDesktopAgentApiAvailable()) return
    const offConfirm = window.Ackem.desktopAgent.confirm.onRequest((payload) => {
      setDesktopAgentConfirm(payload)
    })
    window.Ackem.onDesktopAgentAgentBusy?.(({ sessionId: sid, busy: ab }) => {
      if (sid !== activeSessionId) return
      setAgentBusy(ab)
    })
    window.Ackem.onDesktopAgentJobState?.((payload) => {
      if (payload.sessionId !== activeSessionId) return
      setAgentJobState(payload)
      if (!payload.active) {
        setAgentJobStatus(null)
      }
    })
    window.Ackem.onDesktopAgentJobStatus?.(({ sessionId: sid, label }) => {
      if (sid !== activeSessionId) return
      setAgentJobStatus(label.trim() ? label : null)
    })
    const handleDelivery = (payload: DesktopAgentTaskDeliveryPayload) => {
      if (payload.sessionId !== activeSessionId) return
      setTaskPlanProgress(null)
      setAgentJobStatus(null)
      setAgentJobState({ sessionId: payload.sessionId, phase: 'completed', active: false })
      setAgentBusy(false)
      if (payload.queued) {
        setPendingTaskDelivery(payload)
      } else {
        appendTaskDeliveryToChat(payload)
      }
    }
    window.Ackem.onDesktopAgentTaskDelivery?.(handleDelivery)
    window.Ackem.onDesktopAgentTaskDeliveryQueued?.(handleDelivery)
    return () => {
      offConfirm()
    }
  }, [activeSessionId, setAgentBusy, appendTaskDeliveryToChat])

  useEffect(() => {
    void window.Ackem
      .getState()
      .then((raw) => {
        const s = raw as { emotion?: { primaryLabel?: string; aff?: number } }
        if (s?.emotion?.primaryLabel) {
          setEmotionLabel((cur) => {
            if (s.emotion!.primaryLabel !== cur) setPrevEmotionLabel(cur)
            return s.emotion!.primaryLabel!
          })
        }
        if (s?.emotion?.aff != null) {
          setAff(s.emotion.aff)
          setAmbientAff(s.emotion.aff)
          document.documentElement.style.setProperty(
            '--ambient-warmth',
            String(1 + (s.emotion.aff / 100) * 0.03)
          )
        }
      })
      .catch(() => {})
  }, [chatTurnCount, setAmbientAff])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [rows])

  const threadColor = emotionLightColor(emotionLabel)
  const lastAssistantIdx = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i]
      if (r.kind === 'message' && r.role === 'assistant') return i
    }
    return -1
  }, [rows])

  useEffect(() => {
    void window.Ackem?.ensureLayout()
    // 鍔犺浇涓婃鐨勮亰澶╄褰?
    void window.Ackem?.loadChatHistory().then((history: unknown[]) => {
      if (!history?.length) return
      const normalized = history.map(normalizeChatRow).filter((r): r is ChatRow => r != null)
      if (normalized.length > 0) setRows(normalized)
    }).catch(() => {})
  }, [])

  // Load session list
  useEffect(() => {
    void window.Ackem?.sessionList().then(list => {
      if (list && list.length > 0) setSessions(list)
    }).catch(() => {})
  }, [activeSessionId])

  const focusChatInput = useCallback(() => {
    // 鐢ㄥ灞?retry 纭繚鍦?Electron 鐒︾偣鐘舵€佸紓甯告椂涔熻兘鎭㈠
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      // Electron 鍦?native dialog 鍏抽棴鍚庡彲鑳藉紓姝ラ噸缃劍鐐癸紝鍔犲欢杩?retry
      setTimeout(() => inputRef.current?.focus(), 50)
      setTimeout(() => inputRef.current?.focus(), 150)
    })
  }, [])

  useEffect(() => {
    focusChatInput()
  }, [chatFocusToken, focusChatInput])

  useEffect(() => {
    window.Ackem?.onDispatchProactive?.((payload) => {
      pushToast(`${payload.extensionId}: ${payload.message.slice(0, 80)}`)
    })
  }, [pushToast])

  useEffect(() => {
    window.Ackem?.onExtensionTrigger?.((status) => {
      useAppStore.getState().setDispatchTriggerStatus(status)
    })
  }, [])

  const desktopAgentPreviewOnly = isDesktopAgentGrayscalePreview()
  const desktopAgentModeActive =
    !desktopAgentPreviewOnly && desktopAgentChatMode && desktopAgentSettingsReady

  const runChatFromBuilt = useCallback(
    async (
      built: Awaited<ReturnType<typeof window.Ackem.buildContext>>,
      awakeningHint?: string
    ) => {
      if (!settings) return

      bindChatStreamHandlers()
      window.Ackem.onChatDone((meta) => {
        setActivityLabel(null)
        setInvestigationProgress(null)
        clearStreamingAssistantIndex()
        if (meta?.memoryWrites?.length) {
          pushToast(t('chat.memoryWrite', { writes: meta.memoryWrites.join('; ') }))
        }
        incrementTurn()
        void window.Ackem.saveChatHistory(useAppStore.getState().chatRows)
      })
      window.Ackem.onChatError((err) => {
        setActivityLabel(null)
        setInvestigationProgress(null)
        if (String(err) === 'EMBEDDING_WARMING') {
          pushToast(t('chat.embedding.warming'))
          return
        }
        pushToast(err)
        patchStreamingAssistant(t('chat.error', { error: String(err) }))
      })

      if (built.skipLlm && built.redlineReply) {
        patchStreamingAssistant(built.redlineReply ?? '')
        clearStreamingAssistantIndex()
        incrementTurn()
        void window.Ackem.saveChatHistory(useAppStore.getState().chatRows)
        return
      }

      if (built.enterPlanMode) {
        const opened = await enterPlanWithWorkspace(built.planTopic)
        patchStreamingAssistant(
          opened
            ? t('chat.openPlan')
            : `${OPENFORU_NOT_CONFIGURED_MSG} 璇峰厛鍒拌缃〉濉啓 OpenForU 涓撶敤妯″瀷鍚庡啀璇曘€俙
        )
        clearStreamingAssistantIndex()
        return
      }

      await window.Ackem.startChat({
        messages: built.messages,
        settings,
        turnId: built.turnId,
        knowledgeTopic: built.knowledgeTopic ?? built.suggestedSearchQuery,
        suggestedSearchQuery: built.knowledgeTopic ?? built.suggestedSearchQuery,
        forcedWebSearchQuery: built.forcedWebSearchQuery,
        planDocumentTopic: built.planDocumentTopic,
        userTaskFrame: built.userTaskFrame,
        useWaveChat: built.useWaveChat,
        wavePlan: built.wavePlan,
        waveContext: built.waveContext,
        sessionId: settings.activeSessionId || 'default',
        desktopAgentChatMode: desktopAgentModeActive,
        desktopAgentCapability: built.desktopAgentCapability
      })
    },
    [
      settings,
      bindChatStreamHandlers,
      clearStreamingAssistantIndex,
      incrementTurn,
      patchStreamingAssistant,
      pushToast,
      setPlanOpen,
      setTab,
      enterPlanWithWorkspace,
      desktopAgentModeActive
    ]
  )

  const respondPlanCreate = useCallback(
    async (rowIndex: number, accepted: boolean) => {
      const row = useAppStore.getState().chatRows[rowIndex]
      if (row?.kind !== 'planCreateAsk' || row.status !== 'pending') return

      setRows((prev) => {
        const n = [...prev]
        const cur = n[rowIndex]
        if (cur?.kind !== 'planCreateAsk') return prev
        n[rowIndex] = { ...cur, status: accepted ? 'accepted' : 'rejected' }
        return n
      })

      if (!accepted) {
        setRows((prev) => [
          ...prev,
          { kind: 'message', role: 'assistant', content: t('chat.needMore') }
        ])
        return
      }
      const opened = await enterPlanWithWorkspace(row.planTopic)
      setRows((prev) => [
        ...prev,
        {
          kind: 'message',
          role: 'assistant',
          content: opened
            ? t('chat.openPlan')
            : `${OPENFORU_NOT_CONFIGURED_MSG} 璇峰厛鍒拌缃〉濉啓 OpenForU 涓撶敤妯″瀷鍚庡啀璇曘€俙
        }
      ])
    },
    [enterPlanWithWorkspace, setRows]
  )

  const respondDispatch = useCallback(
    async (accepted: boolean, remember = false) => {
      if (!dispatchPending || !settings) return
      const ctx = dispatchPending
      setDispatchPending(null)
      setBusy(true)
      streamingAssistantIndexRef.current = useAppStore.getState().chatRows.length
      setRows((prev) => [...prev, { kind: 'message', role: 'assistant', content: '' }])

      bindChatStreamHandlers()

      try {
        const built = await window.Ackem.buildContext({
          userText: ctx.userText,
          explicitRel: ctx.explicitRel,
          recentMessages: ctx.recent,
          sessionId: activeSessionId,
          turnIndex: ctx.turnIndex,
          systemHint: ctx.systemHint,
          dispatchRespond: { accepted, extensionId: ctx.extensionId, remember },
          desktopAgentChatMode: desktopAgentModeActive
        })
        syncDispatchTriggerFromBuilt(built)
        await runChatFromBuilt(built, ctx.systemHint)
      } catch (e) {
        pushToast(e instanceof Error ? e.message : String(e))
      } finally {
        clearStreamingAssistantIndex()
        setBusy(false)
      }
    },
    [
      dispatchPending,
      settings,
      activeSessionId,
      runChatFromBuilt,
      pushToast,
      setRows,
      clearStreamingAssistantIndex,
      desktopAgentModeActive
    ]
  )


  // 鈹€鈹€ 鎷栨嫿閫変腑鑷姩澶嶅埗 鈹€鈹€
  useEffect(() => {
    let lastCopied = ''
    const tryCopy = (text: string) => {
      // Electron 涓?navigator.clipboard 闇€瑕佺劍鐐癸紝鐢?execCommand 鏇村彲闈?
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        if (ok) pushToast(`馃搵 宸插鍒?${text.length} 瀛梎)
      } catch {
        // 鏈€鍚庡皾璇?clipboard API
        void navigator.clipboard.writeText(text).then(
          () => pushToast(`馃搵 宸插鍒?${text.length} 瀛梎)
        ).catch(() => {})
      }
    }

    const handleMouseUp = () => {
      // 鐭欢杩熺‘淇濋€夋嫨宸插畬鎴?
      setTimeout(() => {
        const sel = window.getSelection()
        const text = sel?.toString()?.trim()
        if (!text || text.length < 2 || text === lastCopied) return

        // 妫€鏌ラ€夊尯鏄惁鍦ㄨ亰澶╂皵娉″唴
        const anchor = sel?.anchorNode
        if (!anchor) return
        const parent = anchor.nodeType === 3 ? anchor.parentElement : anchor as Element
        if (!parent?.closest('.message-user, .message-her, .md-content')) return

        lastCopied = text
        tryCopy(text)
      }, 10)
    }
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [pushToast])

  // 鈹€鈹€ Agnes 鏂囩敓鍥?鈹€鈹€
  const generateImage = useCallback(async (prompt: string) => {
    const imageIndex = useAppStore.getState().chatRows.length
    // 鎻掑叆鐢ㄦ埛娑堟伅 + 鍔犺浇涓殑鍥剧墖鍗＄墖
    setRows((prev) => [
      ...prev,
      { kind: 'message', role: 'user', content: `馃帹 鐢讳竴寮狅細${prompt}` },
      { kind: 'image', prompt, loading: true }
    ])
    setInput('')
    setBusy(true)

    try {
      const result = await window.Ackem.agnes.generateImage(prompt)
      setRows((prev) => {
        const n = [...prev]
        // 鎵惧埌鏈€鍚庝竴涓?loading 鐨?image 琛?
        for (let i = n.length - 1; i >= 0; i--) {
          if (n[i].kind === 'image' && (n[i] as { loading?: boolean }).loading) {
            n[i] = {
              kind: 'image',
              prompt,
              imagePath: result.imagePath,
              imageUrl: result.imageUrl,
              revisedPrompt: result.revisedPrompt,
              loading: false,
              error: result.success ? undefined : result.error
            }
            break
          }
        }
        void window.Ackem.saveChatHistory(n)
        return n
      })
    } catch (e) {
      setRows((prev) => {
        const n = [...prev]
        for (let i = n.length - 1; i >= 0; i--) {
          if (n[i].kind === 'image' && (n[i] as { loading?: boolean }).loading) {
            n[i] = {
              kind: 'image',
              prompt,
              loading: false,
              error: e instanceof Error ? e.message : String(e)
            }
            break
          }
        }
        void window.Ackem.saveChatHistory(n)
        return n
      })
    } finally {
      setBusy(false)
      focusChatInput()
    }
  }, [setRows, setInput, setBusy, focusChatInput])

  useEffect(() => {
    const onWinFocus = () => focusChatInput()
    window.addEventListener('focus', onWinFocus)
    // 涓昏繘绋?BrowserWindow focus 浜嬩欢涔熶細閫氳繃 IPC 杞彂鍒版澶?
    window.Ackem?.onWindowFocused(() => focusChatInput())
    return () => window.removeEventListener('focus', onWinFocus)
  }, [focusChatInput])

  // 鐢ㄦ埛鍙栨秷浜嗗綊妗?鈫?AI 涓诲姩琛ㄨ揪琚儗鍙涚殑鎰熷彈锛堟棤鐢ㄦ埛鍙娑堟伅锛?
  const deleteEffectRun = useRef(false)
  useEffect(() => {
    if (!deleteAttempted || !settings) return
    if (deleteEffectRun.current) return  // 闃叉 React StrictMode 鍙屾鎵ц
    deleteEffectRun.current = true
    setDeleteAttempted(false)

    const systemHint = [
      t('chat.archiveEventTitle'),
      t('chat.archiveEvent1'),
      t('chat.archiveEvent2'),
      t('chat.archiveEvent3'),
      t('chat.archiveEvent4'),
      t('chat.archiveEvent5'),
      '',
      t('chat.archiveEvent6'),
      t('chat.archiveEvent7'),
      t('chat.archiveEvent8'),
      t('chat.archiveEvent9')
    ].join('\n')

    void (async () => {
      setBusy(true)
      streamBuf.current = ''
      // 涓嶆斁鐢ㄦ埛娑堟伅锛孉I 涓诲姩寮€鍙?
      const prevRows = useAppStore.getState().chatRows
      const archiveAssistantIndex = prevRows.length
      streamingAssistantIndexRef.current = archiveAssistantIndex
      setRows([...prevRows, { kind: 'message', role: 'assistant', content: '' }])
      const turnIndex = ++turnRef.current

      bindChatStreamHandlers()

      try {
        const built = await window.Ackem.buildContext({
          userText: t('chat.archiveSilent'),
          systemHint,
          recentMessages: prevRows
            .filter((m): m is Extract<ChatRow, { kind: 'message' }> => m.kind === 'message')
            .slice(-24)
            .map((m) => ({ role: m.role, content: m.content })),
          sessionId: activeSessionId,
          turnIndex
        })
        syncDispatchTriggerFromBuilt(built)

        window.Ackem.onChatDone(() => {
          clearStreamingAssistantIndex()
          incrementTurn()
          // 鑷姩淇濆瓨鑱婂ぉ璁板綍
          void window.Ackem.saveChatHistory(useAppStore.getState().chatRows)
        })
        window.Ackem.onChatError((err) => {
          if (String(err) === 'EMBEDDING_WARMING') {
            pushToast(t('chat.embedding.warming'))
            return
          }
          pushToast(err)
          void window.Ackem.saveChatHistory(useAppStore.getState().chatRows)
          patchStreamingAssistant(t('chat.error', { error: String(err) }))
        })

        if (built.skipLlm && built.redlineReply) {
          patchStreamingAssistant(built.redlineReply ?? '')
          clearStreamingAssistantIndex()
        } else {
          await window.Ackem.startChat({
            messages: built.messages,
            settings,
            turnId: built.turnId,
            forcedWebSearchQuery: built.forcedWebSearchQuery,
            userTaskFrame: built.userTaskFrame,
            useWaveChat: built.useWaveChat,
            wavePlan: built.wavePlan,
            waveContext: built.waveContext,
            sessionId: settings.activeSessionId || 'default'
          })
        }
      } catch (e) {
        pushToast(e instanceof Error ? e.message : String(e))
      } finally {
        clearStreamingAssistantIndex()
        setBusy(false)
        focusChatInput()
      }
    })()
  }, [
    deleteAttempted,
    settings,
    setDeleteAttempted,
    setRows,
    incrementTurn,
    pushToast,
    focusChatInput,
    bindChatStreamHandlers,
    activeSessionId,
    patchStreamingAssistant,
    clearStreamingAssistantIndex
  ])

  const send = useCallback(async () => {
    // 妫€娴嬪浘鐗囩敓鎴愭剰鍥?
    const trimmedInput = input.trim()
    if (trimmedInput && !busy) {
      try {
        const intent = await window.Ackem.agnes.detectIntent(trimmedInput)
        if (intent.isImage && intent.prompt) {
          void generateImage(intent.prompt)
          return
        }
      } catch {
        // 妫€娴嬪け璐ュ垯璧版甯歌亰澶╂祦绋?
      }
    }

    const validation = validateChatSend(input, settings, busy, t('chat.docOnly'), embeddingReadiness)
    if (!validation.ok) {
      const msg = chatSendBlockReasonMessage(validation.reason)
      if (msg === 'settings.loading') pushToast(t('settings.loading'))
      else if (msg === 'chat.embedding.warming') pushToast(t('chat.embedding.warming'))
      else if (msg) pushToast(msg.startsWith('chat.') ? t(msg) : msg)
      return
    }
    const { raw: userLine, clean, rel } = validation
    setBusy(true)
    setActivityLabel(null)
    streamBuf.current = ''
    turnRef.current += 1
    const turnIndex = turnRef.current
    const { rowsWithPlaceholder, assistantIndex, recentMessages: recent } = buildChatSendOptimisticRows(
      rows,
      userLine
    )
    streamingAssistantIndexRef.current = assistantIndex
    setRows(rowsWithPlaceholder)
    setInput('')
    incrementTurn()  // 瑙﹀彂鎯呯华闈㈡澘鍒锋柊

    const nextCore = rowsWithPlaceholder.slice(0, -1)

    // 浜烘牸瑙夐啋锛氬垏鎹㈠悗棣栨瀵硅瘽娉ㄥ叆杩囨浮鎻愮ず
    const awakeningHint = personalityAwakening
      ? `銆愪汉鏍艰閱掓彁绀?路 浠呬綔婕旂粠鍙傝€冿紝鍕跨洿鎺ュ杩般€戜綘鐨勬€ф牸鍒氭墠鍙戠敓浜嗗彉鍖栥€備綘鐜板湪鏇存帴杩?${personalityAwakening}"鐨勭壒璐ㄣ€備綘浠嶆槸鍚屼竴涓汉锛岃寰楁垜浠箣闂寸殑涓€鍒囷紝浣嗕綘鐪嬪緟涓栫晫鐨勬柟寮忔湁浜嗕竴浜涘井濡欑殑涓嶅悓銆傝鍦ㄦ帴涓嬫潵鐨勫璇濅腑鑷劧鍦颁綋鐜拌繖绉嶅彉鍖栵紝涓嶈鐩存帴璇村嚭"鎴戝彉浜?鎴?鎴戠殑鎬ф牸鍙樹簡"銆傞殢鐫€瀵硅瘽鎺ㄨ繘锛屼綘浼氳秺鏉ヨ秺鑷劧鍦拌瀺鍏ユ柊鐨勬€ф牸銆俙
      : undefined
    if (awakeningHint) setPersonalityAwakening(null)

    bindChatStreamHandlers()

    try {
      const built = await window.Ackem.buildContext(
        buildChatContextRequest({
          clean,
          userLine,
          rel,
          recentMessages: recent,
          sessionId: activeSessionId,
          turnIndex,
          systemHint: awakeningHint,
          desktopAgentChatMode: desktopAgentModeActive
        })
      )
      syncDispatchTriggerFromBuilt(built)

      if (built.planCreatePending) {
        const cardEmotion = built.planCreatePending.emotionLabel ?? emotionLabel
        if (built.planCreatePending.emotionLabel) {
          setEmotionLabel((cur) => {
            if (built.planCreatePending!.emotionLabel !== cur) setPrevEmotionLabel(cur)
            return built.planCreatePending!.emotionLabel!
          })
        }
        setRows([
          ...nextCore,
          {
            kind: 'planCreateAsk',
            askMessage: built.planCreatePending.askMessage,
            planTopic: built.planCreatePending.planTopic,
            emotionLabel: cardEmotion,
            status: 'pending'
          }
        ])
        streamingAssistantIndexRef.current = null
        return
      }

      if (built.dispatchPending) {
        setRows(nextCore)
        streamingAssistantIndexRef.current = null
        setDispatchPending({
          extensionId: built.dispatchPending.extensionId,
          extensionName: built.dispatchPending.extensionName,
          askMessage: built.dispatchPending.askMessage,
          userText: clean || userLine,
          explicitRel: rel,
          recent,
          turnIndex,
          systemHint: awakeningHint
        })
        return
      }

      await runChatFromBuilt(built, awakeningHint)
    } catch (e) {
      console.error('[send] error:', e)
      pushToast(e instanceof Error ? e.message : String(e))
      patchStreamingAssistant(`锛堥敊璇級${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setActivityLabel(null)
      clearStreamingAssistantIndex()
      setBusy(false)
    }
  }, [
    busy,
    input,
    pushToast,
    rows,
    settings,
    bindChatStreamHandlers,
    setRows,
    incrementTurn,
    activeSessionId,
    personalityAwakening,
    setPersonalityAwakening,
    patchStreamingAssistant,
    clearStreamingAssistantIndex,
    runChatFromBuilt,
    emotionLabel,
    respondPlanCreate,
    desktopAgentModeActive,
    generateImage
  ])

  if (!settings) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface text-sm text-ink-muted">
        姝ｅ湪鍔犺浇璁剧疆鈥?
      </div>
    )
  }

  return (
    <>
    <div
      className="flex h-full min-h-0 flex-1 flex-col bg-surface"
      onMouseDown={() => focusChatInput()}
    >
      <header className="glass-panel flex items-center justify-between border-b border-surface-inset/60 px-6 py-3">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-base font-semibold text-ink">瀵硅瘽</h1>
          {sessions.length > 1 && activeSessionId !== 'default' && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent font-medium">
              {sessions.find(s => s.id === activeSessionId)?.name || activeSessionId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sessions.length > 1 && (
            <select
              value={activeSessionId}
              onChange={async (e) => {
                const newId = e.target.value
                if (newId === activeSessionId) return
                try {
                  const r = await window.Ackem.sessionSwitch(newId)
                  if (r.ok && r.settings) {
                    useAppStore.getState().setSettings(r.settings)
                    useAppStore.getState().resetChat()
                    turnRef.current = 0
                    const history = await window.Ackem.loadChatHistory()
                    if (history?.length) {
                      const normalized = history
                        .map(normalizeChatRow)
                        .filter((row): row is ChatRow => row != null)
                      if (normalized.length > 0) {
                        setRows(normalized)
                        const userTurns = normalized.filter(
                          (row) => row.kind === 'message' && row.role === 'user'
                        ).length
                        turnRef.current = userTurns
                      }
                    }
                    pushToast('宸插垏鎹細璇?)
                  } else {
                    pushToast(r.error ?? '鍒囨崲澶辫触')
                  }
                } catch (err) {
                  pushToast(err instanceof Error ? err.message : String(err))
                }
              }}
              className="glass-panel rounded-lg px-2 py-1.5 text-xs text-ink outline-none"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <InvestigationProgressBar progress={investigationProgress} />
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
            {rows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 px-6">
                <div className="text-5xl mb-4">鉁?/div>
                <h2 className="text-lg font-display font-semibold text-ink mb-2">寮€濮嬪璇?/h2>
                <p className="text-sm text-ink-muted text-center max-w-md leading-relaxed mb-6">
                  鍦ㄣ€岃缃€嶄腑閰嶇疆妯″瀷骞跺畬鎴愬勾榫勭‘璁ゅ悗锛屽嵆鍙紑濮嬪璇濄€?
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    { icon: '馃帹', label: '鐢讳竴寮犳棩鍑?, hint: '璇曡瘯 AI 鐢熷浘' },
                    { icon: '馃挱', label: '鑱婅亰鏈€杩?, hint: '寮€濮嬮棽鑱? },
                    { icon: '馃攳', label: '鎼滅储淇℃伅', hint: '鐭ヨ瘑妫€绱? }
                  ].map(({ icon, label, hint }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setInput(label)
                        focusChatInput()
                      }}
                      className="glass-panel rounded-xl px-4 py-2.5 text-left hover:bg-surface-raised/50 transition-all group"
                    >
                      <span className="text-base mr-1.5">{icon}</span>
                      <span className="text-sm text-ink">{label}</span>
                      <span className="block text-[10px] text-ink-muted/60 mt-0.5 group-hover:text-ink-muted transition-colors">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {rows.map((m, i) => {
              if (m.kind === 'search') {
                return <SearchPaperCard key={`search-${i}`} {...m} />
              }
              if (m.kind === 'memoryAudit') {
                return <MemoryAuditCard key={`audit-${i}`} {...m} />
              }
              if (m.kind === 'image') {
                return (
                  <ImageCard
                    key={`image-${i}`}
                    prompt={m.prompt}
                    imagePath={m.imagePath}
                    imageUrl={m.imageUrl}
                    revisedPrompt={m.revisedPrompt}
                    loading={m.loading}
                    error={m.error}
                  />
                )
              }
              if (m.kind === 'planCreateAsk') {
                return (
                  <PlanCreateChatCard
                    key={`plan-ask-${i}`}
                    askMessage={m.askMessage}
                    planTopic={m.planTopic}
                    emotionLabel={m.emotionLabel}
                    status={m.status}
                    disabled={busy}
                    onAccept={() => void respondPlanCreate(i, true)}
                    onReject={() => void respondPlanCreate(i, false)}
                  />
                )
              }
              if (m.kind === 'system') {
                const border =
                  m.tone === 'success'
                    ? 'var(--color-success)'
                    : m.tone === 'danger'
                      ? 'var(--color-danger)'
                      : 'var(--color-accent)'
                return (
                  <div
                    key={`sys-${i}`}
                    className="message-system border-l-2 pl-3"
                    style={{ borderColor: border }}
                  >
                    {m.content}
                  </div>
                )
              }
              if (m.role === 'user') {
                return (
                  <div key={`msg-${i}`} className="message-user">
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                )
              }
              const showBridge =
                i > 0 &&
                m.kind === 'message' &&
                m.role === 'assistant' &&
                prevEmotionLabel !== emotionLabel &&
                i === lastAssistantIdx
              return (
                <div key={`msg-${i}`}>
                  {showBridge && (
                    <div
                      className="message-emotion-bridge"
                      style={
                        {
                          '--thread-from': emotionLightColor(prevEmotionLabel),
                          '--thread-to': threadColor
                        } as React.CSSProperties
                      }
                    />
                  )}
                  <div
                    className={[
                      'message-her',
                      busy && i === lastAssistantIdx ? 'streaming' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ ['--thread-color' as string]: threadColor }}
                  >
                    {m.content ? (
                      busy && i === lastAssistantIdx ? (
                        <StreamingMessage text={m.content} active />
                      ) : (
                        <MarkdownContent source={m.content} chat />
                      )
                    ) : busy && i === lastAssistantIdx ? (
                      <ChatTypingIndicator label={activityLabel} />
                    ) : (
                      <span className="text-ink-muted/60">鈥?/span>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>
          <div className="border-t border-surface-inset/60 px-6 py-4">
            {showEmbeddingBanner && (
              <div className="settings-callout-warn mx-auto mb-3 max-w-[920px] text-sm">
                <div>{t('chat.embedding.warming')}</div>
                <div className="mt-0.5 text-xs opacity-90">
                  {t('chat.embedding.warmingDetail', {
                    phase: t(`chat.embedding.phase.${embeddingReadiness!.phase}`),
                  })}
                </div>
              </div>
            )}
            {embeddingReadiness?.phase === 'degraded' && (
              <div className="mx-auto mb-3 max-w-[920px] rounded-xl border border-surface-inset/60 bg-surface-inset/20 px-4 py-2 text-xs text-ink-muted">
                {t('chat.embedding.degraded')}
              </div>
            )}
            {desktopAgentModeActive && agentBusy ? (
              <div className="mx-auto mb-2 max-w-[920px] px-1 text-[10px] text-ink-muted">
                鐢佃剳鍔╂墜鍦ㄤ笅鏂归潰鏉挎墽琛屼腑锛屼綘鍙互缁х画鑱婂ぉ銆?
              </div>
            ) : null}
            {!desktopAgentPreviewOnly ? (
            <DesktopAgentDock
              sessionId={activeSessionId}
              progress={taskPlanProgress}
              confirm={desktopAgentConfirm}
              jobState={agentJobState}
              jobStatusLabel={agentJobStatus}
              pendingDelivery={pendingTaskDelivery}
              onAllowOnce={() => {
                if (!desktopAgentConfirm || !isDesktopAgentApiAvailable()) return
                void window.Ackem.desktopAgent.confirm
                  .allow(desktopAgentConfirm.requestId)
                  .then(() => setDesktopAgentConfirm(null))
              }}
              onAllowSession={() => {
                if (!desktopAgentConfirm || !isDesktopAgentApiAvailable()) return
                void window.Ackem.desktopAgent.confirm
                  .allowSession(desktopAgentConfirm.requestId)
                  .then(() => setDesktopAgentConfirm(null))
              }}
              onAllowTaskDeletes={() => {
                if (
                  !desktopAgentConfirm ||
                  !desktopAgentConfirm.taskPlanId ||
                  !isDesktopAgentApiAvailable()
                )
                  return
                void window.Ackem.desktopAgent.confirm
                  .allowTaskDeletes(
                    desktopAgentConfirm.requestId,
                    desktopAgentConfirm.taskPlanId
                  )
                  .then(() => setDesktopAgentConfirm(null))
              }}
              onDeny={() => {
                if (!desktopAgentConfirm || !isDesktopAgentApiAvailable()) return
                void window.Ackem.desktopAgent.confirm
                  .deny(desktopAgentConfirm.requestId)
                  .then(() => setDesktopAgentConfirm(null))
              }}
              onViewDelivery={() => {
                if (!pendingTaskDelivery) return
                appendTaskDeliveryToChat(pendingTaskDelivery)
                setPendingTaskDelivery(null)
              }}
              onDismissDelivery={() => setPendingTaskDelivery(null)}
            />
            ) : null}
            <div className="mx-auto mb-2 flex max-w-[920px] items-center justify-between gap-2 px-1">
              <ChatDesktopAgentToggle
                enabled={desktopAgentChatMode}
                settingsReady={desktopAgentSettingsReady && isDesktopAgentApiAvailable()}
                previewOnly={desktopAgentPreviewOnly}
                onToggle={(next) => void handleDesktopAgentToggle(next)}
                onOpenSettings={() => openSettingsAt('settings-desktop-agent')}
              />
              {desktopAgentPreviewOnly ? (
                <span className="exp-muted text-[10px]">鏆傛湭寮€鏀?/span>
              ) : desktopAgentModeActive ? (
                <span className="exp-muted text-[10px]">瀹為獙 路 鐢佃剳鍔╂墜宸插紑鍚?/span>
              ) : null}
            </div>
            {/* 蹇嵎宸ュ叿鏍?*/}
            <div className="mx-auto flex max-w-[920px] items-center gap-1 px-1 mb-1.5">
              <button
                type="button"
                onClick={() => {
                  setInput('鐢讳竴寮?')
                  focusChatInput()
                }}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] text-ink-muted hover:text-ink hover:bg-surface-inset/40 transition-colors disabled:opacity-40"
                title="鐢熸垚鍥剧墖"
              >
                馃帹
              </button>
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] text-ink-muted/40 cursor-not-allowed"
                title="闄勪欢锛堝嵆灏嗘帹鍑猴級"
              >
                馃搸
              </button>
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] text-ink-muted/40 cursor-not-allowed"
                title="璇煶锛堝嵆灏嗘帹鍑猴級"
              >
                馃帣
              </button>
              <div className="flex-1" />
              {busy && (
                <span className="text-[10px] text-ink-muted/50 animate-pulse">鎬濊€冧腑鈥?/span>
              )}
            </div>
            <div className="chat-input-wrap mx-auto flex max-w-[920px] gap-2 p-1.5">
              <textarea
                ref={inputRef}
                {...bindComposerInput({
                  value: input,
                  onChange: (e) => setInput(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }
                })}
                rows={2}
                disabled={busy || !embeddingChatReady}
                placeholder={desktopAgentInputPlaceholder(desktopAgentModeActive, desktopAgentPreviewOnly)}
                className="min-h-[44px] flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/70 disabled:opacity-50"
              />
              <button
                type="button"
                disabled={busy || !embeddingChatReady}
                onClick={() => void send()}
                className="chat-send-btn inline-flex h-10 w-14 shrink-0 items-center justify-center text-sm font-medium disabled:opacity-50"
              >
                {busy ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80" />
                ) : (
                  '鈫?
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      <McEventStack />
    </div>
    <ConfirmExtensionDialog
      open={dispatchPending != null}
      extensionName={dispatchPending?.extensionName ?? ''}
      askMessage={dispatchPending?.askMessage ?? ''}
      onConfirm={(remember) => void respondDispatch(true, remember)}
      onReject={(remember) => void respondDispatch(false, remember)}
    />
    </>
  )
}
