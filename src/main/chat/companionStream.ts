/**
 * Route v2 阶段 3-5 — companion speculative stream (伴随流主体, 设计 §17.3).
 *
 * 触发: 凡将调用分类器的轮 (残差或探针), 同时以「镣铐提示词」让伴侣模型流式
 * 生成一段先行回应 — 系统提示里没有任何通道事实, 且明令只倾听、禁止提及任何
 * 操作, 因此物理上不可能越界。
 *
 * 两个出口:
 *  - 采纳 (chat 判决): provisional 转正式回复 (恰好一次 finalize);
 *  - 截断 (work/plugin/澄清判决): 停止临时流, 文本存 provisional 投影
 *    (UI-only, 带徽章), 绝不进 chat_history / 账本 / finalizeTurnAfterStream。
 *
 * 隔离 (§17.4 定案): 截断文本只存在于 provisionalProjection; 账本侧由
 * 空文本 finalize 天然隔离 (无 assistant_reply 事件)。
 *
 * 特性开关 (§17.3 门槛 6): ROUTE_COMPANION_STREAM — 默认关, J21-J25 验收
 * 全绿后由设置页打开; 关闭时完全跳过, 降级为纯里程碑指示器。
 */

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CHAT_PROVISIONAL_CUT_CHANNEL,
  createInMemoryProvisionalProjection,
  type ProvisionalProjectionStore,
  type ProvisionalReply
} from './provisionalProjection.js'

export { CHAT_PROVISIONAL_CUT_CHANNEL }

/** 特性开关: 伴随流主体 (默认关 — J21-J25 验收通过后再打开)。 */
export const ROUTE_COMPANION_STREAM_ENABLED = false

export const CAGED_SYSTEM_PROMPT = `你正在陪伴用户等待一个后台判断完成。
只做倾听回应：接住对方的情绪，最多两句话。
禁止提及任何操作、工具、文件、任务、插件；禁止说"我将""我会""让我"。
禁止承诺任何行动。你此刻只是一名倾听者。`

// ---------------------------------------------------------------------------
// Persistent provisional projection: in-memory index + data/logs 落盘
// (重启后徽章可见; 该文件永远不被 chat_history/账本/日报/任何读取方消费)。
// ---------------------------------------------------------------------------

const PROJECTION_FILE = 'provisional-replies.json'

export function createPersistentProvisionalProjection(
  dataRoot: string
): ProvisionalProjectionStore {
  const file = join(dataRoot, 'logs', PROJECTION_FILE)
  let rows: ProvisionalReply[] = []
  try {
    if (existsSync(file)) rows = JSON.parse(readFileSync(file, 'utf8')) as ProvisionalReply[]
  } catch {
    rows = []
  }
  const persist = (): void => {
    try {
      mkdirSync(join(dataRoot, 'logs'), { recursive: true })
      writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8')
    } catch {
      /* best-effort: projection is UI-only */
    }
  }
  return {
    append(reply) {
      if (rows.some((r) => r.turnId === reply.turnId)) return
      rows.push({ ...reply })
      persist()
    },
    listBySession(sessionId) {
      return rows.filter((r) => r.sessionId === sessionId).map((r) => ({ ...r }))
    },
    clearSession(sessionId) {
      rows = rows.filter((r) => r.sessionId !== sessionId)
      persist()
    }
  }
}

// ---------------------------------------------------------------------------
// Speculative session: caged prompt + abort handle. 实际流式调用由
// ipc/chat.ts 用其 LLM client 发起 (本模块不依赖网络栈, 可单测)。
// ---------------------------------------------------------------------------

export type SpeculativeSession = {
  streamId: string
  abort: () => void
}

export type SpeculativeStart = {
  sessionId: string
  userText: string
}

export function beginSpeculativeStream(_start: SpeculativeStart): SpeculativeSession {
  const controller = new AbortController()
  void _start
  return {
    streamId: `spec_${randomUUID().slice(0, 8)}`,
    abort: () => controller.abort()
  }
}

/** 截断时投影行的构造 (单一出口, 保证字段完整)。 */
export function makeCutReply(args: {
  turnId: string
  sessionId: string
  text: string
  reason: 'confirm_card' | 'clarify' | 'error'
  planId?: string
  now?: Date
}): ProvisionalReply {
  return {
    turnId: args.turnId,
    sessionId: args.sessionId,
    text: args.text,
    createdAt: (args.now ?? new Date()).toISOString(),
    supersededBy: args.reason,
    ...(args.planId ? { planId: args.planId } : {})
  }
}
