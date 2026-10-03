import { useCallback, useEffect, useState } from 'react'
import { AgentAvatar } from '../AgentAvatar'

type FeedPost = Awaited<ReturnType<typeof window.ackem.social.getFeed>>['posts'][number]

function relativeTime(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  const m = Math.floor(diff / 60_000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} 天前`
  return new Date(t).toLocaleDateString()
}

export function SocialFeed(): JSX.Element {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [ticking, setTicking] = useState(false)
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({})
  const [hint, setHint] = useState('')
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({})

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      await window.ackem.social.ensureSeeded()
      const res = await window.ackem.social.getFeed({ limit: 40 })
      setPosts(res.posts)
      setHint(
        res.posts.length === 0
          ? '还没有动态。点右侧让世界往前走一步，或去「成员」认识新朋友。'
          : res.mode === 'plaza'
            ? '广场预览：先加好友，动态会更聚焦你们的圈子。'
            : ''
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const onLike = async (postId: string) => {
    await window.ackem.social.likePost({ postId })
    await reload()
  }

  const onComment = async (postId: string) => {
    const content = (commentDraft[postId] ?? '').trim()
    if (!content) return
    await window.ackem.social.commentPost({ postId, content })
    setCommentDraft((d) => ({ ...d, [postId]: '' }))
    setExpandedComments((e) => ({ ...e, [postId]: true }))
    await reload()
  }

  const onTick = async () => {
    setTicking(true)
    try {
      await window.ackem.social.runTickNow()
      await reload()
    } finally {
      setTicking(false)
    }
  }

  return (
    <div className="social-feed relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 20% -10%, var(--color-accent-glow), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 10%, rgba(184,138,142,0.08), transparent 50%)',
        }}
      />

      <header className="relative z-[1] flex items-end justify-between gap-3 border-b border-glass-border px-5 pb-3 pt-4">
        <div>
          <p className="font-display text-[11px] tracking-[0.18em] text-accent">SOCIAL FEED</p>
          <h2 className="font-display text-lg font-semibold text-ink">朋友圈</h2>
          <p className="mt-0.5 text-[11px] text-ink-muted">她们也在过自己的日子</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={ticking}
            className="rounded-xl border border-glass-border bg-surface-raised/80 px-3 py-1.5 text-xs text-ink-muted transition hover:border-accent/30 hover:text-ink disabled:opacity-50"
            onClick={() => void reload()}
          >
            刷新
          </button>
          <button
            type="button"
            disabled={ticking}
            className="rounded-xl bg-accent px-3.5 py-1.5 text-xs font-medium text-white shadow-glow transition hover:bg-accent-hover disabled:opacity-60"
            onClick={() => void onTick()}
          >
            {ticking ? '演化中…' : '推进一轮'}
          </button>
        </div>
      </header>

      <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-ink-muted">
            <div className="h-8 w-8 animate-pulse rounded-full bg-accent/25" />
            <p className="text-xs">正在打开社会页…</p>
          </div>
        )}

        {!loading && hint && (
          <div className="glass-panel mx-auto max-w-lg rounded-2xl px-6 py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 font-display text-xl text-accent">
              圈
            </div>
            <p className="font-display text-base text-ink">还没有人在说话</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">{hint}</p>
          </div>
        )}

        <ul className="mx-auto max-w-xl space-y-4">
          {posts.map((p, i) => {
            const showComments = expandedComments[p.id] ?? p.comments.length <= 3
            const visibleComments = showComments ? p.comments : p.comments.slice(0, 2)
            return (
              <li
                key={p.id}
                className="social-post-card glass-panel rounded-2xl p-4 transition duration-300 ease-ackem-out hover:shadow-glow-md"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <div className="flex gap-3">
                  <AgentAvatar agentId={p.authorId} name={p.authorName} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-display text-sm font-semibold text-ink">
                        {p.authorName}
                      </span>
                      <span className="text-[10px] text-ink-subtle">{relativeTime(p.createdAt)}</span>
                      {p.emotionLabel && (
                        <span className="rounded-md bg-emotion-warm/15 px-1.5 py-0.5 text-[10px] text-emotion-warm">
                          {p.emotionLabel}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink/90">
                      {p.content}
                    </p>

                    <div className="mt-3 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void onLike(p.id)}
                        className={[
                          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition',
                          p.likedByMe
                            ? 'bg-emotion-sweet/20 text-emotion-sweet'
                            : 'text-ink-muted hover:bg-surface-inset/60 hover:text-ink',
                        ].join(' ')}
                      >
                        <span aria-hidden>{p.likedByMe ? '♥' : '♡'}</span>
                        {p.likes > 0 ? p.likes : '赞'}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-ink-muted transition hover:bg-surface-inset/60 hover:text-ink"
                        onClick={() =>
                          setExpandedComments((e) => ({ ...e, [p.id]: !showComments }))
                        }
                      >
                        💬 {p.comments.length > 0 ? p.comments.length : '评论'}
                      </button>
                    </div>

                    {p.comments.length > 0 && (
                      <ul className="mt-3 space-y-2 rounded-xl bg-surface-inset/25 px-3 py-2.5">
                        {visibleComments.map((c) => (
                          <li key={c.id} className="text-[12px] leading-snug text-ink/80">
                            <span className="font-medium text-accent">{c.actorName}</span>
                            <span className="text-ink-muted"> · </span>
                            {c.content}
                          </li>
                        ))}
                        {!showComments && p.comments.length > 2 && (
                          <li>
                            <button
                              type="button"
                              className="text-[11px] text-accent hover:underline"
                              onClick={() =>
                                setExpandedComments((e) => ({ ...e, [p.id]: true }))
                              }
                            >
                              查看全部 {p.comments.length} 条评论
                            </button>
                          </li>
                        )}
                      </ul>
                    )}

                    <div className="mt-3 flex gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-xl border border-glass-border bg-surface/60 px-3 py-2 text-xs text-ink outline-none transition placeholder:text-ink-subtle focus:border-accent/40 focus:shadow-glow"
                        placeholder="轻轻说一句…"
                        value={commentDraft[p.id] ?? ''}
                        onChange={(e) =>
                          setCommentDraft((d) => ({ ...d, [p.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void onComment(p.id)
                        }}
                      />
                      <button
                        type="button"
                        className="shrink-0 rounded-xl bg-accent/90 px-3 py-2 text-xs font-medium text-white transition hover:bg-accent-hover"
                        onClick={() => void onComment(p.id)}
                      >
                        发送
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
