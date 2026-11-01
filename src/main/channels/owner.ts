// [channels/owner] — 机主身份与三端会话统一
//
// 解决两个 P0：
// 1. 安全：QQ/微信入站无身份校验，陌生人也能套取机主档案/记忆。
//    → 首个私聊用户自动绑定为机主；非机主消息不进主流程。
// 2. 记忆：桌面 'default' / QQ 'qq:<uin>' / 微信 'wechat:<peer>' 三个 sessionId
//    各自隔离，事实记忆换端即失忆（filterFactsForSession 严格相等）。
//    → 机主的渠道会话统一映射回 'default'，情绪状态、记忆、聊天历史三端共享。
//
// 绑定按「渠道 + 机器人账号」隔离（kv: channel_owner / qq:<selfId>）。
// 需要重置机主时删除 kv_store 里 namespace='channel_owner' 的对应 key 即可。

import { kvGet, kvSet } from '../db/repos/kv'
import { getDatabase } from '../db/database'
import { createLogger } from '../logger'

const log = createLogger('channel-owner')

export type OwnerKind = 'qq' | 'weixin'

function ownerKey(kind: OwnerKind, scope: string): string {
  return `${kind}:${scope}`
}

function ownerSessionKey(kind: OwnerKind, core: string): string {
  return `${kind}:${core}`
}

/** 已绑定的机主（归一化 core），未绑定返回 null */
export function getBoundOwner(dataRoot: string, kind: OwnerKind, scope: string): string | null {
  return kvGet(dataRoot, 'channel_owner', ownerKey(kind, scope))
}

/** 把旧会话数据（qq:<uin> 等）迁移合并到 'default'，一次性执行 */
function migrateSessionDataToDefault(dataRoot: string, oldSessionId: string): void {
  if (oldSessionId === 'default') return
  const db = getDatabase(dataRoot)
  if (!db) return
  try {
    const tx = db.transaction(() => {
      // 事实与情节：直接改归属
      db.prepare(`UPDATE memory_facts SET source_session_id = 'default' WHERE source_session_id = ?`).run(oldSessionId)
      db.prepare(`UPDATE episodes SET source_session_id = 'default' WHERE source_session_id = ?`).run(oldSessionId)
      // 聊天历史：合并进 default（默认保留桌面已有记录在前）
      const oldRow = db.prepare(`SELECT rows_json FROM chat_history WHERE session_id = ?`).get(oldSessionId) as
        | { rows_json: string }
        | undefined
      if (oldRow) {
        try {
          const oldRows = JSON.parse(oldRow.rows_json) as unknown[]
          if (Array.isArray(oldRows) && oldRows.length > 0) {
            const defRow = db.prepare(`SELECT rows_json FROM chat_history WHERE session_id = 'default'`).get() as
              | { rows_json: string }
              | undefined
            const defRows = (() => {
              try {
                const p = defRow ? (JSON.parse(defRow.rows_json) as unknown[]) : []
                return Array.isArray(p) ? p : []
              } catch {
                return []
              }
            })()
            const merged = [...defRows, ...oldRows].slice(-2000)
            db.prepare(
              `INSERT INTO chat_history(session_id, rows_json, updated_at) VALUES ('default', ?, ?)
               ON CONFLICT(session_id) DO UPDATE SET rows_json = excluded.rows_json, updated_at = excluded.updated_at`
            ).run(JSON.stringify(merged), new Date().toISOString())
          }
        } catch {
          /* 旧历史解析失败不阻塞迁移 */
        }
        db.prepare(`DELETE FROM chat_history WHERE session_id = ?`).run(oldSessionId)
      }
      // 情绪/关系状态：default 已有桌面状态时保留（更完整），仅在缺省时迁移
      const defState = db.prepare(`SELECT 1 FROM companion_state WHERE session_id = 'default'`).get()
      if (!defState) {
        db.prepare(`UPDATE companion_state SET session_id = 'default' WHERE session_id = ?`).run(oldSessionId)
      }
    })
    tx()
    log.info('owner session migrated to default', { from: oldSessionId })
  } catch (e) {
    log.error('owner session migration failed', { from: oldSessionId, error: e instanceof Error ? e.message : String(e) })
  }
}

/**
 * 绑定或校验机主。首次来消息即绑定（并把历史数据迁移到 default）；
 * 返回该 peer 是否为机主。
 */
export function claimOwnerOrCheck(
  dataRoot: string,
  kind: OwnerKind,
  scope: string,
  peerCore: string,
  oldSessionId: string
): boolean {
  const existing = getBoundOwner(dataRoot, kind, scope)
  if (existing == null) {
    try {
      kvSet(dataRoot, 'channel_owner', ownerKey(kind, scope), peerCore)
      kvSet(dataRoot, 'channel_owner_session', ownerSessionKey(kind, peerCore), '1')
    } catch (e) {
      log.error('bind owner failed', { kind, scope, error: e instanceof Error ? e.message : String(e) })
      return false
    }
    migrateSessionDataToDefault(dataRoot, oldSessionId)
    log.info('owner bound', { kind, scope, core: peerCore })
    return true
  }
  return existing === peerCore
}

/** 渠道 sessionId → 伴侣身份 sessionId：机主归并为 'default'，陌生人保持隔离 */
export function resolveCompanionSessionId(dataRoot: string, sessionId: string): string {
  const m = /^(qq|wechat):(.+)$/.exec(sessionId)
  if (!m) return sessionId
  const kind = m[1] as OwnerKind
  const core = m[2]
  const isOwner = kvGet(dataRoot, 'channel_owner_session', ownerSessionKey(kind, core)) === '1'
  return isOwner ? 'default' : sessionId
}
