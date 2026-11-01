// [ackemcode/desktopStream] — 桌面端把代码任务结果按聊天流协议推给渲染层
// 复刻 pacedStreamEmitter 的最小事件序列，让气泡、保存历史都走原路径。

import type { WebContents } from 'electron'
import { notifyChatStreamStart } from '../openAiSseStream'

const CHUNK_SIZE = 24

export function streamCodeReply(
  webContents: WebContents,
  opts: { text: string; turnId: string }
): void {
  const text = opts.text.trim()
  if (!text) return
  notifyChatStreamStart(webContents)
  webContents.send('chat:wave-start', { waveIndex: 0, waveCount: 0, newBubble: false })
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    webContents.send('chat:chunk', text.slice(i, i + CHUNK_SIZE))
  }
  webContents.send('chat:wave-end', { waveIndex: 0, text })
  webContents.send('chat:done', {
    memoryWrites: [],
    assistantText: text,
    turnId: opts.turnId
  })
}
