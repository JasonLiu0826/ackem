// [workingMemory] 鈥?宸ヤ綔璁板繂/杩戞湡涓婁笅鏂囩紦鍐插尯
// 鑱岃矗锛氱淮鎶ゆ渶杩慛杞璇濇憳瑕侊紝鎸変細璇濋殧绂伙紝浣滀负妫€绱笂涓嬫枃鍓嶇疆琛ュ厖
// 瀵规爣 MemGPT working context / recall memory
// 寮曠敤锛?./engine/AckemParams

import { WORKING_MEMORY_CHAR_BUDGET, WORKING_MEMORY_MAX_EXCHANGES } from '../engine/AckemParams'

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

    const lines: string[] = ['銆愯繎鏈熷璇濅笂涓嬫枃锛堟渶杩戝嚑杞級銆?]
    let chars = 0
    for (const ex of recent) {
      const userLine = `鐢ㄦ埛锛?{ex.userText.slice(0, 200)}`
      const asstLine = `浼翠荆锛?{ex.assistantText.slice(0, 200)}`
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
