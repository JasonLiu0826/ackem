import {AttachmentMenu} from './AttachmentMenu'
import {useAttachmentInput} from '../hooks/useAttachmentInput'
import {ChatFiles,AttachmentTray,AttachmentDropOverlay} from './ChatAttachments'
import type {ChatFile,ChatAttachment} from '../../../shared/chatAttachments'
import { ChatImages } from './ChatImages'
import type { ChatImage } from '../../../shared/chatImages'
import { WebSearchSetup } from './settings/WebSearchSettings'
import { TaskApprovalCards } from './TaskApprovalCards'
import { applyReplyEvent, type ReplyCursor } from '../lib/replyEvents'
import { ReplyActivities } from './ReplyActivities'
import { MessageTimestamp } from './MessageTimestamp'
import '../assets/chat.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../lib/i18n'
import {
  useAppStore,
  type ChatRow,
  normalizeChatRow,
  isPrimaryAgent,
} from '../store/appStore'
import { emotionLightColor } from '../lib/emotionColors'
import { useUiStore } from '../store/uiStore'
import { McEventStack } from './McEventStack'
import { StateBubbleStack, type StateBubble } from './StateBubbleStack'
import { useCompanionAvatar } from '../hooks/useCompanionAvatar'
import { useEmbeddingReadiness } from '../hooks/useEmbeddingReadiness'
import { LegacyPaperMessage } from './LegacyPaperMessage'
import { MemoryAuditCard } from './MemoryAuditCard'
import { PlanCreateChatCard } from './PlanCreateChatCard'
import { ChannelConfirmCard } from './ChannelConfirmCard'
import { useAsrDraft } from '../hooks/useAsrDraft'
import { useVoicePipeline } from '../hooks/useVoicePipeline'
import { loadVoiceSettings } from '../lib/voiceSettings'
import { IconMic } from './workbench/icons'
import {
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
import { RouteExplainPanel } from './RouteExplainPanel'
import { ThinkingPanel } from './ThinkingPanel'
import { CopyButton } from './CopyButton'
import { ChatFilePreview, ChatFilePreviewContext } from './ChatFilePreview'
import { ChatPositionRail } from './ChatPositionRail'
import { useChatScroll } from '../hooks/useChatScroll'
import { updateAssistantRow } from '../lib/chatMessageUpdate'
import { useWorkbenchStore } from '../store/workbenchStore'
import {ChatTaskUpdate} from './ChatTaskUpdate'
import {projectTaskBodyFeedback} from '../lib/taskBodyProjection'
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

function syncDispatchTriggerFromBuilt(
  built: Awaited<ReturnType<typeof window.ackem.buildContext>>
): void {
  useAppStore.getState().setDispatchTriggerStatus(built.dispatchTriggered ?? null)
}

/** 当前轮流式写入的 assistant 行下标（避免知识卡插入后误改上一条伴侣气泡） */
function patchAssistantAtIndex(
  setRows: (fn: (prev: ChatRow[]) => ChatRow[]) => void,
  index: number | null,
  content: string
): void {
  setRows((prev) => updateAssistantRow(prev, index, { content }))
}

export function ChatPage({ companionPanelOpen = false, onToggleCompanionPanel }: { companionPanelOpen?: boolean; onToggleCompanionPanel?: () => void } = {}): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const pushToast = useAppStore((s) => s.pushToast)
  const setTab = useAppStore((s) => s.setTab)
  const activeAgentId = useAppStore((s) => s.activeAgentId)
  const activeAgentName = useAppStore((s) => s.activeAgentName)
  const chattingPrimary = isPrimaryAgent(activeAgentId)
  const agentHistoryOpts = useMemo(
    () => (chattingPrimary ? undefined : { targetAgentId: activeAgentId }),
    [chattingPrimary, activeAgentId]
  )
  const agentChatTarget = chattingPrimary ? undefined : activeAgentId
  const openSettingsAt = useAppStore((s) => s.openSettingsAt)
  const rows = useAppStore((s) => s.chatRows)
  const workTasks=useWorkbenchStore(s=>s.tasks)
  const setRows = useAppStore((s) => s.setChatRows)
  const incrementTurn = useAppStore((s) => s.incrementTurn)
  const deleteAttempted = useAppStore((s) => s.deleteAttempted)
  const setDeleteAttempted = useAppStore((s) => s.setDeleteAttempted)
  const personalityAwakening = useAppStore((s) => s.personalityAwakening)
  const setPersonalityAwakening = useAppStore((s) => s.setPersonalityAwakening)
  const chatFocusToken = useAppStore((s) => s.chatFocusToken)
  const [input, setInput] = useState('')
  const [images,setImages]=useState<ChatImage[]>([])
  const [files,setFiles]=useState<ChatFile[]>([])
  const [busy, setBusy] = useState(false)
  const [streamStarted, setStreamStarted] = useState(false)
  const [stopping, setStopping] = useState(false)
  const stoppedRef = useRef(false)
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
  const [channelPending, setChannelPending] = useState<{
    planId: string
    kind: 'create' | 'update' | 'work_job' | 'use_missing' | 'plugin_ask' | 'plugin_use'
    askMessage: string
    cwd?: string
    candidates?: Array<{ id: string; name: string }>
    userText: string
    recent: { role: 'user' | 'assistant'; content: string }[]
    turnIndex: number
    explicitRel?: string
    imagePaths?: string[]
    filePaths?: string[]
    systemHint?: string
  } | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [lastInject, setLastInject] = useState<string>('')
  // 阶段 1「判决可见」: 本轮路由判决解释（账本读回，缺判决为 null）。
  const [routeExplain, setRouteExplain] = useState<import('../ackem.d.ts').BuildContextResult['routeExplain']>(null)
  // 思考中 (DeepSeek 式): reasoning_content 单独通道累计, 折叠灰度显示。
  const [thinkingText, setThinkingText] = useState('')
  const { scrollRef, contentRef, isFollowing, isAtBottom, pause: pauseScroll, resume: resumeScroll } = useChatScroll()
  const [thinkingState, setThinkingState] = useState<'idle' | 'thinking' | 'done'>('idle')
  const [sessions, setSessions] = useState<Array<{ id: string; name: string }>>([])
  const streamBuf = useRef('')
  const wavePrefixRef = useRef('')
  const replyCursorRef = useRef<ReplyCursor>({ turnId: '', sequence: 0, terminal: false })
  /** 本轮 startChat / 归档取消 正在写入的 assistant 行号 */
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
  const sendRef = useRef<() => Promise<void>>(async () => undefined)
  const voice = useVoicePipeline({ surface: 'chat', active: !theaterOpen })
  const asr = useAsrDraft({
    enabled: !theaterOpen,
    getText: () => input,
    setText: setInput,
    onVoiceOnlyFinal: () => {
      void sendRef.current()
    }
  })
  const [stateBubbles, setStateBubbles] = useState<StateBubble[]>([])
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
        await window.ackem.openforu.workspaces.create(planTopic?.trim() || undefined)
        setPlanOpen(true)
        return true
      } catch (e) {
        pushToast(e instanceof Error ? e.message : String(e))
        return false
      }
    },
    [settings, pushToast, setTab, setPlanOpen]
  )

  const activeSessionId = chattingPrimary
    ? settings?.activeSessionId || 'default'
    : activeAgentId
  const taskFeedback=useMemo(()=>projectTaskBodyFeedback(rows,chattingPrimary?workTasks:[],activeSessionId),[rows,workTasks,chattingPrimary,activeSessionId])

  useEffect(()=>{setImages([]);setFiles([])},[activeAgentId,activeSessionId])
  const attachmentsInput=useAttachmentInput(items=>{
    const incomingImages=items.filter((i):i is ChatAttachment&{kind:'image'}=>i.kind==='image')
    const incomingFiles=items.filter((i):i is ChatFile=>i.kind!=='image')
    if(images.length+incomingImages.length>4||images.length+files.length+items.length>10){pushToast('最多添加 10 个附件，其中图片最多 4 张');return}
    setImages(prev=>[...prev,...incomingImages]);setFiles(prev=>[...prev,...incomingFiles])
  },pushToast,`${activeAgentId}:${activeSessionId}`)
  useEffect(() => { resumeScroll() }, [activeSessionId, activeAgentId, resumeScroll])

  const persistHistory = useCallback(
    (rows?: ChatRow[]) => {
      void window.ackem.saveChatHistory(
        rows ?? useAppStore.getState().chatRows,
        agentHistoryOpts
      )
    },
    [agentHistoryOpts]
  )

  useEffect(() => {
    if (!settings || !chattingPrimary) {
      setDesktopAgentChatMode(false)
      return
    }
    setDesktopAgentSettingsReady(isDesktopAgentSettingsReady(settings))
    if (!isDesktopAgentApiAvailable()) return
    void window.ackem.desktopAgent.sessionMode.get(activeSessionId).then((r) => {
      setDesktopAgentChatMode(r.enabled && r.settingsReady)
      setDesktopAgentSettingsReady(r.settingsReady)
    })
  }, [settings, activeSessionId, chattingPrimary])

  const handleDesktopAgentToggle = useCallback(
    async (next: boolean) => {
      if (isDesktopAgentGrayscalePreview()) return
      if (!isDesktopAgentApiAvailable()) {
        pushToast(desktopAgentApiMissingMessage())
        return
      }
      const res = await window.ackem.desktopAgent.sessionMode.set(activeSessionId, next)
      if (!res.ok) {
        pushToast(res.error ?? '无法切换电脑助手模式')
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
            const opening = await window.ackem.desktopAgent.opening()
            if (opening.ok && opening.text.trim()) {
              setRows((prev) => [
                ...prev,
                { kind: 'message', role: 'assistant', createdAt: Date.now(), content: opening.text.trim() }
              ])
              persistHistory()
            }
          } catch (e) {
            pushToast(e instanceof Error ? e.message : String(e))
          } finally {
            setBusy(false)
          }
        }
      }
    },
    [activeSessionId, pushToast, setRows, persistHistory]
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

  const finishThinking = useCallback(() => {
    const index = streamingAssistantIndexRef.current
    setRows((prev) => {
      const row = index != null ? prev[index] : undefined
      if (row?.kind !== 'message' || row.reasoningStartedAt == null || row.reasoningDurationMs != null) return prev
      return updateAssistantRow(prev, index, { reasoningDurationMs: Math.max(0, Date.now() - row.reasoningStartedAt) })
    })
    setThinkingState((state) => state === 'thinking' ? 'done' : state)
  }, [setRows])

  const clearStreamingAssistantIndex = useCallback(() => {
    finishThinking()
    streamingAssistantIndexRef.current = null
  }, [finishThinking])

  useEffect(() => window.ackem.onReplyEvent?.((event) => {
    if (event.sessionId !== activeSessionId || event.turnId !== replyCursorRef.current.turnId) return
    const index = streamingAssistantIndexRef.current
    setRows(prev => {
      const applied = applyReplyEvent(prev, index, replyCursorRef.current, event)
      if (applied.cursor === replyCursorRef.current) return prev
      replyCursorRef.current = applied.cursor
      const row = index === null ? undefined : applied.rows[index]
      if (row?.kind === 'message') streamBuf.current = row.content
      return applied.rows
    })
    if (event.type === 'delta' || event.type === 'replace' || event.type === 'completed') finishThinking()
    if (event.type === 'reasoning') setThinkingState('thinking')
    if (event.type === 'started') setStreamStarted(true)
    if (event.type === 'status') setActivityLabel(normalizeChatActivityLabel(event.text))
  }), [activeSessionId, setRows, finishThinking])

  useEffect(() => window.ackem.onChatDelivery?.(({ sessionId, row: raw }) => {
    if (sessionId !== activeSessionId) return
    const row = normalizeChatRow(raw)
    if (!row || row.kind !== 'message') return
    setRows(prev => {
      if (row.replyId) {
        const index = prev.findIndex(item => item.kind === 'message' && item.replyId === row.replyId)
        if (index >= 0) { const next = [...prev]; next[index] = row; return next }
      }
      return [...prev, row]
    })
  }), [activeSessionId, setRows])

  useEffect(() => window.ackem.onTaskReplyProgress?.(event => {
    if (event.sessionId !== activeSessionId) return
    setRows(prev => prev.map(row => row.kind === 'message' && row.origin === 'action_ack' && row.runId === event.runId ? { ...row, activities: [...(row.activities ?? []), { text: event.text, at: event.at, source: 'runtime' as const }].slice(-40) } : row))
  }), [activeSessionId, setRows])
  const lastTypingActivityRef = useRef(0)
  useEffect(() => { if (input && Date.now() - lastTypingActivityRef.current >= 1000) { lastTypingActivityRef.current = Date.now(); void window.ackem.touchChatActivity?.() } }, [input])

  const bindChatStreamHandlers = useCallback(() => {
    window.ackem.onChatStreamStart(() => {
      setStreamStarted(true)
      setThinkingText('')
      setThinkingState('idle')
      setActivityLabel(null)
      setInvestigationProgress(null)
      if (!useAppStore.getState().agentBusy) {
        setTaskPlanProgress(null)
      }
    })
    window.ackem.onChatWaveStart(({ newBubble }) => {
      if (window.ackem.onReplyEvent) return
      setActivityLabel(null)
      // Runtime sentence waves are delivery segments of one reply, not separate turns.
      wavePrefixRef.current = newBubble && streamBuf.current.trim() ? `${streamBuf.current}\n\n` : ''
      streamBuf.current = wavePrefixRef.current
    })
    window.ackem.onChatChunk((c) => {
      if (window.ackem.onReplyEvent) return
      setActivityLabel(null)
      finishThinking()
      streamBuf.current += c
      patchStreamingAssistant(streamBuf.current)
    })
    window.ackem.onChatReasoning((delta) => {
      if (window.ackem.onReplyEvent) return
      setActivityLabel(null)
      setThinkingState('thinking')
      setThinkingText((prev) => prev + delta)
      setRows((prev) => {
        const index = streamingAssistantIndexRef.current
        if (index == null) return prev
        const row = prev[index]
        return updateAssistantRow(prev, index, { reasoning: (row?.kind === 'message' ? row.reasoning ?? '' : '') + delta,
          reasoningStartedAt: row?.kind === 'message' ? row.reasoningStartedAt ?? Date.now() : Date.now() })
      })
    })
    window.ackem.onChatWaveEnd(({ text }) => {
      if (window.ackem.onReplyEvent) return
      if (text) {
        streamBuf.current = wavePrefixRef.current + text
        patchStreamingAssistant(streamBuf.current)
      }
    })
    window.ackem.onChatReplace((text) => {
      if (window.ackem.onReplyEvent) return
      finishThinking()
      setActivityLabel(null)
      setInvestigationProgress(null)
      if (!useAppStore.getState().agentBusy) {
        setTaskPlanProgress(null)
      }
      streamBuf.current = text
      patchStreamingAssistant(text)
    })
    window.ackem.onChatStatus((text) => {
      const label = normalizeChatActivityLabel(text)
      setActivityLabel(label || null)
    })
    window.ackem.onInvestigationProgress((payload) => {
      setInvestigationProgress(payload)
    })
    window.ackem.onTaskPlanProgress((payload) => {
      setTaskPlanProgress(payload)
    })
    window.ackem.onChatSearchCard((payload) => {
      insertSearchCard(payload)
    })
    window.ackem.onChatMemoryAudit((payload) => {
      insertMemoryAuditCard(payload)
    })
  }, [insertMemoryAuditCard, insertSearchCard, patchStreamingAssistant, setRows, finishThinking])

  const appendTaskDeliveryToChat = useCallback(
    (payload: DesktopAgentTaskDeliveryPayload) => {
      const prefix = payload.allPassed ? '✅ 电脑助手任务完成' : '⚠️ 电脑助手任务未完成'
      const content = `${prefix}：${payload.goalSummary}\n\n${payload.text}`
      setRows((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (
          last?.kind === 'message' &&
          last.role === 'assistant' &&
          last.content === DESKTOP_AGENT_TASK_START_ACK
        ) {
          next[next.length - 1] = { kind: 'message', role: 'assistant', createdAt: Date.now(), content }
        } else {
          next.push({ kind: 'message', role: 'assistant', createdAt: Date.now(), content })
        }
        persistHistory(next)
        return next
      })
    },
    [setRows, persistHistory]
  )

  useEffect(() => {
    if (!isDesktopAgentApiAvailable()) return
    const offConfirm = window.ackem.desktopAgent.confirm.onRequest((payload) => {
      setDesktopAgentConfirm(payload)
    })
    window.ackem.onDesktopAgentAgentBusy?.(({ sessionId: sid, busy: ab }) => {
      if (sid !== activeSessionId) return
      setAgentBusy(ab)
    })
    window.ackem.onDesktopAgentJobState?.((payload) => {
      if (payload.sessionId !== activeSessionId) return
      setAgentJobState(payload)
      if (!payload.active) {
        setAgentJobStatus(null)
      }
    })
    window.ackem.onDesktopAgentJobStatus?.(({ sessionId: sid, label }) => {
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
    window.ackem.onDesktopAgentTaskDelivery?.(handleDelivery)
    window.ackem.onDesktopAgentTaskDeliveryQueued?.(handleDelivery)
    return () => {
      offConfirm()
    }
  }, [activeSessionId, setAgentBusy, appendTaskDeliveryToChat])

  useEffect(() => {
    void window.ackem
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
    const field = inputRef.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${Math.min(field.scrollHeight, 180)}px`
  }, [input])

  const threadColor = emotionLightColor(emotionLabel)
  const lastAssistantIdx = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i]
      if (r.kind === 'message' && r.role === 'assistant') return i
    }
    return -1
  }, [rows])

  useEffect(() => {
    void window.ackem?.ensureLayout()
    turnRef.current = 0
    void window.ackem?.loadChatHistory(agentHistoryOpts).then((history: unknown[]) => {
      if (!history?.length) {
        setRows([])
        return
      }
      const normalized = history.map(normalizeChatRow).filter((r): r is ChatRow => r != null)
      setRows(normalized)
      turnRef.current = normalized.filter(
        (r) => r.kind === 'message' && r.role === 'user'
      ).length
    }).catch(() => {
      setRows([])
    })
  }, [activeAgentId, agentHistoryOpts, setRows])

  // Load session list
  useEffect(() => {
    void window.ackem?.sessionList().then(list => {
      if (list && list.length > 0) setSessions(list)
    }).catch(() => {})
  }, [activeSessionId])

  const focusChatInput = useCallback(() => {
    // 用多层 retry 确保在 Electron 焦点状态异常时也能恢复
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      // Electron 在 native dialog 关闭后可能异步重置焦点，加延迟 retry
      setTimeout(() => inputRef.current?.focus(), 50)
      setTimeout(() => inputRef.current?.focus(), 150)
    })
  }, [])

  useEffect(() => {
    focusChatInput()
  }, [chatFocusToken, focusChatInput])

  useEffect(() => {
    window.ackem?.onDispatchProactive?.((payload) => {
      pushToast(`${payload.extensionId}: ${payload.message.slice(0, 80)}`)
    })
  }, [pushToast])

  useEffect(() => {
    window.ackem?.onExtensionTrigger?.((status) => {
      useAppStore.getState().setDispatchTriggerStatus(status)
    })
  }, [])

  const desktopAgentPreviewOnly = isDesktopAgentGrayscalePreview()
  const desktopAgentModeActive = false

  const runChatFromBuilt = useCallback(
    async (
      built: Awaited<ReturnType<typeof window.ackem.buildContext>>,
      awakeningHint?: string,
      sourceText?: string,
      imagePaths?: string[],
      filePaths?: string[]
    ) => {
      if (!settings) return
      replyCursorRef.current = { turnId: built.turnId ?? '', sequence: 0, terminal: false }
      setRows(prev => updateAssistantRow(prev, streamingAssistantIndexRef.current, { turnId: built.turnId, replyId: built.turnId ? `reply-${built.turnId}` : undefined, origin: built.channelDispatch ? 'action_ack' : 'answer', runId: built.channelDispatch?.runId }))

      setLastInject(
        JSON.stringify({ messages: built.messages, trace: built.tracePreview }, null, 2).slice(0, 12000)
      )

      bindChatStreamHandlers()
      window.ackem.onChatDone((meta) => {
        if (meta?.turnId && meta.turnId !== replyCursorRef.current.turnId) return
        if (meta?.sessionId && meta.sessionId !== activeSessionId) return
        if (meta?.assistantText && !stoppedRef.current) patchStreamingAssistant(meta.assistantText)
        setActivityLabel(null)
        setInvestigationProgress(null)
        clearStreamingAssistantIndex()
        if (meta?.stateDelta?.bubbles?.length) {
          setStateBubbles(meta.stateDelta.bubbles)
        }
        if (meta?.memoryWrites?.length) {
          pushToast(t('chat.memoryWrite', { writes: meta.memoryWrites.join('; ') }))
        }
        incrementTurn()
        persistHistory()
      })
      window.ackem.onChatError((err) => {
        setActivityLabel(null)
        setInvestigationProgress(null)
        if (stoppedRef.current) return
        if (String(err) === 'EMBEDDING_WARMING') {
          pushToast(t('chat.embedding.warming'))
          return
        }
        pushToast(err)
        setRows((prev) => updateAssistantRow(prev, streamingAssistantIndexRef.current, {
          content: streamBuf.current || t('chat.error', { error: String(err) }), generationState: 'error'
        }))
      })

      if (built.skipLlm && built.redlineReply) {
        patchStreamingAssistant(built.redlineReply ?? '')
        clearStreamingAssistantIndex()
        incrementTurn()
        persistHistory()
        return
      }

      if (built.channelDispatch) {
        // 自主派工 (2026-10-04): 任务已进工作台固定 Ackem 任务, 聊天只回固定 ack。
        useWorkbenchStore.getState().injectChatDispatch({
          taskId: built.channelDispatch.taskId,
          turnId: built.channelDispatch.turnId,
          text: sourceText ?? '',
          cwd: built.channelDispatch.cwd,
          sessionId: built.channelDispatch.sessionId,
          runId: built.channelDispatch.runId,
          queued: built.channelDispatch.queued
        })
        patchStreamingAssistant(built.assistantAck ?? '收到，已派给工作台开工，稍等。')
        clearStreamingAssistantIndex()
        persistHistory()
        return
      }

      if (built.enterPlanMode) {
        if (!chattingPrimary) {
          patchStreamingAssistant('社会成员对话不支持 Plan / 扩展模式。')
          clearStreamingAssistantIndex()
          return
        }
        const opened = await enterPlanWithWorkspace(built.planTopic)
        patchStreamingAssistant(
          opened
            ? t('chat.openPlan')
            : `${OPENFORU_NOT_CONFIGURED_MSG} 请先到设置页填写 OpenForU 专用模型后再试。`
        )
        clearStreamingAssistantIndex()
        return
      }

      await window.ackem.startChat({
        messages: built.messages,
        imagePaths,
        filePaths,
        fileHistory: rows.filter((r):r is Extract<ChatRow,{kind:'message'}>=>r.kind==='message'&&r.role==='user'&&!!r.files?.length).slice(-2).map(r=>({text:r.content,paths:r.files!.map(f=>f.path)})),
        imageHistory: rows.filter((r):r is Extract<ChatRow,{kind:'message'}>=>r.kind==='message'&&r.role==='user'&&!!r.images?.length).slice(-3).map(r=>({text:r.content,paths:r.images!.map(i=>i.path)})),
        settings,
        turnId: built.turnId,
        knowledgeTopic: chattingPrimary
          ? built.knowledgeTopic ?? built.suggestedSearchQuery
          : undefined,
        suggestedSearchQuery: chattingPrimary
          ? built.knowledgeTopic ?? built.suggestedSearchQuery
          : undefined,
        forcedWebSearchQuery: chattingPrimary ? built.forcedWebSearchQuery : undefined,
        planDocumentTopic: chattingPrimary ? built.planDocumentTopic : undefined,
        userTaskFrame: chattingPrimary ? built.userTaskFrame : undefined,
        useWaveChat: chattingPrimary ? built.useWaveChat : undefined,
        wavePlan: chattingPrimary ? built.wavePlan : undefined,
        waveContext: chattingPrimary ? built.waveContext : undefined,
        sessionId: activeSessionId,
        targetAgentId: agentChatTarget,
        interactionSurface: 'desktop_main',
        desktopAgentChatMode: chattingPrimary ? desktopAgentModeActive : false,
        desktopAgentCapability: chattingPrimary ? built.desktopAgentCapability : undefined
      })
    },
    [
      settings,
      rows,
      bindChatStreamHandlers,
      clearStreamingAssistantIndex,
      incrementTurn,
      patchStreamingAssistant,
      pushToast,
      enterPlanWithWorkspace,
      desktopAgentModeActive,
      chattingPrimary,
      activeSessionId,
      agentChatTarget,
      persistHistory
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
          { kind: 'message', role: 'assistant', createdAt: Date.now(), content: t('chat.needMore') }
        ])
        return
      }
      const opened = await enterPlanWithWorkspace(row.planTopic)
      setRows((prev) => [
        ...prev,
        {
          kind: 'message',
          role: 'assistant',
          createdAt: Date.now(),
          content: opened
            ? t('chat.openPlan')
            : `${OPENFORU_NOT_CONFIGURED_MSG} 请先到设置页填写 OpenForU 专用模型后再试。`
        }
      ])
    },
    [enterPlanWithWorkspace, setRows]
  )

  useEffect(() => {
    const onWinFocus = () => focusChatInput()
    window.addEventListener('focus', onWinFocus)
    // 主进程 BrowserWindow focus 事件也会通过 IPC 转发到此处
    window.ackem?.onWindowFocused(() => focusChatInput())
    return () => window.removeEventListener('focus', onWinFocus)
  }, [focusChatInput])

  // 用户取消了归档 → AI 主动表达被背叛的感受（无用户可见消息）
  const deleteEffectRun = useRef(false)
  useEffect(() => {
    if (!deleteAttempted || !settings) return
    if (deleteEffectRun.current) return  // 防止 React StrictMode 双次执行
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
      // 不放用户消息，AI 主动开口
      const prevRows = useAppStore.getState().chatRows
      const archiveAssistantIndex = prevRows.length
      streamingAssistantIndexRef.current = archiveAssistantIndex
      setRows([...prevRows, { kind: 'message', role: 'assistant', createdAt: Date.now(), content: '' }])
      const turnIndex = ++turnRef.current

      bindChatStreamHandlers()

      try {
        const built = await window.ackem.buildContext({
          userText: t('chat.archiveSilent'),
          systemHint,
          recentMessages: prevRows
            .filter((m): m is Extract<ChatRow, { kind: 'message' }> => m.kind === 'message')
            .slice(-24)
            .map((m) => ({ role: m.role, content: m.content })),
          sessionId: activeSessionId,
          turnIndex,
          targetAgentId: agentChatTarget
        })
        syncDispatchTriggerFromBuilt(built)

        window.ackem.onChatDone(() => {
          clearStreamingAssistantIndex()
          incrementTurn()
          persistHistory()
        })
        window.ackem.onChatError((err) => {
          if (stoppedRef.current) return
        if (String(err) === 'EMBEDDING_WARMING') {
            pushToast(t('chat.embedding.warming'))
            return
          }
          pushToast(err)
          persistHistory()
          setRows((prev) => updateAssistantRow(prev, streamingAssistantIndexRef.current, {
          content: streamBuf.current || t('chat.error', { error: String(err) }), generationState: 'error'
        }))
        })

        if (built.skipLlm && built.redlineReply) {
          patchStreamingAssistant(built.redlineReply ?? '')
          clearStreamingAssistantIndex()
        } else {
          replyCursorRef.current = { turnId: built.turnId ?? '', sequence: 0, terminal: false }
          await window.ackem.startChat({
            messages: built.messages,
            settings,
            turnId: built.turnId,
            forcedWebSearchQuery: chattingPrimary ? built.forcedWebSearchQuery : undefined,
            userTaskFrame: chattingPrimary ? built.userTaskFrame : undefined,
            useWaveChat: chattingPrimary ? built.useWaveChat : undefined,
            wavePlan: chattingPrimary ? built.wavePlan : undefined,
            waveContext: chattingPrimary ? built.waveContext : undefined,
            sessionId: activeSessionId,
            targetAgentId: agentChatTarget,
            interactionSurface: 'desktop_main'
          })
        }
      } catch (e) {
        pushToast(e instanceof Error ? e.message : String(e))
      } finally {
        setStreamStarted(false)
        setStopping(false)
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
    const validation = validateChatSend(input || (images.length||files.length ? '请看看这些附件。' : ''), settings, busy, t('chat.docOnly'), embeddingReadiness)
    if (!validation.ok) {
      const msg = chatSendBlockReasonMessage(validation.reason)
      if (msg === 'settings.loading') pushToast(t('settings.loading'))
      else if (msg === 'chat.embedding.warming') pushToast(t('chat.embedding.warming'))
      else if (msg) pushToast(msg.startsWith('chat.') ? t(msg) : msg)
      return
    }
    if(attachmentsInput.pending){pushToast('请等附件添加完成');return}
    const sentImagePaths=images.map(i=>i.path)
    const sentFilePaths=files.map(f=>f.path)
    stoppedRef.current = false
    setStopping(false)
    setStreamStarted(false)
    const { raw: userLine, clean, rel } = validation
    setThinkingText('')
    setThinkingState('idle')
    resumeScroll()
    setBusy(true)
    setActivityLabel('正在准备回复')
    streamBuf.current = ''
    turnRef.current += 1
    const turnIndex = turnRef.current
    const { rowsWithPlaceholder, assistantIndex, recentMessages: recent } = buildChatSendOptimisticRows(
      rows,
      userLine
    )
    streamingAssistantIndexRef.current = assistantIndex
    if(images.length||files.length){const row=rowsWithPlaceholder[assistantIndex-1];if(row.kind==='message'){row.images=images;row.files=files}}
    setRows(rowsWithPlaceholder)
    setImages([])
    setFiles([])
    setInput('')
    incrementTurn()  // 触发情绪面板刷新

    const nextCore = rowsWithPlaceholder.slice(0, -1)

    // 人格觉醒：切换后首次对话注入过渡提示
    const awakeningHint = personalityAwakening
      ? `【人格觉醒提示 · 仅作演绎参考，勿直接复述】你的性格刚才发生了变化。你现在更接近"${personalityAwakening}"的特质。你仍是同一个人，记得我们之间的一切，但你看待世界的方式有了一些微妙的不同。请在接下来的对话中自然地体现这种变化，不要直接说出"我变了"或"我的性格变了"。随着对话推进，你会越来越自然地融入新的性格。`
      : undefined
    if (awakeningHint) setPersonalityAwakening(null)

    bindChatStreamHandlers()

    try {
      const built = await window.ackem.buildContext(
        buildChatContextRequest({
          clean,
          userLine,
          imagePaths: sentImagePaths,
          filePaths: sentFilePaths,
          rel,
          recentMessages: recent,
          sessionId: activeSessionId,
          turnIndex,
          systemHint: awakeningHint,
          desktopAgentChatMode: chattingPrimary ? desktopAgentModeActive : false,
          targetAgentId: agentChatTarget,
          interactionSurface: 'desktop_main'
        })
      )
      syncDispatchTriggerFromBuilt(built)
      setLastInject(
        JSON.stringify({ messages: built.messages, trace: built.tracePreview }, null, 2).slice(0, 12000)
      )
      setRouteExplain(built.routeExplain ?? null)

      if (built.channelPending) {
        setRows(nextCore)
        streamingAssistantIndexRef.current = null
        setChannelPending({
          ...built.channelPending,
          userText: clean || userLine,
          recent,
          turnIndex,
          explicitRel: rel,
          imagePaths: sentImagePaths,
          filePaths: sentFilePaths,
          systemHint: awakeningHint
        })
        return
      }

      await runChatFromBuilt(built, awakeningHint, clean || userLine, sentImagePaths, sentFilePaths)
    } catch (e) {
      console.error('[send] error:', e)
      pushToast(e instanceof Error ? e.message : String(e))
      setRows((prev) => updateAssistantRow(prev, streamingAssistantIndexRef.current, {
        content: streamBuf.current || `（错误）${e instanceof Error ? e.message : String(e)}`, generationState: 'error'
      }))
    } finally {
      setActivityLabel(null)
      if (stoppedRef.current) {
        const index = streamingAssistantIndexRef.current
        setRows((prev) => updateAssistantRow(prev, index, { generationState: 'stopped' }))
      }
      clearStreamingAssistantIndex()
      setStreamStarted(false)
      setStopping(false)
      setBusy(false)
      persistHistory()
    }
  }, [
    busy,
    images,
    files,
    attachmentsInput.pending,
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
    chattingPrimary,
    agentChatTarget
  ])
  sendRef.current = send
  useEffect(() => {
    if (voice.micActive) asr.beginListen()
  }, [voice.micActive, asr.beginListen])

  if (!settings) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface text-sm text-ink-muted">
        正在加载设置…
      </div>
    )
  }

  return (
    <ChatFilePreviewContext.Provider value={(path) => { setDrawer(false); setPreviewPath(path) }}>
    <div
      {...attachmentsInput.dragProps}
      className="chat-page flex h-full min-h-0 min-w-0 flex-1 flex-col bg-surface"
    >
      <AttachmentDropOverlay visible={attachmentsInput.dragging} pending={attachmentsInput.pending}/>
      <header className="chat-page-header glass-panel flex items-center justify-between border-b border-surface-inset/60 px-6 py-3">
        <div>
          <h1 className="font-display text-base font-semibold text-ink">
            {chattingPrimary ? 'Ackem' : activeAgentName}
          </h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {chattingPrimary ? (
              <>随时聊聊，一起把事情做好</>
            ) : (
              <>社会成员 · 在「社会成员」中切换角色</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onToggleCompanionPanel && <button type="button" aria-pressed={companionPanelOpen}
            onClick={onToggleCompanionPanel} className="chat-copy-button">伴侣状态</button>}
          {chattingPrimary && sessions.length > 1 && (
            <select
              value={activeSessionId}
              disabled={busy}
              aria-label="切换会话"
              onChange={async (e) => {
                const newId = e.target.value
                if (newId === activeSessionId) return
                try {
                  const r = await window.ackem.sessionSwitch(newId)
                  if (r.ok && r.settings) {
                    useAppStore.getState().setSettings(r.settings)
                    useAppStore.getState().resetChat()
                    turnRef.current = 0
                    const history = await window.ackem.loadChatHistory(agentHistoryOpts)
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
                    pushToast('已切换会话')
                  } else {
                    pushToast(r.error ?? '切换失败')
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
          <button
            type="button"
            onClick={() => { setPreviewPath(null); setDrawer((d) => !d) }}
            className="rounded-lg border border-glass-border px-3 py-1.5 text-xs text-ink-muted transition hover:border-accent/30 hover:text-ink"
          >
            {drawer ? '隐藏' : '查看'}上下文
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="chat-main-column relative flex min-w-0 flex-1 flex-col">
          <InvestigationProgressBar progress={investigationProgress} />
          <div className="chat-transcript-shell">
          <ChatPositionRail scrollRef={scrollRef} rows={taskFeedback.rows} onNavigate={pauseScroll} />
          <div ref={scrollRef} className="chat-transcript min-h-0 flex-1 overflow-y-auto" role="log" aria-label="对话记录" aria-busy={busy} tabIndex={0}>
            <div ref={contentRef} className="chat-transcript-inner">
            {taskFeedback.rows.length === 0 && (
              <div className="chat-empty-state">
                {chattingPrimary
                  ? <><h2 className="chat-welcome-title">今天，一起做点什么？</h2><p className="chat-welcome-description">聊聊近况，梳理想法，或交给我一项任务。</p></>
                  : `正在与 ${activeAgentName} 对话。可在「社会成员」切换角色；记忆档案会跟随当前角色。`}
              </div>
            )}
            <StateBubbleStack bubbles={stateBubbles} onDismiss={() => setStateBubbles([])} />
            <WebSearchSetup />
            {taskFeedback.rows.map((m, i) => {
              if (m.kind === 'search') {
                return <LegacyPaperMessage key={`search-${i}`} {...m} />
              }
              if (m.kind === 'memoryAudit') {
                return <MemoryAuditCard key={`audit-${i}`} {...m} />
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
                    className="message-system chat-system-message border-l-2 pl-3"
                    style={{ borderColor: border }}
                  >
                    {m.content}
                    <CopyButton text={m.content} />
                  </div>
                )
              }
              if (m.role === 'user') {
                return (
                  <article key={`msg-${i}`} data-chat-row={i} className="chat-turn chat-turn-user">
                    <div className="chat-message-label">你</div>
                    <div className="message-user"><AttachmentTray images={m.images??[]} files={m.files??[]}/><div className="whitespace-pre-wrap">{m.content}</div></div>
                    <div className="chat-user-meta">
                      <MessageTimestamp createdAt={m.createdAt} />
                      <div className="chat-user-copy"><CopyButton text={m.content} label="复制消息" /></div>
                    </div>
                  </article>
                )
              }
              const isCurrentStream = busy && i === streamingAssistantIndexRef.current
              if(!isCurrentStream&&(m.origin==='action_result'||m.origin==='action_ack')){if(taskFeedback.hidden.has(i))return null;return <article key={`msg-${i}`} data-chat-row={i} className="chat-turn chat-turn-task"><ChatTaskUpdate message={m} history={taskFeedback.history.get(i)} updates={taskFeedback.updates.get(i)}/></article>}
              if (!m.content && !m.reasoning && !m.generationState && !isCurrentStream) return null
              const showBridge =
                i > 0 &&
                m.kind === 'message' &&
                m.role === 'assistant' &&
                prevEmotionLabel !== emotionLabel &&
                i === lastAssistantIdx
              return (
                <article key={`msg-${i}`} data-chat-row={i} className="chat-turn chat-turn-assistant">
                  <div className="chat-message-label">{chattingPrimary ? 'Ackem' : activeAgentName}{m.sourceLabel && <span className="chat-reply-source"> · {m.sourceLabel}</span>}</div>
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
                      isCurrentStream ? 'streaming' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ ['--thread-color' as string]: threadColor }}
                  >
                    {m.reasoning && <ThinkingPanel state={isCurrentStream ? thinkingState : 'done'} text={m.reasoning} startedAt={m.reasoningStartedAt} durationMs={m.reasoningDurationMs} />}
                    {m.content ? (
                      isCurrentStream ? <StreamingMessage text={m.content} active /> : <MarkdownContent source={m.content} chat />
                    ) : isCurrentStream ? <ChatTypingIndicator label={activityLabel ?? (thinkingState === 'thinking' ? '正在思考' : '正在准备回复')} /> : null}
                  </div>
                  {m.content && <div className="chat-message-actions"><CopyButton text={m.content} iconOnly /><MessageTimestamp createdAt={m.createdAt} /></div>}
                  <ReplyActivities items={m.activities} />
                  {m.generationState && <div className="chat-generation-status" role="status">{m.generationState === 'stopped' ? '已停止生成' : m.generationState === 'incomplete' ? '回答达到输出上限，已保留内容；可以让我继续。' : '生成失败，已保留收到的内容'}</div>}
                </article>
              )
            })}
            <TaskApprovalCards sessionId={activeSessionId} />
            <div ref={chatEndRef} />
            </div>
          </div>
          </div>
          {!isFollowing && !isAtBottom && <button type="button" className="chat-scroll-bottom" onClick={resumeScroll}>↓ 回到最新并继续跟随</button>}
          <div className="chat-composer-area">
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
                电脑助手在下方面板执行中，你可以继续聊天。
              </div>
            ) : null}
            {chattingPrimary && !desktopAgentPreviewOnly ? (
            <DesktopAgentDock
              sessionId={activeSessionId}
              progress={taskPlanProgress}
              confirm={desktopAgentConfirm}
              jobState={agentJobState}
              jobStatusLabel={agentJobStatus}
              pendingDelivery={pendingTaskDelivery}
              onAllowOnce={() => {
                if (!desktopAgentConfirm || !isDesktopAgentApiAvailable()) return
                void window.ackem.desktopAgent.confirm
                  .allow(desktopAgentConfirm.requestId)
                  .then(() => setDesktopAgentConfirm(null))
              }}
              onAllowSession={() => {
                if (!desktopAgentConfirm || !isDesktopAgentApiAvailable()) return
                void window.ackem.desktopAgent.confirm
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
                void window.ackem.desktopAgent.confirm
                  .allowTaskDeletes(
                    desktopAgentConfirm.requestId,
                    desktopAgentConfirm.taskPlanId
                  )
                  .then(() => setDesktopAgentConfirm(null))
              }}
              onDeny={() => {
                if (!desktopAgentConfirm || !isDesktopAgentApiAvailable()) return
                void window.ackem.desktopAgent.confirm
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
            <AttachmentTray images={images} files={files} onRemove={path=>{setFiles(prev=>prev.filter(f=>f.path!==path));setImages(prev=>prev.filter(i=>i.path!==path))}}/>
            <div className="chat-input-wrap mx-auto flex max-w-[920px] gap-2 p-1.5">
              <AttachmentMenu disabled={attachmentsInput.pending} onSelect={kind=>void attachmentsInput.select(kind)}/>
              <textarea
                ref={inputRef}
                {...bindComposerInput({
                  value: input,
                  onChange: (e) => asr.onUserType(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                      e.preventDefault()
                      void send()
                    }
                  }
                })}
                rows={1}
                aria-label="输入消息"
                disabled={!embeddingChatReady}
                placeholder={
                  voice.micActive
                    ? asr.recognizing
                      ? '识别中…'
                      : '正在听… 说完会写进输入框'
                    : chattingPrimary
                      ? desktopAgentInputPlaceholder(desktopAgentModeActive, desktopAgentPreviewOnly)
                      : `和 ${activeAgentName} 说点什么... (Shift+Enter 换行)`
                }
                className="min-h-[44px] flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/70 disabled:opacity-50"
              />
              <button
                type="button"
                className={[
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-muted',
                  voice.micActive ? 'bg-cyan-500/15 text-cyan-600' : ''
                ].join(' ')}
                title={voice.micActive ? '关掉麦克风' : '语音输入'}
                onClick={() => {
                  if (!loadVoiceSettings().enabled) {
                    pushToast('请先在设置里启用语音，并准备好语音环境')
                    openSettingsAt('settings-voice')
                    return
                  }
                  if (loadVoiceSettings().voiceMode === 'ptt') return
                  voice.toggleMic()
                }}
                onPointerDown={(e) => {
                  if (loadVoiceSettings().voiceMode !== 'ptt') return
                  if (!loadVoiceSettings().enabled) return
                  e.currentTarget.setPointerCapture(e.pointerId)
                  if (!voice.micActive) void voice.startListening()
                  voice.setPttActive(true)
                }}
                onPointerUp={() => {
                  if (loadVoiceSettings().voiceMode !== 'ptt') return
                  voice.setPttActive(false)
                }}
              >
                <IconMic width={16} height={16} />
              </button>
              {busy && streamStarted ? <button type="button" className="chat-send-btn chat-stop-btn" aria-label="停止生成" title="停止生成" disabled={stopping}
                onClick={() => {
                  stoppedRef.current = true
                  setStopping(true)
                  void window.ackem.stopChat().then((result) => {
                    if (!result.stopped) { setStopping(false); stoppedRef.current = false }
                  }).catch(() => { setStopping(false); stoppedRef.current = false; pushToast('停止失败，请重试') })
                }}><span aria-hidden="true">■</span></button> : <button
                type="button"
                disabled={busy || !embeddingChatReady || (!input.trim() && !images.length && !files.length) || attachmentsInput.pending}
                aria-label="发送消息"
                title="发送消息（Enter）"
                onClick={() => void send()}
                className="chat-send-btn inline-flex h-10 w-14 shrink-0 items-center justify-center text-sm font-medium disabled:opacity-50"
              >
                {busy ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80" />
                ) : (
                  '↑'
                )}
              </button>}
            </div>
            <div className="chat-composer-hint"><span>{busy ? '正在回复 · 可以先写下一条消息' : 'Enter 发送 · Shift + Enter 换行'}</span><span>支持拖入图片、文件和视频，也可 @memory/路径.md</span></div>
          </div>
        </div>
        {drawer && (
          <aside className="chat-context-drawer glass-panel shrink-0 border-l border-surface-inset/60 p-4 text-xs">
            <div className="mb-2 font-medium text-ink">本轮拼装（节选）</div>
            <RouteExplainPanel explain={routeExplain} />
            <pre className="max-h-[calc(100vh-220px)] overflow-auto whitespace-pre-wrap rounded-xl bg-surface-inset/30 p-3 font-mono text-[11px] text-ink-muted">
              {lastInject || '（尚无）'}
            </pre>
          </aside>
        )}
        {previewPath && <ChatFilePreview key={previewPath} path={previewPath} onClose={() => setPreviewPath(null)} onSelect={setPreviewPath} />}
      </div>
      <McEventStack />
    </div>
    <ChannelConfirmCard
      open={channelPending != null}
      askMessage={channelPending?.askMessage ?? ''}
      kind={channelPending?.kind ?? ''}
      cwd={channelPending?.cwd}
      candidates={channelPending?.candidates}
      onReject={() => {
        const ctx = channelPending
        setChannelPending(null)
        if (!ctx) return
        void window.ackem.buildContext({
          userText: ctx.userText,
          explicitRel: ctx.explicitRel,
          recentMessages: ctx.recent,
          sessionId: activeSessionId,
          turnIndex: ctx.turnIndex,
          systemHint: ctx.systemHint,
          targetAgentId: agentChatTarget,
          turnConfirm: { planId: ctx.planId, accepted: false }
        })
      }}
      onAccept={(opts) => {
        const ctx = channelPending
        setChannelPending(null)
        if (!ctx || !settings) return
        setBusy(true)
        stoppedRef.current = false
        setStreamStarted(false)
        void (async () => {
          try {
            const built = await window.ackem.buildContext({
              userText: ctx.userText,
              explicitRel: ctx.explicitRel,
              imagePaths: ctx.imagePaths,
              filePaths: ctx.filePaths,
              recentMessages: ctx.recent,
              sessionId: activeSessionId,
              turnIndex: ctx.turnIndex,
              systemHint: ctx.systemHint,
              targetAgentId: agentChatTarget,
              turnConfirm: {
                planId: ctx.planId,
                accepted: true,
                cwd: opts.cwd,
                extensionId: opts.extensionId
              }
            })
            if (built.channelPending) {
              setChannelPending({
                ...built.channelPending,
                userText: ctx.userText,
                recent: ctx.recent,
                turnIndex: ctx.turnIndex,
                explicitRel: ctx.explicitRel,
                imagePaths: ctx.imagePaths,
                filePaths: ctx.filePaths,
                systemHint: ctx.systemHint
              })
              return
            }
            streamBuf.current = ''
            setThinkingText('')
            setThinkingState('idle')
            setRows((prev) => {
              streamingAssistantIndexRef.current = prev.length
              return [...prev, { kind: 'message', role: 'assistant', createdAt: Date.now(), content: '' }]
            })
            await runChatFromBuilt(built, ctx.systemHint, ctx.userText, ctx.imagePaths, ctx.filePaths)
          } catch (e) {
            pushToast(e instanceof Error ? e.message : String(e))
          } finally {
            if (stoppedRef.current) {
              const index = streamingAssistantIndexRef.current
              setRows((prev) => updateAssistantRow(prev, index, { generationState: 'stopped' }))
              persistHistory()
            }
            setStreamStarted(false)
            setStopping(false)
            clearStreamingAssistantIndex()
            setBusy(false)
          }
        })()
      }}
    />
    </ChatFilePreviewContext.Provider>
  )
}
