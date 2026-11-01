// [qq] — QQ 渠道持久化（账号连接参数 / 消息去重 / 最近对话人）
// 与 weixin/store.ts 同构：SQLite 为主，JSON 文件为降级兜底。

import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { getDatabase } from '../../db/database'
import { QQ_SEEN_CAP, type QqAccount } from './types'

const ACCOUNT_FILE = 'channels/qq-account.json'

function accountFilePath(dataRoot: string): string {
  return join(dataRoot, ACCOUNT_FILE)
}

function readAccountFile(dataRoot: string): QqAccount | null {
  const path = accountFilePath(dataRoot)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as QqAccount
    if (raw?.httpBaseUrl && raw.wsUrl && raw.selfId) return raw
  } catch {
    /* ignore */
  }
  return null
}

function writeAccountFile(dataRoot: string, account: QqAccount): void {
  const path = accountFilePath(dataRoot)
  mkdirSync(join(dataRoot, 'channels'), { recursive: true })
  writeFileSync(path, JSON.stringify(account, null, 2), 'utf-8')
}

function clearAccountFile(dataRoot: string): void {
  const path = accountFilePath(dataRoot)
  if (existsSync(path)) writeFileSync(path, '', 'utf-8')
}

export function loadQqAccount(dataRoot: string): QqAccount | null {
  const db = getDatabase(dataRoot)
  if (db) {
    const row = db
      .prepare(
        `SELECT self_id, nickname, http_base_url, ws_url, access_token FROM qq_account WHERE id = 1`
      )
      .get() as
      | {
          self_id: string
          nickname: string | null
          http_base_url: string
          ws_url: string
          access_token: string | null
        }
      | undefined
    if (row?.http_base_url && row?.ws_url) {
      return {
        selfId: row.self_id ?? '',
        nickname: row.nickname ?? undefined,
        httpBaseUrl: row.http_base_url,
        wsUrl: row.ws_url,
        accessToken: row.access_token ?? undefined
      }
    }
  }
  return readAccountFile(dataRoot)
}

export function saveQqAccount(dataRoot: string, account: QqAccount): void {
  writeAccountFile(dataRoot, account)
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(
    `INSERT INTO qq_account(id, self_id, nickname, http_base_url, ws_url, access_token, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       self_id = excluded.self_id,
       nickname = excluded.nickname,
       http_base_url = excluded.http_base_url,
       ws_url = excluded.ws_url,
       access_token = excluded.access_token,
       updated_at = excluded.updated_at`
  ).run(
    account.selfId,
    account.nickname ?? null,
    account.httpBaseUrl,
    account.wsUrl,
    account.accessToken ?? null,
    new Date().toISOString()
  )
}

export function clearQqAccount(dataRoot: string): void {
  clearAccountFile(dataRoot)
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(`DELETE FROM qq_account WHERE id = 1`).run()
}

/** 入站消息去重：true 表示此前已处理过 */
export function markQqMessageSeen(dataRoot: string, selfId: string, messageId: number): boolean {
  const db = getDatabase(dataRoot)
  if (!db) return false
  const key = selfId || 'unknown'
  const exists = db
    .prepare(`SELECT 1 FROM qq_seen WHERE self_id = ? AND message_id = ?`)
    .get(key, messageId)
  if (exists) return true

  db.prepare(`INSERT OR IGNORE INTO qq_seen(self_id, message_id, seen_at) VALUES (?, ?, ?)`).run(
    key,
    messageId,
    new Date().toISOString()
  )

  const count = db.prepare(`SELECT COUNT(*) as c FROM qq_seen WHERE self_id = ?`).get(key) as {
    c: number
  }
  if (count.c > QQ_SEEN_CAP) {
    db.prepare(
      `DELETE FROM qq_seen WHERE self_id = ? AND message_id IN (
         SELECT message_id FROM qq_seen WHERE self_id = ? ORDER BY seen_at ASC LIMIT ?
       )`
    ).run(key, key, count.c - QQ_SEEN_CAP)
  }
  return false
}

export function saveQqPeer(dataRoot: string, peerId: string, nickname?: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(
    `INSERT INTO qq_peer(peer_id, nickname, last_seen_at) VALUES (?, ?, ?)
     ON CONFLICT(peer_id) DO UPDATE SET
       nickname = excluded.nickname,
       last_seen_at = excluded.last_seen_at`
  ).run(peerId, nickname ?? null, new Date().toISOString())
}

export type QqPeerRow = { peerId: string; nickname?: string; lastSeenAt: string }

/** 最近互动过的 QQ 用户（主动消息的目标池） */
export function listQqPeers(dataRoot: string, limit = 8): QqPeerRow[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db
    .prepare(
      `SELECT peer_id, nickname, last_seen_at FROM qq_peer ORDER BY last_seen_at DESC LIMIT ?`
    )
    .all(limit) as Array<{ peer_id: string; nickname: string | null; last_seen_at: string }>
  return rows
    .filter((r) => r.peer_id?.trim())
    .map((r) => ({
      peerId: r.peer_id,
      nickname: r.nickname ?? undefined,
      lastSeenAt: r.last_seen_at
    }))
}

/** 会话 id：和内置 UI 的会话命名空间隔开，但共享同一套记忆/人格引擎 */
export function normalizeQqSessionId(userId: string | number): string {
  const core = String(userId).replace(/[^\w-]+/g, '_')
  return `qq:${core || 'peer'}`
}
