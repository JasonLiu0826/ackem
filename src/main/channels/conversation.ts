// [conversation] — 三端（桌面 / QQ / 微信）共用的一份对话
//
// 之前每个渠道各自占一个 session：桌面写 `default`，QQ 写 `qq:<uid>`，
// 微信写 `wechat:<uid>`。三边互相看不见对方说过什么，等于「三个不同的她」。
//
// 现在只保留一个「会话」：谁的窗口在前台就用谁的 activeSessionId（默认 default），
// 三个渠道都往这一份历史里追加，并给每一行打上来源（ui / qq / weixin）。
// 回复仍然只发回「本轮提问的那一端」——这是 bridge 的职责，本模块只负责记录与读取。
//
// 关键约束：
// 1. 渠道只追加：QQ / 微信落库时已有行永不丢失（mergeConversationRows）。
// 2. 桌面 UI 行为准：渲染层回写整个 chatRows 时整组替换 UI 行，
//    但渠道消息行永远保留（replaceDesktopConversationRows）——
//    否则桌面拿一份陈旧数组回写，就会把刚收到的 QQ/微信消息抹掉。
// 3. 可重放：同一批行重复保存不会产生重复（按 at + 内容指纹去重）。
// 4. 可排序：所有行都有 at，跨端合并后按时间线排列，桌面看到的就是同一条对话。
// 5. 可迁移：旧的 qq:/wechat: 历史在第一次读取时并入统一会话，不丢老聊天。

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getChatHistoryUpdatedAt,
  listChatHistorySessionIds,
  loadChatHistoryFromDb,
  saveChatHistoryToDb
} from '../db/repos/chatHistory'
import { kvGet, kvSet } from '../db/repos/kv'

/** 消息来源：桌面对话框 / QQ / 微信 */
export type ConversationChannel = 'ui' | 'qq' | 'weixin'

export type ConversationRow = {
  kind?: string
  role?: 'user' | 'assistant' | string
  content?: string
  /** ISO 时间戳；用于跨端合并排序与去重 */
  at?: string
  /** 这一行是谁说的（哪一端产生的） */
  channel?: ConversationChannel
  /** 渠道对端 id（QQ 号 / 微信 from_user_id），仅用于排障与展示 */
  peerId?: string
  [key: string]: unknown
}

export type ConversationMessage = { role: 'user' | 'assistant'; content: string }

export type MergeConversationResult = {
  /** 合并、去重、排序、截断后的完整历史 */
  rows: ConversationRow[]
  /** 本次真正新增的行（用于实时推给桌面） */
  appended: ConversationRow[]
}

export const CONVERSATION_SESSION_FALLBACK = 'default'
/** 与 chat_history 的存储上限保持一致 */
export const CONVERSATION_ROW_LIMIT = 2000
const LEGACY_CHANNEL_SESSION_RE = /^(qq|wechat):/
const LEGACY_CHANNEL_FILE_RE = /^chat-history-((?:qq|wechat)_.+)\.json$/
const MIGRATION_NAMESPACE = 'conversation'
/**
 * 整个 dataRoot 只迁移一次，而不是每个会话迁一次：
 * 否则用户新建一个桌面会话时，旧的 QQ/微信历史又会被并进这个空会话。
 */
const MIGRATION_KEY = 'migrated:v1'
const DEFAULT_EXCHANGE_GAP_MS = 60_000

/** 三端统一使用的会话 id：跟随桌面当前会话，缺省 default */
export function resolveConversationSessionId(activeSessionId?: string | null): string {
  const trimmed = (activeSessionId ?? '').trim()
  return trimmed || CONVERSATION_SESSION_FALLBACK
}

/** legacy JSON 文件名转义（与历史实现保持一致） */
export function safeSessionFileName(sessionId: string): string {
  return sessionId.replace(/[:/\\]/g, '_')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseTimeMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function rowTimeMs(row: ConversationRow): number {
  return parseTimeMs(row.at) ?? 0
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/**
 * 内容指纹：不含 at / channel / peerId。
 * 桌面的旧代码回写历史时不带这些元数据，靠指纹仍能认成同一行，不会重复。
 */
function contentFingerprint(row: ConversationRow): string {
  const { at: _at, channel: _channel, peerId: _peerId, ...rest } = row
  return stableStringify(rest)
}

/**
 * 一行的匹配键，按优先级排列：
 * 1. kind|role|at —— 同一行在内容变化（流式补全）后仍能认出来
 * 2. 内容指纹 —— 兼容没有 at 的旧数据 / 渲染层回写
 */
function rowMatchKeys(row: ConversationRow): string[] {
  const keys: string[] = []
  if (row.kind && row.role && row.at) keys.push(`${row.kind}|${row.role}|${row.at}`)
  keys.push(contentFingerprint(row))
  return keys
}

function normalizeRowTimes(rows: ConversationRow[], now: number): void {
  const total = rows.length
  rows.forEach((row, index) => {
    if (!row.at) {
      // 旧数据没有时间戳：按原顺序补一个合成时间，保证合并后顺序稳定
      row.at = new Date(now - (total - index) * 1000).toISOString()
    }
  })
}

function compareRowsByTime(a: ConversationRow, b: ConversationRow): number {
  return rowTimeMs(a) - rowTimeMs(b)
}

/**
 * 合并两批历史。已有行永远保留（只追加、不覆盖），
 * 新行按时间线插入；同一行按「at + 角色」或「内容指纹」识别，重复保存不会翻倍。
 */
export function mergeConversationRows(
  existing: unknown[],
  incoming: unknown[],
  options: { channel?: ConversationChannel; peerId?: string; now?: number } = {}
): MergeConversationResult {
  const now = options.now ?? Date.now()
  const kept: ConversationRow[] = []
  for (const raw of existing) {
    if (isRecord(raw)) kept.push({ ...raw } as ConversationRow)
  }
  normalizeRowTimes(kept, now)

  const index = new Map<string, number[]>()
  kept.forEach((row, i) => {
    for (const key of rowMatchKeys(row)) {
      const bucket = index.get(key)
      if (bucket) bucket.push(i)
      else index.set(key, [i])
    }
  })

  const matched = new Set<number>()
  const appended: ConversationRow[] = []

  for (const raw of incoming) {
    if (!isRecord(raw)) continue
    const row = { ...raw } as ConversationRow

    let hit = -1
    for (const key of rowMatchKeys(row)) {
      const bucket = index.get(key)
      if (!bucket) continue
      const free = bucket.find((i) => !matched.has(i))
      if (free != null) {
        hit = free
        break
      }
    }

    if (hit >= 0) {
      matched.add(hit)
      const prev = kept[hit]
      // 同一条消息的内容被补全（例如流式结束时替换）：用更新的非空内容
      if (
        row.kind === 'message' &&
        row.role === prev.role &&
        typeof row.content === 'string' &&
        row.content.trim().length > 0 &&
        row.content !== prev.content
      ) {
        prev.content = row.content
      }
      continue
    }

    const added: ConversationRow = { ...row }
    if (!added.at) added.at = new Date(now + appended.length).toISOString()
    if (added.kind === 'message') {
      if (!added.channel) added.channel = options.channel ?? 'ui'
      if (!added.peerId && options.peerId) added.peerId = options.peerId
    }
    kept.push(added)
    appended.push(added)
  }

  const rows = kept.sort(compareRowsByTime).slice(-CONVERSATION_ROW_LIMIT)
  return { rows, appended }
}

function isChannelMessageRow(row: ConversationRow): boolean {
  return (
    row.kind === 'message' &&
    (row.channel === 'qq' || row.channel === 'weixin')
  )
}

/**
 * 桌面回写专用：渲染层的 `chatRows` 就是「本机界面的事实」，
 * 所以 UI 行以它为准（整组替换，避免搜索卡、流式气泡重复累积），
 * 但 QQ / 微信写进来的消息必须原样保留——哪怕渲染层那份数组更旧。
 */
export function replaceDesktopConversationRows(
  existing: unknown[],
  incoming: unknown[],
  now: number = Date.now()
): MergeConversationResult {
  const incomingRows: ConversationRow[] = []
  for (const raw of incoming) {
    if (!isRecord(raw)) continue
    const row = { ...raw } as ConversationRow
    if (row.kind === 'message' && !row.channel) row.channel = 'ui'
    incomingRows.push(row)
  }
  normalizeRowTimes(incomingRows, now)

  const incomingKeys = new Set<string>()
  for (const row of incomingRows) {
    for (const key of rowMatchKeys(row)) incomingKeys.add(key)
  }

  // 渲染层可能还没把历史读完（或读取失败）就开始回写：
  // 比 incoming 里最早一条消息更早的行，视为「它还没看到的历史」，保留。
  const incomingMessageTimes = incomingRows
    .filter((row) => row.kind === 'message')
    .map((row) => parseTimeMs(row.at))
    .filter((ms): ms is number => ms != null)
  const oldestIncomingMs =
    incomingMessageTimes.length > 0 ? Math.min(...incomingMessageTimes) : null

  const preserved: ConversationRow[] = []
  for (const raw of existing) {
    if (!isRecord(raw)) continue
    const row = raw as ConversationRow
    if (rowMatchKeys(row).some((key) => incomingKeys.has(key))) continue

    const isChannel = isChannelMessageRow(row)
    const rowMs = parseTimeMs(row.at)
    const olderThanIncoming =
      oldestIncomingMs != null && rowMs != null && rowMs < oldestIncomingMs
    if (!isChannel && !olderThanIncoming) continue

    preserved.push({ ...row })
  }

  const rows = [...incomingRows, ...preserved]
    .sort(compareRowsByTime)
    .slice(-CONVERSATION_ROW_LIMIT)
  return { rows, appended: preserved }
}

/** 从历史里取最近 N 条真正的消息，供模型上下文使用 */
export function buildRecentMessages(rows: unknown[], limit = 24): ConversationMessage[] {
  const messages: ConversationMessage[] = []
  for (const raw of rows) {
    if (!isRecord(raw)) continue
    const row = raw as ConversationRow
    if (row.kind !== 'message') continue
    if (row.role !== 'user' && row.role !== 'assistant') continue
    if (typeof row.content !== 'string' || !row.content.trim()) continue
    messages.push({ role: row.role, content: row.content })
  }
  return messages.slice(-limit)
}

// ---------------------------------------------------------------------------
// 读写
// ---------------------------------------------------------------------------

function legacyJsonPath(dataRoot: string, sessionId: string): string {
  return join(dataRoot, 'companion', `chat-history-${safeSessionFileName(sessionId)}.json`)
}

function readLegacyJsonRows(dataRoot: string, sessionId: string): ConversationRow[] {
  const file = legacyJsonPath(dataRoot, sessionId)
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecord).map((row) => ({ ...row }) as ConversationRow)
  } catch {
    return []
  }
}

function readRawConversationRows(dataRoot: string, sessionId: string): ConversationRow[] {
  const fromDb = loadChatHistoryFromDb(dataRoot, sessionId)
  const rows = Array.isArray(fromDb)
    ? fromDb.filter(isRecord).map((row) => ({ ...row }) as ConversationRow)
    : []
  if (rows.length > 0) return rows
  // DB 不可用（例如 SQLite 被禁用）时退回 legacy JSON
  return readLegacyJsonRows(dataRoot, sessionId)
}

function persistConversationRows(
  dataRoot: string,
  sessionId: string,
  rows: ConversationRow[]
): void {
  saveChatHistoryToDb(dataRoot, sessionId, rows)
  // 派生的 legacy JSON：日记、在场检测、主动搭话等扩展直接读它
  try {
    const dir = join(dataRoot, 'companion')
    mkdirSync(dir, { recursive: true })
    writeFileSync(legacyJsonPath(dataRoot, sessionId), JSON.stringify(rows), 'utf-8')
  } catch {
    /* 派生文件写失败不影响主链路 */
  }
}

// ---------------------------------------------------------------------------
// 旧渠道历史迁移（qq:<uid> / wechat:<uid> → 统一会话）
// ---------------------------------------------------------------------------

const migratedKeys = new Set<string>()

function tagLegacyRows(
  rows: unknown[],
  channel: ConversationChannel,
  anchorMs: number
): ConversationRow[] {
  const records = rows.filter(isRecord).map((row) => ({ ...row }) as ConversationRow)
  const total = records.length
  return records.map((row, index) => {
    if (!row.channel) row.channel = channel
    if (!row.at) {
      // 旧行没有精确时间：以「该会话最后写入时间」为锚点，按顺序铺开
      row.at = new Date(anchorMs - (total - index) * DEFAULT_EXCHANGE_GAP_MS).toISOString()
    }
    return row
  })
}

type LegacySource = { channel: ConversationChannel; rows: unknown[]; anchorMs: number }

function collectLegacySources(dataRoot: string, targetSessionId: string): LegacySource[] {
  const sources: LegacySource[] = []

  for (const sessionId of listChatHistorySessionIds(dataRoot)) {
    if (sessionId === targetSessionId) continue
    const match = LEGACY_CHANNEL_SESSION_RE.exec(sessionId)
    if (!match) continue
    const rows = loadChatHistoryFromDb(dataRoot, sessionId)
    if (!Array.isArray(rows) || rows.length === 0) continue
    const updatedAt = getChatHistoryUpdatedAt(dataRoot, sessionId)
    sources.push({
      channel: match[1] === 'qq' ? 'qq' : 'weixin',
      rows,
      anchorMs: parseTimeMs(updatedAt) ?? Date.now()
    })
  }

  // SQLite 被禁用时只剩 JSON 文件；正常情况这里会与上面的 DB 行重复，
  // 合并时按内容指纹去重，不会翻倍。
  const companionDir = join(dataRoot, 'companion')
  if (existsSync(companionDir)) {
    for (const entry of readdirSync(companionDir)) {
      const match = LEGACY_CHANNEL_FILE_RE.exec(entry)
      if (!match) continue
      const channel: ConversationChannel = entry.includes('chat-history-qq_') ? 'qq' : 'weixin'
      const file = join(companionDir, entry)
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf-8')) as unknown
        if (!Array.isArray(parsed) || parsed.length === 0) continue
        sources.push({ channel, rows: parsed, anchorMs: statSync(file).mtimeMs })
      } catch {
        /* 坏文件跳过 */
      }
    }
  }

  return sources
}

/**
 * 把旧的分渠道历史并入统一会话（幂等，每个 dataRoot + 会话只跑一次）。
 * 迁移失败不阻塞聊天：宁可她少记得一点，也不能让消息发不出去。
 */
export function ensureConversationMigrated(dataRoot: string, sessionId: string): void {
  const guardKey = `${dataRoot}::${sessionId}`
  if (migratedKeys.has(guardKey)) return
  migratedKeys.add(guardKey)

  try {
    if (kvGet(dataRoot, MIGRATION_NAMESPACE, MIGRATION_KEY) === '1') return

    const sources = collectLegacySources(dataRoot, sessionId)
    if (sources.length > 0) {
      let rows = readRawConversationRows(dataRoot, sessionId)
      for (const source of sources) {
        rows = mergeConversationRows(rows, tagLegacyRows(source.rows, source.channel, source.anchorMs), {
          channel: source.channel,
          now: source.anchorMs
        }).rows
      }
      persistConversationRows(dataRoot, sessionId, rows)
    }
    kvSet(dataRoot, MIGRATION_NAMESPACE, MIGRATION_KEY, '1')
  } catch {
    /* 迁移是增强能力，失败时照常使用新历史 */
  }
}

/** 读取统一会话历史（会先做一次旧数据迁移） */
export function loadConversationRows(dataRoot: string, sessionId: string): ConversationRow[] {
  ensureConversationMigrated(dataRoot, sessionId)
  return readRawConversationRows(dataRoot, sessionId)
}

/** 读取最近 N 条消息，直接可做模型上下文 */
export function loadRecentConversationMessages(
  dataRoot: string,
  sessionId: string,
  limit = 24
): ConversationMessage[] {
  return buildRecentMessages(loadConversationRows(dataRoot, sessionId), limit)
}

// ---------------------------------------------------------------------------
// 写入（同一会话串行，避免两端同时写导致丢行）
// ---------------------------------------------------------------------------

const writeChains = new Map<string, Promise<unknown>>()

function withConversationLock<T>(key: string, task: () => T): Promise<T> {
  const prev = writeChains.get(key) ?? Promise.resolve()
  const next = prev.catch(() => undefined).then(task)
  writeChains.set(key, next)
  void next.finally(() => {
    if (writeChains.get(key) === next) writeChains.delete(key)
  })
  return next
}

export type SaveConversationArgs = {
  dataRoot: string
  sessionId: string
  rows: unknown[]
  channel?: ConversationChannel
  peerId?: string
  now?: number
  /**
   * append：只追加（渠道落库用，已有行永不丢）
   * replace-ui：UI 行以传入数组为准，只保留渠道消息（桌面渲染层回写用）
   */
  mode?: 'append' | 'replace-ui'
}

/** 把一批行并入统一会话并落盘（桌面回写、渠道落库都走这里） */
export async function saveConversationRows(
  args: SaveConversationArgs
): Promise<MergeConversationResult> {
  const { dataRoot, sessionId } = args
  return withConversationLock(`${dataRoot}::${sessionId}`, () => {
    const existing = loadConversationRows(dataRoot, sessionId)
    const result =
      args.mode === 'replace-ui'
        ? replaceDesktopConversationRows(existing, args.rows, args.now)
        : mergeConversationRows(existing, args.rows, {
            channel: args.channel ?? 'ui',
            peerId: args.peerId,
            now: args.now
          })
    persistConversationRows(dataRoot, sessionId, result.rows)
    return result
  })
}

export type AppendTurnArgs = {
  dataRoot: string
  sessionId: string
  channel: ConversationChannel
  peerId?: string
  userText: string
  assistantText: string
  at?: number
}

/** 记录一轮「用户说 → 她回」；回复本身由调用方只发往来源渠道 */
export async function appendConversationTurn(
  args: AppendTurnArgs
): Promise<MergeConversationResult> {
  const atMs = args.at ?? Date.now()
  const rows: ConversationRow[] = [
    {
      kind: 'message',
      role: 'user',
      content: args.userText,
      at: new Date(atMs).toISOString(),
      sentAt: new Date(atMs).toISOString(),
      channel: args.channel,
      ...(args.peerId ? { peerId: args.peerId } : {})
    },
    {
      kind: 'message',
      role: 'assistant',
      content: args.assistantText,
      at: new Date(atMs + 1).toISOString(),
      sentAt: new Date(atMs + 1).toISOString(),
      channel: args.channel,
      ...(args.peerId ? { peerId: args.peerId } : {})
    }
  ]
  return saveConversationRows({
    dataRoot: args.dataRoot,
    sessionId: args.sessionId,
    rows,
    channel: args.channel,
    peerId: args.peerId,
    now: atMs
  })
}

/** 只记录一条她的消息（主动搭话等没有用户输入的场景） */
export async function appendConversationAssistant(args: {
  dataRoot: string
  sessionId: string
  channel: ConversationChannel
  peerId?: string
  content: string
  at?: number
}): Promise<MergeConversationResult> {
  const atMs = args.at ?? Date.now()
  return saveConversationRows({
    dataRoot: args.dataRoot,
    sessionId: args.sessionId,
    rows: [
      {
        kind: 'message',
        role: 'assistant',
        content: args.content,
        at: new Date(atMs).toISOString(),
        channel: args.channel,
        ...(args.peerId ? { peerId: args.peerId } : {})
      }
    ],
    channel: args.channel,
    peerId: args.peerId,
    now: atMs
  })
}
