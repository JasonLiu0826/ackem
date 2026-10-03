import { SOCIAL } from '../types'
import { getDatabase } from '../../db/database'
import { addMember } from '../../db/repos/groupMembersRepo'

/** Group owner agent approval — same soft formula as friendship. */
export function shouldApproveJoin(
  trust: number,
  aff: number,
  se: number
): boolean {
  return (
    trust >= SOCIAL.FRIEND_TRUST_PASS ||
    (trust >= SOCIAL.FRIEND_TRUST_SOFT && aff > 0 && se >= 40)
  )
}

export function respondJoinRequest(
  dataRoot: string,
  requestId: string,
  decision: { trust: number; aff: number; se: number }
): { accepted: boolean } {
  const db = getDatabase(dataRoot)
  if (!db) throw new Error('DATABASE_UNAVAILABLE')
  const row = db
    .prepare(`SELECT * FROM group_join_requests WHERE id = ?`)
    .get(requestId) as
    | {
        id: string
        group_id: string
        user_id: string
        status: string
      }
    | undefined
  if (!row || row.status !== 'pending') return { accepted: false }

  const accepted = shouldApproveJoin(decision.trust, decision.aff, decision.se)
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE group_join_requests SET status = ?, responded_at = ? WHERE id = ?`
  ).run(accepted ? 'accepted' : 'rejected', now, requestId)

  if (accepted) {
    addMember(dataRoot, {
      group_id: row.group_id,
      member_kind: 'user',
      member_id: row.user_id,
      role: 'member',
      joined_at: now,
    })
  }
  return { accepted }
}
