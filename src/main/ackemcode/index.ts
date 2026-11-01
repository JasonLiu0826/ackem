// [ackemcode/index] — 桥接层对外入口：确保服务可用 + 跑一轮代码任务
// 三端（桌面 / QQ / 微信）都走这里，避免各自实现一份。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createLogger } from '../logger'
import { hostPath } from './hostEnv'
import {
  ackemCodeBaseUrl,
  ackemCodeHealthy,
  ensureAckemCodeDaemon,
  stopAckemCodeDaemon
} from './daemon'
import { syncLlmToAckemCode } from './llmSync'
import {
  abortCodeTurn,
  createCodeSession,
  postChat,
  type PermissionMode,
  type CodeEvent
} from './chatClient'

const log = createLogger('ackemcode')

export { ackemCodeBaseUrl, stopAckemCodeDaemon }

export type CodeRuntimeStatus = {
  ok: boolean
  reason?: string
  llmSource?: string
}

/** 启动前准备：同步模型配置 → 拉起/复用服务 */
export async function ensureAckemCodeRuntime(): Promise<CodeRuntimeStatus> {
  const llm = syncLlmToAckemCode()
  const daemon = await ensureAckemCodeDaemon()
  if (!daemon.ok) return { ok: false, reason: daemon.reason, llmSource: llm.source }
  if (!llm.ok) return { ok: false, reason: llm.reason, llmSource: llm.source }
  return { ok: true, llmSource: llm.source }
}

/** 没有 Electron 运行时（单测 / CLI）时的路径兜底 */
function appPath(name: 'userData' | 'home', fallback: string): string {
  return hostPath(name) ?? fallback
}

/** 会话映射：Ackem 聊天会话 → Ackem Code 会话（持久化，重启后能接着聊） */
type SessionMap = Record<
  string,
  { codeSessionId: string; cwd: string; permissionMode?: PermissionMode; updatedAt: string }
>

function mapPath(): string {
  return join(appPath('userData', join(homedir(), '.ackemcode-host')), 'ackemcode-sessions.json')
}

function readMap(): SessionMap {
  try {
    const p = mapPath()
    if (!existsSync(p)) return {}
    return JSON.parse(readFileSync(p, 'utf8')) as SessionMap
  } catch {
    return {}
  }
}

function writeMap(map: SessionMap): void {
  try {
    const p = mapPath()
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify(map, null, 2), 'utf8')
  } catch (err) {
    log.warn('写入会话映射失败', err)
  }
}

async function resolveCodeSession(
  chatSessionId: string,
  cwd: string,
  permissionMode: PermissionMode
): Promise<string> {
  const map = readMap()
  const hit = map[chatSessionId]
  // 会话复用必须同时满足：cwd 相同 + 权限模式相同。
  // 权限模式变了（例如从 bypassPermissions 收紧成 default）就重建会话，
  // 保证「收紧权限」对已有会话也立即生效，而不是沿用旧会话的宽松权限。
  if (hit?.codeSessionId && hit.cwd === cwd && hit.permissionMode === permissionMode) {
    return hit.codeSessionId
  }
  if (hit?.codeSessionId && hit.permissionMode !== permissionMode) {
    log.info('权限模式变化，重建代码会话', {
      chatSessionId,
      from: hit.permissionMode ?? 'unknown',
      to: permissionMode
    })
  }
  const created = await createCodeSession({ cwd, permissionMode })
  map[chatSessionId] = {
    codeSessionId: created.sessionId,
    cwd,
    permissionMode,
    updatedAt: new Date().toISOString()
  }
  writeMap(map)
  return created.sessionId
}

export type RunCodeTurnInput = {
  /** 桌面会话 id（统一会话），用来复用同一个代码会话 */
  chatSessionId: string
  text: string
  /** 代码任务的工作目录；缺省用用户主目录 */
  cwd?: string
  /** 三端全自动 → bypassPermissions；需要审批时传 default */
  permissionMode?: PermissionMode
  signal?: AbortSignal
  onEvent?: (ev: CodeEvent) => void
}

export type RunCodeTurnResult = {
  ok: boolean
  text: string
  codeSessionId?: string
  error?: string
  toolCalls: Array<{ name: string; ok?: boolean }>
}

/** 跑一轮代码任务，返回最终文本；事件通过 onEvent 实时外发 */
export async function runCodeTurn(input: RunCodeTurnInput): Promise<RunCodeTurnResult> {
  const status = await ensureAckemCodeRuntime()
  if (!status.ok) {
    return { ok: false, text: '', error: status.reason ?? 'code_runtime_unavailable', toolCalls: [] }
  }
  const cwd = input.cwd || appPath('home', homedir())
  const permissionMode = input.permissionMode ?? 'bypassPermissions'
  const sessionId = await resolveCodeSession(input.chatSessionId, cwd, permissionMode)

  let finalText = ''
  let failure: string | undefined
  const toolCalls: Array<{ name: string; ok?: boolean }> = []

  try {
    await postChat({
      sessionId,
      text: input.text,
      signal: input.signal,
      onEvent: (ev) => {
        if (ev.type === 'assistant_message' && typeof ev.text === 'string') finalText = ev.text
        else if (ev.type === 'assistant_delta' && typeof ev.text === 'string') finalText += ev.text
        else if (ev.type === 'tool_start' && typeof ev.name === 'string') toolCalls.push({ name: ev.name })
        else if (ev.type === 'done' && ev.ok === false) failure = ev.error ?? 'code_turn_failed'
        else if (ev.type === 'error' && typeof ev.message === 'string') failure = ev.message
        input.onEvent?.(ev)
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn('代码任务失败', { sessionId, msg })
    return { ok: false, text: finalText, codeSessionId: sessionId, error: msg, toolCalls }
  }

  return {
    ok: !failure,
    text: finalText.trim(),
    codeSessionId: sessionId,
    error: failure,
    toolCalls
  }
}

export { abortCodeTurn, ackemCodeHealthy }
export type { CodeEvent, PermissionMode }
