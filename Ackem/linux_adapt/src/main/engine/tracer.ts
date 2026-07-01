// [tracer] — 可观测日志
// 职责：每轮一行 JSON（内存 ring buffer + 磁盘 JSONL）
// 输入：TurnTrace
// 输出：void
// 引用：./types

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appendTurnTraceToDb, loadTurnTracesFromDb } from '../db/repos/turnTraces'
import type { TurnTrace } from './types'

const RING_MAX = 100
const ring: TurnTrace[] = []

let traceDir: string | null = null
let traceDataRoot: string | null = null

/** 设置 trace 文件目录（如 {dataRoot}/traces） */
export function setTraceDir(dataRoot: string): void {
  traceDataRoot = dataRoot
  traceDir = join(dataRoot, 'traces')
  try { mkdirSync(traceDir, { recursive: true }) } catch { /* ignore */ }
}

export function getTraceDir(): string | null {
  return traceDir
}

export function logTurn(trace: TurnTrace): void {
  const stamped: TurnTrace = {
    ...trace,
    timestamp: trace.timestamp ?? new Date().toISOString()
  }
  ring.push(stamped)
  if (ring.length > RING_MAX) ring.shift()

  if (traceDataRoot) {
    try {
      appendTurnTraceToDb(traceDataRoot, stamped)
    } catch { /* ignore */ }
  }

  // 持久化到磁盘（每轮追加一行 JSON，双写）
  if (traceDir) {
    try {
      const date = new Date(stamped.timestamp!).toISOString().slice(0, 10)
      const filePath = join(traceDir, `trace-${date}.jsonl`)
      appendFileSync(filePath, JSON.stringify(stamped) + '\n', 'utf-8')
    } catch { /* 静默忽略磁盘错误 */ }
  }

  console.log(JSON.stringify(trace))
}

export function traceLatest(n: number): TurnTrace[] {
  if (n <= 0) return []
  return ring.slice(-n)
}

/** FIX-004: 工具循环结束后回写 l5.toolCalls（Pre-LLM trace 时 toolCalls 为空） */
export function patchLatestTurnL5(turn: number, toolCalls: string[]): void {
  for (let i = ring.length - 1; i >= 0; i--) {
    if (ring[i].turn !== turn) continue
    const updated: TurnTrace = { ...ring[i], l5: { toolCalls } }
    ring[i] = updated

    if (traceDir) {
      try {
        const date = new Date(updated.timestamp ?? Date.now()).toISOString().slice(0, 10)
        const filePath = join(traceDir, `trace-${date}.jsonl`)
        appendFileSync(filePath, JSON.stringify({ ...updated, _patch: 'l5' }) + '\n', 'utf-8')
      } catch { /* ignore */ }
    }
    break
  }
}

/** 加载指定日期的历史 trace（可选工具函数） */
export function loadTraceFile(dataRoot: string, date?: string): TurnTrace[] {
  const day = date ?? new Date().toISOString().slice(0, 10)
  const fromDb = loadTurnTracesFromDb(dataRoot, day)
  if (fromDb.length > 0) return fromDb
  const filePath = join(dataRoot, 'traces', `trace-${day}.jsonl`)
  if (!existsSync(filePath)) return []
  try {
    const lines = readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean)
    return lines.map((l: string) => JSON.parse(l) as TurnTrace)
  } catch {
    return []
  }
}
