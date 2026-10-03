import { useCallback, useEffect, useRef, useState } from 'react'
import type { SocialAgentSummary } from '../../ackem'
import { useAppStore, normalizeChatRow, type ChatRow } from '../../store/appStore'
import { useEmbeddingReadiness } from '../../hooks/useEmbeddingReadiness'
import { validateChatSend, buildChatSendOptimisticRows } from '../../lib/chatSend'
import { MarkdownContent } from '../MarkdownContent'
import { StreamingMessage } from '../StreamingMessage'
import { ChatTypingIndicator } from '../ChatTypingIndicator'
import { AgentAvatar } from './AgentAvatar'
import { buildPresetShortLabelMap, loadAllSocialPresets } from './presetLabels'

type Props = {
  agent: SocialAgentSummary | null
}

export function SocialChatView({ agent }: Props): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const pushToast = useAppStore((s) => s.pushToast)
  const [rows, setRows] = useState<ChatRow[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const streamBuf = useRef('')
  const streamingIndexRef = useRef<number | null>(null)
  const turnRef = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { embeddingReadiness, embeddingChatReady } = useEmbeddingReadiness()
  const [presetLabels, setPresetLabels] = useState<Map<string, string>>(new Map())

  const sessionId = agent?.sessionId ?? ''

  useEffect(() => {
    void loadAllSocialPresets().then((presets) => {
      setPresetLabels(buildPresetShortLabelMap(presets))
    })
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [rows, busy])

  useEffect(() => {
    if (!agent) {
      setRows([])
      return
    }
    turnRef.current = 0
    void window.ackem.loadChatHistory({ targetAgentId: agent.id }).then((raw) => {
      const parsed = (Array.isArray(raw) ? raw : [])
        .map(normalizeChatRow)
        .filter((r): r is ChatRow => r != null && r.kind === 'message')
      setRows(parsed)
      turnRef.current = parsed.filter((r) => r.kind === 'message' && r.role === 'user').length
    })
  }, [agent?.id])

  const persistHistory = useCallback(
    (next: ChatRow[]) => {
      if (!agent) return
      void window.ackem.saveChatHistory(next, { targetAgentId: agent.id })
    },
    [agent]
  )

  useEffect(() => {
    const onChunk = (s: string) => {
      streamBuf.current += s
      const idx = streamingIndexRef.current
      if (idx == null) return
      setRows((prev) => {
        const n = [...prev]
        if (idx < n.length && n[idx]?.kind === 'message' && n[idx].role === 'assistant') {
          n[idx] = { kind: 'message', role: 'assistant', content: streamBuf.current }
        }
        return n
      })
    }
    const onDone = () => {
      setBusy(false)
      streamingIndexRef.current = null
      streamBuf.current = ''
      setRows((prev) => {
        persistHistory(prev)
        return prev
      })
    }
    const onError = (err: string) => {
      setBusy(false)
      pushToast(err === 'EMBEDDING_WARMING' ? '记忆索引预热中，请稍候…' : err)
    }
    window.ackem.onChatChunk(onChunk)
    window.ackem.onChatDone(onDone)
    window.ackem.onChatError(onError)
  }, [persistHistory, pushToast])

  const send = useCallback(async () => {
    if (!agent || !settings) return
    const v = validateChatSend(input, settings, busy, '（仅文档）', embeddingReadiness)
    if (!v.ok) {
      if (v.reason === 'embedding_warming') pushToast('记忆索引预热中，请稍候…')
      else if (v.reason === 'age_not_confirmed') pushToast('请先在设置中确认年满 18 岁')
      else if (v.reason === 'missing_api_base') pushToast('请先在设置中配置 API')
      return
    }
    const { clean } = v
    const { rowsWithPlaceholder, assistantIndex, recentMessages } = buildChatSendOptimisticRows(
      rows,
      clean
    )
    setRows(rowsWithPlaceholder)
    setInput('')
    setBusy(true)
    streamBuf.current = ''
    streamingIndexRef.current = assistantIndex
    const turnIndex = turnRef.current
    turnRef.current += 1

    try {
      const built = await window.ackem.buildContext({
        userText: clean,
        recentMessages,
        sessionId,
        turnIndex,
        targetAgentId: agent.id,
      })
      if (built.skipLlm && built.redlineReply) {
        setRows((prev) => {
          const n = [...prev]
          if (assistantIndex < n.length) {
            n[assistantIndex] = { kind: 'message', role: 'assistant', content: built.redlineReply! }
          }
          persistHistory(n)
          return n
        })
        setBusy(false)
        return
      }
      await window.ackem.startChat({
        messages: built.messages,
        settings,
        turnId: built.turnId,
        sessionId: built.sessionId ?? sessionId,
        targetAgentId: agent.id,
      })
    } catch (e) {
      setBusy(false)
      pushToast(e instanceof Error ? e.message : String(e))
    }
  }, [
    agent,
    settings,
    input,
    busy,
    embeddingReadiness,
    rows,
    sessionId,
    persistHistory,
    pushToast,
  ])

  if (!agent) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">
        从左侧选择一位社会成员开始对话
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-surface-inset/60 px-4 py-3">
        <AgentAvatar agentId={agent.id} name={agent.name} size={40} />
        <div>
          <h1 className="text-sm font-semibold text-ink">{agent.name}</h1>
          <p className="text-[11px] text-ink-muted">
            {agent.origin === 'builtin' ? '预制' : '自建'}
            {' · '}
            {agent.gender === 'female' ? '女' : '男'}
            {' · '}
            {presetLabels.get(agent.presetId) ?? agent.presetId}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {rows.map((row, i) => {
          if (row.kind !== 'message') return null
          const isUser = row.role === 'user'
          const streaming = busy && i === streamingIndexRef.current && !isUser
          return (
            <div
              key={`${i}-${row.role}`}
              className={['mb-3 flex', isUser ? 'justify-end' : 'justify-start'].join(' ')}
            >
              <div
                className={[
                  'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                  isUser ? 'bg-accent/20 text-ink' : 'bg-surface-raised text-ink',
                ].join(' ')}
              >
                {streaming && !row.content ? (
                  <ChatTypingIndicator />
                ) : streaming ? (
                  <StreamingMessage text={row.content} active />
                ) : (
                  <MarkdownContent source={row.content} chat />
                )}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <footer className="border-t border-surface-inset/60 p-3">
        {!embeddingChatReady && (
          <p className="mb-2 text-center text-[11px] text-amber-400/90">记忆索引预热中…</p>
        )}
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            rows={2}
            placeholder={`和 ${agent.name} 说点什么…`}
            disabled={busy}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-surface-inset bg-surface px-3 py-2 text-sm outline-none focus:border-accent/50"
          />
          <button
            type="button"
            disabled={busy || !input.trim()}
            onClick={() => void send()}
            className="self-end rounded-xl bg-accent px-4 py-2 text-sm text-white hover:bg-accent-hover disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </footer>
    </div>
  )
}
