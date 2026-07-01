// [workingMemory] — 工作记忆/近期上下文缓冲区
// 职责：维护最近N轮对话摘要，按会话隔离，作为检索上下文前置补充
// 对标 MemGPT working context / recall memory
// 引用：../engine/ackemParams

import { WORKING_MEMORY_CHAR_BUDGET, WORKING_MEMORY_MAX_EXCHANGES } from '../engine/ackemParams'

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

  push(sessionId: string, exchange: Exchange): void {
    const buf = this.forSession(sessionId)
    buf.push(exchange)
    if (buf.length > WORKING_MEMORY_MAX_EXCHANGES * 2) {
      this.sessions.set(sessionId, buf.slice(-WORKING_MEMORY_MAX_EXCHANGES))
    }
  }

  getRecent(sessionId: string): Exchange[] {
    const buf = this.forSession(sessionId)
    return buf.slice(-WORKING_MEMORY_MAX_EXCHANGES)
  }

  buildContextBlock(sessionId: string): string {
    const recent = this.getRecent(sessionId)
    if (recent.length === 0) return ''

    const lines: string[] = ['【近期对话上下文（最近几轮）】']
    let chars = 0
    for (const ex of recent) {
      const userLine = `用户：${ex.userText.slice(0, 200)}`
      const asstLine = `伴侣：${ex.assistantText.slice(0, 200)}`
      const block = `${userLine}\n${asstLine}`
      if (chars + block.length > WORKING_MEMORY_CHAR_BUDGET) break
      lines.push(block)
      chars += block.length + 2
    }
    return lines.join('\n')
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  clearAll(): void {
    this.sessions.clear()
  }
}

export const workingMemory = new WorkingMemory()
