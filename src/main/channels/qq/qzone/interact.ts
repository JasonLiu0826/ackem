// [qq/qzone] — 逛空间：回自己说说下的评论、给好友动态点赞/评论
//
// 节奏参考大肥鱼：
// - 自己说说下的评论「按整串来回，一串只回一次」，所以这里只取最新一条非本人评论作为回复目标，
//   并用 qq_qzone_react 去重（同一 tid + 同一评论者只回一次）。
// - 好友动态按概率点赞/评论，而不是全量扫。单次运行有硬上限：点赞最多 3 条、评论最多 2 条，
//   评论还需要概率命中，避免被发现「机器人把每条都点了」。

import type { AppSettings } from '../../../settings'
import { createLogger } from '../../../logger'
import { composeQzoneComment } from './composer'
import { hasQzoneReacted, markQzoneReacted } from './store'
import type { QzoneActions, QzoneComment, QzoneMsg } from './actions'
import type { QzoneInteractionSummary } from './types'

const log = createLogger('qq-qzone-interact')

const MAX_LIKES = 3
const MAX_COMMENTS = 2
const MAX_REPLIES = 2

function lastCommentByOther(msg: QzoneMsg, selfId: string): QzoneComment | null {
  const flat: QzoneComment[] = []
  for (const c of msg.comments) {
    flat.push(c)
    for (const r of c.replies ?? []) flat.push(r)
  }
  for (let i = flat.length - 1; i >= 0; i -= 1) {
    const c = flat[i]
    if (c.uin && c.uin !== selfId && c.content) return c
  }
  return null
}

export async function runQzoneInteraction(args: {
  dataRoot: string
  settings: AppSettings
  actions: QzoneActions
  selfId: string
  dryRun: boolean
  rng?: () => number
}): Promise<QzoneInteractionSummary> {
  const { dataRoot, settings, actions, selfId, dryRun } = args
  const rng = args.rng ?? Math.random
  const summary: QzoneInteractionSummary = { liked: 0, commented: 0, replied: 0, skipped: 0 }

  const likeProb = Math.min(1, Math.max(0, settings.qzoneLikeProb ?? 0.25))
  const commentProb = Math.min(1, Math.max(0, settings.qzoneCommentProb ?? 0.05))

  // ── 1. 回自己说说下的评论 ─────────────────────────────
  const mine = await actions.listMine(0, 3)
  if (!mine.ok) {
    summary.error = mine.error
  } else {
    for (const msg of mine.items) {
      if (summary.replied >= MAX_REPLIES) break
      if (!msg.tid) continue
      const target = lastCommentByOther(msg, selfId)
      if (!target?.uin) continue
      if (hasQzoneReacted(dataRoot, { selfId, tid: msg.tid, targetUin: target.uin, kind: 'reply' })) {
        summary.skipped += 1
        continue
      }

      const reply = await composeQzoneComment({
        settings,
        kind: 'reply',
        feedContent: msg.content,
        authorName: target.name,
        existingComments: msg.comments.map((c) => `${c.name ?? c.uin ?? ''}：${c.content}`)
      })
      if (!reply) {
        summary.skipped += 1
        continue
      }
      if (dryRun) {
        summary.skipped += 1
        log.info('qzone reply dry run', { tid: msg.tid, reply })
        continue
      }

      const res = await actions.comment({
        tid: msg.tid,
        targetUin: selfId,
        content: reply,
        replyTo: { commentId: target.commentId, commentUin: target.uin }
      })
      if (res.ok) {
        summary.replied += 1
        markQzoneReacted(dataRoot, { selfId, tid: msg.tid, targetUin: target.uin, kind: 'reply' })
      } else {
        summary.skipped += 1
        log.warn('qzone reply failed', { tid: msg.tid, error: res.error })
      }
    }
  }

  // ── 2. 逛好友动态 ────────────────────────────────────
  const feeds = await actions.feeds(8)
  if (!feeds.ok) {
    summary.error = summary.error ?? feeds.error
    return summary
  }

  for (const item of feeds.items) {
    if (!item.tid || !item.uin || item.uin === selfId) continue
    if (summary.liked >= MAX_LIKES && summary.commented >= MAX_COMMENTS) break

    if (summary.liked < MAX_LIKES && rng() < likeProb) {
      const reacted = hasQzoneReacted(dataRoot, {
        selfId,
        tid: item.tid,
        targetUin: item.uin,
        kind: 'like'
      })
      if (!reacted) {
        if (dryRun) {
          summary.skipped += 1
        } else {
          const res = await actions.like({
            tid: item.tid,
            targetUin: item.uin,
            abstime: item.abstime
          })
          if (res.ok) {
            summary.liked += 1
            markQzoneReacted(dataRoot, {
              selfId,
              tid: item.tid,
              targetUin: item.uin,
              kind: 'like'
            })
          } else {
            log.warn('qzone like failed', { tid: item.tid, error: res.error })
          }
        }
      }
    }

    if (summary.commented < MAX_COMMENTS && rng() < commentProb) {
      const reacted = hasQzoneReacted(dataRoot, {
        selfId,
        tid: item.tid,
        targetUin: item.uin,
        kind: 'comment'
      })
      if (reacted) continue
      const text = await composeQzoneComment({
        settings,
        kind: 'comment',
        feedContent: item.content,
        authorName: item.nickname,
        existingComments: item.comments.map((c) => `${c.name ?? c.uin ?? ''}：${c.content}`)
      })
      if (!text) continue
      if (dryRun) {
        summary.skipped += 1
        log.info('qzone feed comment dry run', { tid: item.tid, text })
        continue
      }
      const res = await actions.comment({ tid: item.tid, targetUin: item.uin, content: text })
      if (res.ok) {
        summary.commented += 1
        markQzoneReacted(dataRoot, {
          selfId,
          tid: item.tid,
          targetUin: item.uin,
          kind: 'comment'
        })
      } else {
        log.warn('qzone feed comment failed', { tid: item.tid, error: res.error })
      }
    }
  }

  return summary
}
