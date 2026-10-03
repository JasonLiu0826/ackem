import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { getDatabase } from '../../db/database'
import { PRIMARY_AGENT_ID } from '../../social/agents/agentPaths'
import type { WeixinAccount } from './types'

const ACCOUNT_FILE = 'channels/weixin-account.json'
const PENDING_BOUND_FILE = 'channels/weixin-pending-bound-agent.json'

function accountFilePath(dataRoot: string): string {
  return join(dataRoot, ACCOUNT_FILE)
}

function pendingBoundPath(dataRoot: string): string {
  return join(dataRoot, PENDING_BOUND_FILE)
}

function normalizeBoundAgentId(raw?: string | null): string {
  const t = typeof raw === 'string' ? raw.trim() : ''
  return t.length > 0 ? t : PRIMARY_AGENT_ID
}

function readAccountFile(dataRoot: string): WeixinAccount | null {
  const path = accountFilePath(dataRoot)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as WeixinAccount
    if (raw?.token && raw.accountId && raw.baseUrl) {
      return {
        ...raw,
        boundAgentId: normalizeBoundAgentId(raw.boundAgentId)
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeAccountFile(dataRoot: string, account: WeixinAccount): void {
  const path = accountFilePath(dataRoot)
  mkdirSync(join(dataRoot, 'channels'), { recursive: true })
  writeFileSync(path, JSON.stringify(account, null, 2), 'utf-8')
}

function clearAccountFile(dataRoot: string): void {
  const path = accountFilePath(dataRoot)
  if (existsSync(path)) writeFileSync(path, '', 'utf-8')
}

export function setPendingWeixinBoundAgent(dataRoot: string, agentId: string): void {
  mkdirSync(join(dataRoot, 'channels'), { recursive: true })
  writeFileSync(
    pendingBoundPath(dataRoot),
    JSON.stringify({ agentId: normalizeBoundAgentId(agentId) }),
    'utf-8'
  )
}

export function peekPendingWeixinBoundAgent(dataRoot: string): string | null {
  const path = pendingBoundPath(dataRoot)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as { agentId?: string }
    return normalizeBoundAgentId(raw.agentId)
  } catch {
    return null
  }
}

export function clearPendingWeixinBoundAgent(dataRoot: string): void {
  const path = pendingBoundPath(dataRoot)
  if (existsSync(path)) writeFileSync(path, '', 'utf-8')
}

export function resolveWeixinBoundAgentId(dataRoot: string, account?: WeixinAccount | null): string {
  const acc = account ?? loadWeixinAccount(dataRoot)
  if (acc?.boundAgentId) return normalizeBoundAgentId(acc.boundAgentId)
  const pending = peekPendingWeixinBoundAgent(dataRoot)
  return pending ?? PRIMARY_AGENT_ID
}

export function loadWeixinAccount(dataRoot: string): WeixinAccount | null {
  const db = getDatabase(dataRoot)
  if (db) {
    try {
      const row = db
        .prepare(
          `SELECT account_id, token, base_url, user_id, bound_agent_id FROM weixin_account WHERE id = 1`
        )
        .get() as
        | {
            account_id: string
            token: string
            base_url: string
            user_id: string | null
            bound_agent_id?: string | null
          }
        | undefined
      if (row?.token) {
        return {
          accountId: row.account_id,
          token: row.token,
          baseUrl: row.base_url,
          userId: row.user_id ?? undefined,
          boundAgentId: normalizeBoundAgentId(row.bound_agent_id)
        }
      }
    } catch {
      const row = db
        .prepare(
          `SELECT account_id, token, base_url, user_id FROM weixin_account WHERE id = 1`
        )
        .get() as
        | { account_id: string; token: string; base_url: string; user_id: string | null }
        | undefined
      if (row?.token) {
        const fromFile = readAccountFile(dataRoot)
        return {
          accountId: row.account_id,
          token: row.token,
          baseUrl: row.base_url,
          userId: row.user_id ?? undefined,
          boundAgentId: normalizeBoundAgentId(fromFile?.boundAgentId)
        }
      }
    }
  }
  return readAccountFile(dataRoot)
}

export function saveWeixinAccount(dataRoot: string, account: WeixinAccount): void {
  const boundAgentId = normalizeBoundAgentId(
    account.boundAgentId ?? peekPendingWeixinBoundAgent(dataRoot)
  )
  const next: WeixinAccount = { ...account, boundAgentId }
  writeAccountFile(dataRoot, next)
  clearPendingWeixinBoundAgent(dataRoot)
  const db = getDatabase(dataRoot)
  if (!db) return
  const now = new Date().toISOString()
  try {
    db.prepare(
      `INSERT INTO weixin_account(id, account_id, token, base_url, user_id, bound_agent_id, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         account_id = excluded.account_id,
         token = excluded.token,
         base_url = excluded.base_url,
         user_id = excluded.user_id,
         bound_agent_id = excluded.bound_agent_id,
         updated_at = excluded.updated_at`
    ).run(next.accountId, next.token, next.baseUrl, next.userId ?? null, boundAgentId, now)
  } catch {
    db.prepare(
      `INSERT INTO weixin_account(id, account_id, token, base_url, user_id, updated_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         account_id = excluded.account_id,
         token = excluded.token,
         base_url = excluded.base_url,
         user_id = excluded.user_id,
         updated_at = excluded.updated_at`
    ).run(next.accountId, next.token, next.baseUrl, next.userId ?? null, now)
  }
  db.prepare(
    `INSERT INTO weixin_sync(account_id, get_updates_buf) VALUES (?, '')
     ON CONFLICT(account_id) DO NOTHING`
  ).run(account.accountId)
}

/** 已登录时可改绑对话角色，无需重扫码 */
export function setWeixinBoundAgent(dataRoot: string, agentId: string): WeixinAccount | null {
  const account = loadWeixinAccount(dataRoot)
  if (!account) {
    setPendingWeixinBoundAgent(dataRoot, agentId)
    return null
  }
  const next = { ...account, boundAgentId: normalizeBoundAgentId(agentId) }
  saveWeixinAccount(dataRoot, next)
  return next
}

export function clearWeixinAccount(dataRoot: string): void {
  clearAccountFile(dataRoot)
  clearPendingWeixinBoundAgent(dataRoot)
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(`DELETE FROM weixin_account WHERE id = 1`).run()
}

export function loadSyncBuf(dataRoot: string, accountId: string): string {
  const db = getDatabase(dataRoot)
  if (!db) return ''
  const row = db
    .prepare(`SELECT get_updates_buf FROM weixin_sync WHERE account_id = ?`)
    .get(accountId) as { get_updates_buf: string } | undefined
  return row?.get_updates_buf ?? ''
}

export function saveSyncBuf(dataRoot: string, accountId: string, buf: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(
    `INSERT INTO weixin_sync(account_id, get_updates_buf) VALUES (?, ?)
     ON CONFLICT(account_id) DO UPDATE SET get_updates_buf = excluded.get_updates_buf`
  ).run(accountId, buf)
}

export function saveContextToken(dataRoot: string, peerId: string, token: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(
    `INSERT INTO weixin_context(peer_id, context_token, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(peer_id) DO UPDATE SET context_token = excluded.context_token, updated_at = excluded.updated_at`
  ).run(peerId, token, new Date().toISOString())
}

export function loadContextToken(dataRoot: string, peerId: string): string | null {
  const db = getDatabase(dataRoot)
  if (!db) return null
  const row = db
    .prepare(`SELECT context_token FROM weixin_context WHERE peer_id = ?`)
    .get(peerId) as { context_token: string } | undefined
  return row?.context_token ?? null
}

export type WeixinPeerRow = {
  peerId: string
  updatedAt: string
}

/** 最近有过 context 的微信用户（主动消息目标） */
export function listWeixinPeers(dataRoot: string, limit = 8): WeixinPeerRow[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db
    .prepare(
      `SELECT peer_id, updated_at FROM weixin_context ORDER BY updated_at DESC LIMIT ?`
    )
    .all(limit) as Array<{ peer_id: string; updated_at: string }>
  return rows
    .filter((r) => r.peer_id?.trim())
    .map((r) => ({ peerId: r.peer_id, updatedAt: r.updated_at }))
}

const SEEN_CAP = 500

export function markMessageSeen(dataRoot: string, messageId: number): boolean {
  const db = getDatabase(dataRoot)
  if (!db) return false
  const exists = db.prepare(`SELECT 1 FROM weixin_seen WHERE message_id = ?`).get(messageId)
  if (exists) return true
  db.prepare(`INSERT INTO weixin_seen(message_id) VALUES (?)`).run(messageId)
  const count = db.prepare(`SELECT COUNT(*) as c FROM weixin_seen`).get() as { c: number }
  if (count.c > SEEN_CAP) {
    db.prepare(
      `DELETE FROM weixin_seen WHERE message_id IN (
         SELECT message_id FROM weixin_seen ORDER BY message_id ASC LIMIT ?
       )`
    ).run(count.c - SEEN_CAP)
  }
  return false
}

export function normalizePeerSessionId(fromUserId: string): string {
  const core = fromUserId.replace(/@im\.wechat$/i, '').replace(/[^\w.-]+/g, '_')
  return `wechat:${core || 'peer'}`
}
