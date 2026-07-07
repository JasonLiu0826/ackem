import { useCallback, useRef, useState } from 'react'
import { useAppStore, type ChatRow } from '../store/appStore'
import { t } from '../lib/i18n'
import {
  buildChatContextRequest,
  buildChatSendOptimisticRows,
  chatSendBlockReasonMessage,
  validateChatSend,
} from '../lib/chatSend'
import { insertSearchCardIntoRows, insertMemoryAuditCardIntoRows } from '../lib/chatStreamRows'
import { useEmbeddingReadiness } from './useEmbeddingReadiness'

export function useChatSend() {
  const settings = useAppStore((s) => s.settings)
  const rows = useAppStore((s) => s.chatRows)
  const setRows = useAppStore((s) => s.setChatRows)
  const incrementTurn = useAppStore((s) => s.incrementTurn)
  const pushToast = useAppStore((s) => s.pushToast)
  const { embeddingReadiness } = useEmbeddingReadiness()
  const [busy, setBusyLocal] = useState(false)
  const setChatBusy = useAppStore((s) => s.setChatBusy)
  const setBusy = useCallback(
    (v: boolean) => {
      setBusyLocal(v)
      setChatBusy(v)
    },
    [setChatBusy]
  )
  const streamBuf = useRef('')
  const streamingIdx = useRef<number | null>(null)
  const turnRef = useRef(0)

  const send = useCallback(
    async (raw: string) => {
      const validation = validateChatSend(
        raw,
        settings,
        busy,
        t('chat.docOnly'),
        embeddingReadiness
      )
      if (!validation.ok) {
        const msg = chatSendBlockReasonMessage(validation.reason)
        if (msg === 'settings.loading') pushToast(t('settings.loading'))
        else if (msg === 'chat.embedding.warming') pushToast(t('chat.embedding.warming'))
        else if (msg) pushToast(msg.startsWith('chat.') ? t(msg) : msg)
        return
      }

      const { raw: userLine, clean, rel } = validation
      setBusy(true)
      streamBuf.current = ''
      turnRef.current += 1
      const turnIndex = turnRef.current

      const { rowsWithPlaceholder, assistantIndex, recentMessages } = buildChatSendOptimisticRows(
        rows,
        userLine
      )
      streamingIdx.current = assistantIndex
      setRows(rowsWithPlaceholder)
      incrementTurn()

      const patchAssistant = (content: string) => {
        setRows((prev) => {
          const n = [...prev]
          const idx = streamingIdx.current
          if (idx != null && idx < n.length && n[idx].kind === 'message' && n[idx].role === 'assistant') {
            n[idx] = { kind: 'message', role: 'assistant', content }
          }
          return n
        })
      }

      const bindStreamHandlers = () => {
        window.Ackem.onChatStreamStart(() => {
          streamBuf.current = ''
        })
        window.Ackem.onChatWaveStart(({ newBubble }) => {
          if (!newBubble) {
            streamBuf.current = ''
            return
          }
          streamBuf.current = ''
          setRows((prev) => {
            const n = [...prev, { kind: 'message' as const, role: 'assistant' as const, content: '' }]
            streamingIdx.current = n.length - 1
            return n
          })
        })
        window.Ackem.onChatChunk((c) => {
          streamBuf.current += c
          patchAssistant(streamBuf.current)
        })
        window.Ackem.onChatWaveEnd(({ text }) => {
          if (text) {
            streamBuf.current = text
            patchAssistant(text)
          }
        })
        window.Ackem.onChatReplace((txt) => {
          streamBuf.current = txt
          patchAssistant(txt)
        })
        window.Ackem.onChatDone(() => {
          streamingIdx.current = null
          void window.Ackem.saveChatHistory(useAppStore.getState().chatRows)
        })
        window.Ackem.onChatError((err) => {
          if (String(err) === 'EMBEDDING_WARMING') {
            pushToast(t('chat.embedding.warming'))
            return
          }
          pushToast(err)
          patchAssistant(t('chat.error', { error: String(err) }))
        })
        window.Ackem.onChatSearchCard((payload) => {
          setRows((prev) => insertSearchCardIntoRows(prev, payload, streamingIdx))
        })
        window.Ackem.onChatMemoryAudit((payload) => {
          setRows((prev) => insertMemoryAuditCardIntoRows(prev, payload, streamingIdx))
        })
      }

      try {
        bindStreamHandlers()

        const built = await window.Ackem.buildContext(
          buildChatContextRequest({
            clean,
            userLine,
            rel,
            recentMessages,
            sessionId: settings!.activeSessionId || 'default',
            turnIndex,
          })
        )
        useAppStore.getState().setDispatchTriggerStatus(built.dispatchTriggered ?? null)

        if (built.planCreatePending) {
          const nextCore = rowsWithPlaceholder.slice(0, -1) as ChatRow[]
          setRows([
            ...nextCore,
            {
              kind: 'planCreateAsk',
              askMessage: built.planCreatePending.askMessage,
              planTopic: built.planCreatePending.planTopic,
              emotionLabel: built.planCreatePending.emotionLabel ?? '',
              status: 'pending',
            },
          ])
          streamingIdx.current = null
          return
        }

        if (built.skipLlm && built.redlineReply) {
          patchAssistant(built.redlineReply ?? '')
          streamingIdx.current = null
          void window.Ackem.saveChatHistory(useAppStore.getState().chatRows)
          return
        }

        if (built.enterPlanMode) {
          patchAssistant(t('chat.openPlan'))
          streamingIdx.current = null
          return
        }

        await window.Ackem.startChat({
          messages: built.messages,
          settings: settings!,
          turnId: built.turnId,
          knowledgeTopic: built.knowledgeTopic ?? built.suggestedSearchQuery,
          suggestedSearchQuery: built.knowledgeTopic ?? built.suggestedSearchQuery,
          forcedWebSearchQuery: built.forcedWebSearchQuery,
          planDocumentTopic: built.planDocumentTopic,
          userTaskFrame: built.userTaskFrame,
          useWaveChat: built.useWaveChat,
          wavePlan: built.wavePlan,
          waveContext: built.waveContext,
          sessionId: settings!.activeSessionId || 'default',
        })
      } catch (e) {
        pushToast(e instanceof Error ? e.message : String(e))
        patchAssistant(e instanceof Error ? e.message : String(e))
      } finally {
        streamingIdx.current = null
        setBusy(false)
      }
    },
    [busy, embeddingReadiness, incrementTurn, pushToast, rows, setRows, settings]
  )

  return { send, busy, settings, embeddingReadiness }
}
