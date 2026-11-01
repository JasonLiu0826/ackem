import { describe, it, expect } from 'vitest'
import { appendIncomingChatRows, mergeLoadedChatRows } from './chatHistorySync'
import type { ChatRow } from '../store/appStore'

const T = '2026-11-01T10:00:00.000Z'

function text(role: 'user' | 'assistant', content: string, at = T, channel?: 'qq' | 'weixin'): ChatRow {
  return { kind: 'message', role, content, at, ...(channel ? { channel } : {}) }
}

describe('appendIncomingChatRows', () => {
  it('appends a channel message to the desktop conversation', () => {
    const prev = [text('user', '桌面说的')]
    const next = appendIncomingChatRows(prev, [text('user', 'QQ 说的', '2026-11-01T10:01:00.000Z', 'qq')])
    expect(next).toHaveLength(2)
    expect(next[1]).toMatchObject({ content: 'QQ 说的', channel: 'qq' })
  })

  it('does not duplicate a row that is already on screen', () => {
    const prev = [text('user', '重复')]
    expect(appendIncomingChatRows(prev, [text('user', '重复')])).toBe(prev)
  })

  it('ignores empty assistant placeholders pushed by other windows', () => {
    const prev: ChatRow[] = []
    expect(appendIncomingChatRows(prev, [text('assistant', '')])).toBe(prev)
  })

  it('keeps messages that arrived while history was loading', () => {
    const loaded = [text('user', '历史一'), text('assistant', '历史二')]
    const current = [text('user', '刚好到达', '2026-11-01T10:05:00.000Z', 'qq')]
    const merged = mergeLoadedChatRows(loaded, current)
    expect(merged.map((r) => (r.kind === 'message' ? r.content : ''))).toEqual([
      '历史一',
      '历史二',
      '刚好到达'
    ])
  })

  it('does not duplicate a row present in both loaded history and current rows', () => {
    const loaded = [text('user', '同一句')]
    const current = [text('user', '同一句')]
    expect(mergeLoadedChatRows(loaded, current)).toHaveLength(1)
  })

  it('inserts before the local streaming placeholder', () => {
    const prev = [text('user', '我在桌面问'), text('assistant', '')]
    const next = appendIncomingChatRows(prev, [text('user', '微信问的', T, 'weixin')])
    expect(next.map((r) => (r.kind === 'message' ? r.content : ''))).toEqual([
      '我在桌面问',
      '微信问的',
      ''
    ])
  })
})
