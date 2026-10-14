import type { WebContents } from 'electron'
import { readOpenAiChatCompletionStream, type ToolCallAcc } from './openAiSseStream'
/** A bounded prose continuation within the same reply; never replays tool execution. */
export async function readOpenAiReplyWithContinuation(webContents: WebContents, url: string, requestBody: Record<string, unknown>, options: { headers: Record<string, string>; signal?: AbortSignal; streamToUi: boolean; onTextDelta?: (text:string)=>void; toolAcc: Map<number, ToolCallAcc>; fetcher?: typeof fetch }): Promise<{ text: string; truncated: boolean }> {
  const toolAcc = options.toolAcc
      let text = ''
      let responseTruncated = false
      for (let continuation = 0; continuation <= 2; continuation++) {
        const request = continuation === 0 ? requestBody : {
          ...requestBody,
          // Continue prose only; never replay tools or dispatch a partial tool call.
          tools: undefined, tool_choice: undefined,
          messages: [...(requestBody.messages as unknown[]),
            ...(text ? [{ role: 'assistant', content: text }] : []),
            { role: 'user', content: '上次回答因输出长度限制中断。请从断点直接接着写正文，不重复已输出内容，不重做任务，不输出思考过程。' }]
        }
        const res = await (options.fetcher ?? fetch)(url, {
          method: 'POST', headers: options.headers,
          body: JSON.stringify(request), signal: options.signal
        })
        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => res.statusText)
          throw new Error(`HTTP ${res.status}: ${errText.slice(0, 500)}`)
        }
        let finishReason = ''
        text += await readOpenAiChatCompletionStream(webContents, res, {
          streamToUi: options.streamToUi, pacedSentences: false, signal: options.signal, toolAcc,
          onTextDelta: options.onTextDelta, onFinish: reason => { finishReason = reason }
        })
        responseTruncated = finishReason === 'length' || (finishReason === 'stop' && text.length > 120 && /(?:不太|因为|以及|但是|例如|包括|需要|能够|可以|通过以下|[*#])\s*$/.test(text))
        if (!responseTruncated) break
        if (toolAcc.size) throw new Error('工具调用因输出长度限制中断，未执行不完整调用，请重试。')
        if (continuation < 2) webContents.send('chat:status', '回答较长，正在接着生成…')
      }
  return { text, truncated: responseTruncated }
}
