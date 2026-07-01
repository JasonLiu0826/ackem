import type { WebContents } from 'electron'

export type HeadlessChatSink = {
  webContents: WebContents
  getAssistantText: () => Promise<string>
  reset: () => void
}

/** 无 UI 的 WebContents 替身：收集 streamChatCompletion 输出 */
export function createHeadlessChatSink(): HeadlessChatSink {
  let assistant = ''
  let settled = false
  let resolveDone!: (text: string) => void
  let rejectDone!: (err: Error) => void

  const donePromise = new Promise<string>((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })

  const finish = (text: string) => {
    if (settled) return
    settled = true
    resolveDone(text)
  }

  const webContents = {
    send: (channel: string, data?: unknown) => {
      if (channel === 'chat:stream-start') {
        assistant = ''
        return
      }
      if (channel === 'chat:chunk' && typeof data === 'string') {
        assistant += data
        return
      }
      if (channel === 'chat:replace' && typeof data === 'string') {
        assistant = data
        return
      }
      if (channel === 'chat:wave-end' && data && typeof data === 'object') {
        const t = (data as { text?: string }).text
        if (t) assistant = t
        return
      }
      if (channel === 'chat:done') {
        const payload = data as { assistantText?: string } | undefined
        if (payload?.assistantText) assistant = payload.assistantText
        finish(assistant)
        return
      }
      if (channel === 'chat:error') {
        const msg = typeof data === 'string' ? data : 'chat error'
        if (assistant.trim()) finish(assistant)
        else rejectDone(new Error(msg))
      }
    },
    isDestroyed: () => false
  } as unknown as WebContents

  return {
    webContents,
    getAssistantText: () => donePromise,
    reset: () => {
      assistant = ''
      settled = false
    }
  }
}
