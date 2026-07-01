import type { WebContents } from 'electron'
import { createPacedStreamEmitter } from './chat/pacedStreamEmitter'
import { REPLY_INTER_SENTENCE_GAP_MS } from '../shared/replyPacing'

export type ToolCallAcc = {
  id?: string
  name?: string
  arguments: string
}

function mergeToolCalls(
  acc: Map<number, ToolCallAcc>,
  deltas: Array<{
    index?: number
    id?: string
    function?: { name?: string; arguments?: string }
  }>
): void {
  for (const d of deltas) {
    const idx = d.index ?? 0
    let cur = acc.get(idx)
    if (!cur) {
      cur = { arguments: '' }
      acc.set(idx, cur)
    }
    if (d.id) cur.id = d.id
    if (d.function?.name) cur.name = d.function.name
    if (d.function?.arguments) cur.arguments += d.function.arguments
  }
}

export function notifyChatStreamStart(webContents: WebContents): void {
  webContents.send('chat:stream-start', {})
}

function processSseLine(
  webContents: WebContents,
  trimmed: string,
  toolAcc: Map<number, ToolCallAcc>,
  streamToUi: boolean,
  onStreamStart: () => void,
  onTextDelta?: (s: string) => void,
  pacedEmitter?: ReturnType<typeof createPacedStreamEmitter>
): void {
  if (!trimmed.startsWith('data:')) return
  const data = trimmed.slice(5).trim()
  if (data === '[DONE]') return
  try {
    const json = JSON.parse(data) as {
      choices?: Array<{
        delta?: {
          content?: string
          tool_calls?: Array<{
            index?: number
            id?: string
            function?: { name?: string; arguments?: string }
          }>
        }
      }>
    }
    const delta = json.choices?.[0]?.delta
    if (delta?.content) {
      onStreamStart()
      onTextDelta?.(delta.content)
      if (streamToUi) {
        if (pacedEmitter) {
          pacedEmitter.onDelta(delta.content)
        } else {
          webContents.send('chat:chunk', delta.content)
        }
      }
    }
    if (delta?.tool_calls?.length) {
      mergeToolCalls(toolAcc, delta.tool_calls)
    }
  } catch {
    /* ignore */
  }
}

function flushSseBuffer(
  webContents: WebContents,
  buffer: string,
  toolAcc: Map<number, ToolCallAcc>,
  streamToUi: boolean,
  final: boolean,
  onStreamStart: () => void,
  onTextDelta?: (s: string) => void,
  pacedEmitter?: ReturnType<typeof createPacedStreamEmitter>
): string {
  const parts = buffer.split('\n')
  if (!final) {
    const incomplete = parts.pop() ?? ''
    for (const line of parts) {
      processSseLine(
        webContents,
        line.trim(),
        toolAcc,
        streamToUi,
        onStreamStart,
        onTextDelta,
        pacedEmitter
      )
    }
    return incomplete
  }
  for (const line of parts) {
    const t = line.trim()
    if (t) {
      processSseLine(
        webContents,
        t,
        toolAcc,
        streamToUi,
        onStreamStart,
        onTextDelta,
        pacedEmitter
      )
    }
  }
  return ''
}

/** 读取 OpenAI Chat Completions SSE，首 token 即推送到 UI */
export async function readOpenAiChatCompletionStream(
  webContents: WebContents,
  res: Response,
  options: {
    streamToUi?: boolean
    /** 句与句之间插入展示间隔（默认 0.9s） */
    pacedSentences?: boolean
    interSentenceGapMs?: number
    onTextDelta?: (s: string) => void
    toolAcc?: Map<number, ToolCallAcc>
    signal?: AbortSignal
  } = {}
): Promise<string> {
  const {
    streamToUi = true,
    pacedSentences = false,
    interSentenceGapMs = REPLY_INTER_SENTENCE_GAP_MS,
    onTextDelta,
    toolAcc = new Map(),
    signal
  } = options
  if (!res.body) return ''

  let streamStarted = false
  const onStreamStart = () => {
    if (streamStarted) return
    if (pacedSentences) return
    streamStarted = true
    notifyChatStreamStart(webContents)
  }

  const pacedEmitter =
    streamToUi && pacedSentences
      ? createPacedStreamEmitter(webContents, { gapMs: interSentenceGapMs, signal })
      : undefined

  let round1Text = ''
  const onDelta = (s: string) => {
    round1Text += s
    onTextDelta?.(s)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = flushSseBuffer(
      webContents,
      buffer,
      toolAcc,
      streamToUi,
      false,
      onStreamStart,
      onDelta,
      pacedEmitter
    )
  }
  flushSseBuffer(
    webContents,
    buffer,
    toolAcc,
    streamToUi,
    true,
    onStreamStart,
    onDelta,
    pacedEmitter
  )
  if (pacedEmitter) {
    await pacedEmitter.markDone()
  }
  return round1Text
}
