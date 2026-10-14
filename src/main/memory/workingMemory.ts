// [workingMemory] — 工作记忆/近期上下文缓冲区
// 职责：维护最近N轮对话摘要，按会话隔离，作为检索上下文前置补充
// 对标 MemGPT working context / recall memory
// 引用：../engine/ackemParams

import { WORKING_MEMORY_CHAR_BUDGET, WORKING_MEMORY_MAX_EXCHANGES } from '../engine/ackemParams'
import { resolve } from 'node:path'

export type WorkingMemoryScope = { profile: string; principal?: string; purpose?: string; taskId?: string; goalRevision?: number; scopeRevision?: number }
function scopedKey(sessionId: string, scope?: string | WorkingMemoryScope): string {
  const context = typeof scope === 'string' ? { profile: scope } : scope
  return JSON.stringify([context ? resolve(context.profile).toLowerCase() : 'legacy', context?.principal ?? 'ackem', context?.purpose ?? 'conversation', context?.taskId ?? '', context?.goalRevision ?? 0, context?.scopeRevision ?? 0, sessionId])
}

export type Exchange = {
  turnIndex: number
  userText: string
  assistantText: string
}

export class WorkingMemory {
  private sessions = new Map<string, Exchange[]>()

  private forSession(sessionId: string): Exchange[] {
    let buf = this.sessions.get(sessionId)
    if (!buf) {
      buf = []
      this.sessions.set(sessionId, buf)
    }
    return buf
  }

  push(sessionId: string, exchange: Exchange, scope?: string | WorkingMemoryScope): void {
    const key = scopedKey(sessionId, scope)
    const buf = this.forSession(key)
    buf.push(exchange)
    if (buf.length > WORKING_MEMORY_MAX_EXCHANGES * 2) {
      this.sessions.set(key, buf.slice(-WORKING_MEMORY_MAX_EXCHANGES))
    }
  }

  getRecent(sessionId: string, scope?: string | WorkingMemoryScope): Exchange[] {
    const buf = this.forSession(scopedKey(sessionId, scope))
    return buf.slice(-WORKING_MEMORY_MAX_EXCHANGES)
  }

  buildContextBlock(sessionId: string, scope?: string | WorkingMemoryScope): string {
    const recent = this.getRecent(sessionId, scope)
    if (recent.length === 0) return ''

    const lines: string[] = ['【近期对话上下文（最近几轮）】']
    let chars = 0
    for (const ex of recent) {
      const userLine = `用户：${ex.userText.slice(0, 200)}`
      const asstLine = `Ackem：${ex.assistantText.slice(0, 200)}`
      const block = `${userLine}\n${asstLine}`
      if (chars + block.length > WORKING_MEMORY_CHAR_BUDGET) break
      lines.push(block)
      chars += block.length + 2
    }
    return lines.join('\n')
  }

  clear(sessionId: string, scope?: string | WorkingMemoryScope): void {
    this.sessions.delete(scopedKey(sessionId, scope))
  }

  clearAll(): void {
    this.sessions.clear()
  }

  clearProfile(profile: string): void {
    const normalized = resolve(profile).toLowerCase()
    for (const key of this.sessions.keys()) {
      if (JSON.parse(key)[0] === normalized) this.sessions.delete(key)
    }
  }
}

export const workingMemory = new WorkingMemory()
