import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appendConversationTurn,
  buildRecentMessages,
  loadConversationRows,
  mergeConversationRows,
  replaceDesktopConversationRows,
  resolveConversationSessionId,
  saveConversationRows,
  type ConversationRow
} from './conversation'

const T0 = Date.parse('2026-11-01T10:00:00.000Z')

function at(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString()
}

function msg(
  role: 'user' | 'assistant',
  content: string,
  offsetMs: number,
  extra: Partial<ConversationRow> = {}
): ConversationRow {
  return { kind: 'message', role, content, at: at(offsetMs), ...extra }
}

describe('resolveConversationSessionId', () => {
  it('falls back to default when no desktop session is active', () => {
    expect(resolveConversationSessionId(undefined)).toBe('default')
    expect(resolveConversationSessionId('')).toBe('default')
    expect(resolveConversationSessionId('   ')).toBe('default')
  })

  it('follows the desktop active session so all three ends share it', () => {
    expect(resolveConversationSessionId('session-1')).toBe('session-1')
  })
})

describe('mergeConversationRows', () => {
  it('keeps desktop and channel messages on one timeline', () => {
    const { rows } = mergeConversationRows(
      [msg('user', '桌面上说的', 0)],
      [msg('user', 'QQ 上说的', 10_000, { channel: 'qq' })],
      { channel: 'qq' }
    )
    expect(rows.map((r) => r.content)).toEqual(['桌面上说的', 'QQ 上说的'])
    expect(rows[1]?.channel).toBe('qq')
  })

  it('never drops rows that the renderer did not send back', () => {
    const existing = [msg('user', '桌面', 0), msg('user', '微信', 5_000, { channel: 'weixin' })]
    // 渲染层只回写它自己看到的那一行（典型的陈旧视图）
    const { rows, appended } = mergeConversationRows(existing, [msg('user', '桌面', 0)])
    expect(rows).toHaveLength(2)
    expect(rows.some((r) => r.content === '微信')).toBe(true)
    expect(appended).toHaveLength(0)
  })

  it('is idempotent when the same array is saved twice', () => {
    const batch = [msg('user', '你好', 0), msg('assistant', '在呢', 1)]
    const first = mergeConversationRows([], batch)
    const second = mergeConversationRows(first.rows, batch)
    expect(first.rows).toHaveLength(2)
    expect(second.rows).toHaveLength(2)
    expect(second.appended).toHaveLength(0)
  })

  it('updates a streamed reply in place instead of appending a duplicate', () => {
    const existing = [msg('user', '讲个故事', 0), msg('assistant', '从', 1)]
    const incoming = [msg('user', '讲个故事', 0), msg('assistant', '从前有座山', 1)]
    const { rows, appended } = mergeConversationRows(existing, incoming)
    expect(appended).toHaveLength(0)
    expect(rows.filter((r) => r.role === 'assistant')).toHaveLength(1)
    expect(rows[1]?.content).toBe('从前有座山')
  })

  it('keeps repeated identical lines sent at different times', () => {
    const existing = [msg('user', '哈哈', 0)]
    const { rows } = mergeConversationRows(existing, [
      msg('user', '哈哈', 0),
      msg('user', '哈哈', 60_000)
    ])
    expect(rows.filter((r) => r.content === '哈哈')).toHaveLength(2)
  })

  it('tags new message rows with the origin channel and assigns timestamps', () => {
    const { rows } = mergeConversationRows([], [{ kind: 'message', role: 'user', content: 'hi' }], {
      channel: 'weixin',
      peerId: 'wx-1'
    })
    expect(rows[0]?.channel).toBe('weixin')
    expect(rows[0]?.peerId).toBe('wx-1')
    expect(typeof rows[0]?.at).toBe('string')
  })

  it('sorts the merged history by time so both ends see the same order', () => {
    const existing = [msg('assistant', '后来的', 20_000)]
    const { rows } = mergeConversationRows(existing, [msg('user', '先说的', 0)])
    expect(rows.map((r) => r.content)).toEqual(['先说的', '后来的'])
  })
})

describe('replaceDesktopConversationRows', () => {
  it('keeps channel messages that the desktop array does not know about', () => {
    const existing = [
      msg('user', '桌面旧消息', 0),
      msg('user', '微信里的', 5_000, { channel: 'weixin' })
    ]
    const incoming = [msg('user', '桌面新消息', 10_000)]
    const { rows } = replaceDesktopConversationRows(existing, incoming)
    // 比 incoming 更早的桌面行也保留（渲染层可能还没加载完），渠道行更不能丢
    expect(rows.map((r) => r.content)).toEqual(['桌面旧消息', '微信里的', '桌面新消息'])
  })

  it('lets the desktop array replace UI rows it has already loaded', () => {
    // 这两行比 incoming 里的消息更新：说明渲染层已经加载过它们又丢弃了，以界面为准
    const existing = [msg('user', '界面已丢弃', 20_000), msg('assistant', '旧回复', 20_001)]
    const { rows } = replaceDesktopConversationRows(existing, [msg('user', '现在的桌面消息', 10)])
    expect(rows.map((r) => r.content)).toEqual(['现在的桌面消息'])
  })

  it('keeps older UI history when the renderer saves before finishing loading', () => {
    const existing = [msg('user', '很早以前说的', 0), msg('assistant', '很早以前的回复', 1)]
    const { rows } = replaceDesktopConversationRows(existing, [msg('user', '刚说的', 60_000)])
    expect(rows.map((r) => r.content)).toEqual([
      '很早以前说的',
      '很早以前的回复',
      '刚说的'
    ])
  })

  it('does not duplicate channel rows that are already in the desktop array', () => {
    const channelRow = msg('user', '微信里的', 5_000, { channel: 'weixin' })
    const existing = [channelRow]
    const { rows } = replaceDesktopConversationRows(existing, [channelRow])
    expect(rows).toHaveLength(1)
  })

  it('stores non-message UI cards once instead of accumulating copies', () => {
    const card = { kind: 'search', query: '天气', displayTitle: '天气' }
    const first = replaceDesktopConversationRows([], [msg('user', 'hi', 0), card], T0)
    const second = replaceDesktopConversationRows(first.rows, [msg('user', 'hi', 0), card], T0)
    expect(second.rows.filter((r) => r.kind === 'search')).toHaveLength(1)
    expect(second.rows).toHaveLength(2)
  })
})

describe('buildRecentMessages', () => {
  it('only returns non-empty user/assistant messages', () => {
    const messages = buildRecentMessages([
      { kind: 'message', role: 'user', content: '你好' },
      { kind: 'search', query: 'x' },
      { kind: 'message', role: 'assistant', content: '  ' },
      { kind: 'message', role: 'assistant', content: '在的' }
    ])
    expect(messages).toEqual([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '在的' }
    ])
  })

  it('keeps only the latest N messages', () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', `m${i}`, i * 1000)
    )
    expect(buildRecentMessages(rows, 6)).toHaveLength(6)
    expect(buildRecentMessages(rows, 6)[5]?.content).toBe('m29')
  })
})

describe('appendConversationTurn round trip', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ackem-conversation-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('persists a turn to the shared history with origin metadata', async () => {
    await appendConversationTurn({
      dataRoot: root,
      sessionId: 'default',
      channel: 'qq',
      peerId: '10001',
      userText: '在吗',
      assistantText: '在'
    })

    const rows = loadConversationRows(root, 'default')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ role: 'user', content: '在吗', channel: 'qq', peerId: '10001' })
    expect(rows[1]).toMatchObject({ role: 'assistant', content: '在', channel: 'qq' })
  })

  it('lets a stale desktop save coexist with a newer channel message', async () => {
    await appendConversationTurn({
      dataRoot: root,
      sessionId: 'default',
      channel: 'weixin',
      userText: '微信里问的',
      assistantText: '微信里回的'
    })
    const before = loadConversationRows(root, 'default')

    // 桌面拿着「更早的一份数组」回写（只有一条自己的消息）
    await saveConversationRows({
      dataRoot: root,
      sessionId: 'default',
      rows: [msg('user', '桌面上问的', 0)],
      channel: 'ui',
      mode: 'replace-ui'
    })

    const after = loadConversationRows(root, 'default')
    expect(after.length).toBeGreaterThanOrEqual(before.length + 1)
    expect(after.some((r) => r.content === '微信里问的')).toBe(true)
    expect(after.some((r) => r.content === '桌面上问的')).toBe(true)
  })
})
