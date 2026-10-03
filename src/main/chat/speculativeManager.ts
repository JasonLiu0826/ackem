/**
 * Route v2 阶段 3-5 — 伴随流运行时接线 (ipc/chat.ts 侧管理器)。
 *
 * 生命周期: context:build 在进入残差/探针等待前 startSpeculative();
 * 判决出来后: adopt(采纳 → 返回正式文本给 chat:start 复用)或
 * cutConfirm/cutClarify(截断 → 投影 + 通知渲染层)。
 *
 * 隔离 (§17.4): 采纳的文本由 chat:start 的正式流路径自己重新生成——
 * 伴随流的临时文本**只用于被截断时的展示**; 采纳场景下临时流被 abort,
 * 不落任何存储。这样"恰好一次"由正式路径独占保证。
 * (设计 §17.3 的无缝衔接变体属 UI 优化, 不在本批。)
 */

import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import {
  CAGED_SYSTEM_PROMPT,
  CHAT_PROVISIONAL_CUT_CHANNEL,
  ROUTE_COMPANION_STREAM_ENABLED
} from './companionStream.js'

type SpecState = {
  turnId: string
  sessionId: string
  controller: AbortController
  chunks: string[]
  done: boolean
}

const inflight = new Map<string, SpecState>()

export function speculativeEnabled(): boolean {
  return ROUTE_COMPANION_STREAM_ENABLED
}

export type SpeculativeStartArgs = {
  turnId: string
  sessionId: string
  userText: string
  /** 调用方提供的流式 LLM 调用 (OpenAI 兼容, caged prompt)。 */
  runStream: (systemPrompt: string, userText: string, signal: AbortSignal, onChunk: (s: string) => void) => Promise<void>
  wc: WebContents
}

/** 残差/探针等待前调用。开关关闭时为 no-op。 */
export function startSpeculative(args: SpeculativeStartArgs): void {
  if (!speculativeEnabled()) return
  if (inflight.has(args.turnId)) return
  const controller = new AbortController()
  const state: SpecState = { turnId: args.turnId, sessionId: args.sessionId, controller, chunks: [], done: false }
  inflight.set(args.turnId, state)
  void args
    .runStream(CAGED_SYSTEM_PROMPT, args.userText, controller.signal, (chunk) => {
      state.chunks.push(chunk)
    })
    .then(() => {
      state.done = true
    })
    .catch(() => {
      state.done = true
    })
}

function takeState(turnId: string): SpecState | undefined {
  const st = inflight.get(turnId)
  if (st) inflight.delete(turnId)
  return st
}

/** 采纳 (chat 判决): 停临时流, 丢弃临时文本 (正式路径独占生成)。 */
export function adoptSpeculative(turnId: string): void {
  const st = takeState(turnId)
  st?.controller.abort()
}

/**
 * 截断 (work/plugin/澄清判决): 停流, 已流出文本进投影 + 通知渲染层
 * (chat:provisional-cut), 返回截断文本 (调用方落投影)。
 */
export function cutSpeculative(turnId: string): string | null {
  const st = takeState(turnId)
  if (!st) return null
  st.controller.abort()
  return st.chunks.join('')
}

export function cutNotificationPayload(turnId: string, text: string, planId?: string) {
  return {
    channel: CHAT_PROVISIONAL_CUT_CHANNEL,
    body: { turnId, text: text.slice(0, 500), planId: planId ?? null, specId: `spec_${randomUUID().slice(0, 6)}` }
  }
}
