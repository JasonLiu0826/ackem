import { useCallback, useEffect, useMemo, useState } from 'react'
import { AgentAvatar } from '../AgentAvatar'

type GroupRow = {
  id: string
  name: string
  owner_kind?: string
  owner_id?: string
  members?: Array<{ member_kind: string; member_id: string }>
}

type Msg = {
  id: string
  sender_kind: string
  sender_id: string
  content: string
  created_at: string
}

type AgentOpt = { id: string; name: string }

function suggestName(selected: AgentOpt[]): string {
  if (selected.length === 0) return ''
  if (selected.length === 1) return `和${selected[0]!.name}的小聚`
  if (selected.length === 2) return `${selected[0]!.name} · ${selected[1]!.name}`
  return `${selected[0]!.name}、${selected[1]!.name}等`
}

export function GroupsPanel(): JSX.Element {
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [agents, setAgents] = useState<AgentOpt[]>([])
  const [friends, setFriends] = useState<AgentOpt[]>([])
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [createError, setCreateError] = useState('')
  const [sending, setSending] = useState(false)

  const nameOf = useCallback(
    (kind: string, id: string) => {
      if (kind === 'user') return '你'
      if (kind === 'system') return '系统'
      return agents.find((a) => a.id === id)?.name ?? id.slice(0, 6)
    },
    [agents]
  )

  const pool = useMemo(() => {
    if (friends.length > 0) return friends
    return agents
  }, [friends, agents])

  const pickedAgents = useMemo(
    () => pool.filter((a) => picked.includes(a.id)),
    [pool, picked]
  )

  const reload = useCallback(async () => {
    const [g, a, f] = await Promise.all([
      window.ackem.social.listGroups(),
      window.ackem.social.listAgents(),
      window.ackem.social.listFriends().catch(() => ({ friends: [] as unknown[] })),
    ])
    setGroups((g.groups as GroupRow[]) ?? [])
    setAgents(a.map((x) => ({ id: x.id, name: x.name })))
    const friendRows = (f.friends as Array<{ agentId?: string; agentName?: string }>) ?? []
    setFriends(
      friendRows
        .filter((x) => x.agentId && x.agentName)
        .map((x) => ({ id: String(x.agentId), name: String(x.agentName) }))
    )
  }, [])

  const loadMsgs = useCallback(async (groupId: string) => {
    const res = await window.ackem.social.getGroupMessages({ groupId, limit: 80 })
    setMessages(((res.messages as Msg[]) ?? []).slice().reverse())
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (activeId) void loadMsgs(activeId)
  }, [activeId, loadMsgs])

  const openCreate = () => {
    setCreateError('')
    const defaults = (friends.length > 0 ? friends : agents).slice(0, 2).map((a) => a.id)
    setPicked(defaults)
    setDraftName(suggestName((friends.length > 0 ? friends : agents).slice(0, 2)))
    setShowCreate(true)
  }

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 4)
      setDraftName(suggestName(pool.filter((a) => next.includes(a.id))))
      return next
    })
  }

  const create = async () => {
    if (picked.length < 1) {
      setCreateError('至少选一位成员')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const name = draftName.trim() || suggestName(pickedAgents)
      const res = await window.ackem.social.createGroup({ name, agentIds: picked })
      await reload()
      setShowCreate(false)
      if (res.ok && res.group && typeof res.group === 'object' && 'id' in res.group) {
        setActiveId(String((res.group as { id: string }).id))
      }
    } finally {
      setCreating(false)
    }
  }

  const send = async () => {
    if (!activeId || !draft.trim() || sending) return
    setSending(true)
    try {
      await window.ackem.social.sendGroupMessage({ groupId: activeId, content: draft.trim() })
      setDraft('')
      await loadMsgs(activeId)
    } finally {
      setSending(false)
    }
  }

  const active = groups.find((g) => g.id === activeId)
  const memberNames = (active?.members ?? [])
    .filter((m) => m.member_kind === 'agent')
    .map((m) => nameOf('agent', m.member_id))
    .join('、')

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 50% 40% at 100% 0%, var(--color-accent-glow), transparent 50%)',
        }}
      />

      <aside className="relative z-[1] flex w-[200px] shrink-0 flex-col border-r border-glass-border bg-surface-raised/40 sm:w-[220px]">
        <div className="flex items-center gap-2 border-b border-glass-border px-3 py-3">
          <div>
            <p className="font-display text-[10px] tracking-widest text-accent">GROUPS</p>
            <h3 className="font-display text-sm font-semibold text-ink">群聊</h3>
          </div>
          <button
            type="button"
            className="ml-auto rounded-lg bg-accent px-2.5 py-1 text-[11px] text-white hover:bg-accent-hover"
            onClick={openCreate}
          >
            新建
          </button>
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {groups.length === 0 && (
            <li className="px-2 py-6 text-center text-[11px] leading-relaxed text-ink-muted">
              还没有群。
              <br />
              选人、起个名字，开一小桌。
            </li>
          )}
          {groups.map((g) => {
            const count = g.members?.filter((m) => m.member_kind === 'agent').length ?? 0
            return (
              <li key={g.id}>
                <button
                  type="button"
                  className={[
                    'w-full rounded-xl px-3 py-2.5 text-left transition',
                    activeId === g.id
                      ? 'bg-accent/15 text-ink shadow-glow'
                      : 'text-ink-muted hover:bg-surface-inset/50 hover:text-ink',
                  ].join(' ')}
                  onClick={() => setActiveId(g.id)}
                >
                  <div className="truncate font-display text-xs font-medium">{g.name}</div>
                  <div className="mt-0.5 text-[10px] opacity-70">{count} 位同伴</div>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        {!activeId && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/12 font-display text-2xl text-accent">
              群
            </div>
            <p className="font-display text-base text-ink">围一桌说说话</p>
            <p className="max-w-xs text-xs leading-relaxed text-ink-muted">
              选你想拉进来的人，起个名字。群里每人语气不一样，不会齐声复读。
            </p>
            <button
              type="button"
              className="mt-2 rounded-xl bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover"
              onClick={openCreate}
            >
              建一个群
            </button>
          </div>
        )}

        {activeId && (
          <>
            <header className="flex items-center gap-3 border-b border-glass-border px-4 py-3">
              <div className="flex -space-x-2">
                {(active?.members ?? [])
                  .filter((m) => m.member_kind === 'agent')
                  .slice(0, 3)
                  .map((m) => (
                    <AgentAvatar
                      key={m.member_id}
                      agentId={m.member_id}
                      name={nameOf('agent', m.member_id)}
                      size={28}
                      className="ring-2 ring-surface"
                    />
                  ))}
              </div>
              <div className="min-w-0">
                <h4 className="truncate font-display text-sm font-semibold text-ink">
                  {active?.name ?? '群聊'}
                </h4>
                <p className="truncate text-[10px] text-ink-muted">
                  {memberNames || '群聊'} · 每次约两人接话
                </p>
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((m) => {
                const mine = m.sender_kind === 'user'
                const system = m.sender_kind === 'system'
                if (system) {
                  return (
                    <div key={m.id} className="text-center text-[10px] text-ink-subtle">
                      {m.content}
                    </div>
                  )
                }
                return (
                  <div
                    key={m.id}
                    className={['flex gap-2', mine ? 'flex-row-reverse' : ''].join(' ')}
                  >
                    {!mine && m.sender_kind === 'agent' && (
                      <AgentAvatar
                        agentId={m.sender_id}
                        name={nameOf(m.sender_kind, m.sender_id)}
                        size={32}
                      />
                    )}
                    <div
                      className={[
                        'max-w-[75%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed',
                        mine
                          ? 'rounded-br-md bg-accent text-white'
                          : 'rounded-bl-md bg-surface-raised text-ink shadow-glow',
                      ].join(' ')}
                    >
                      {!mine && (
                        <div className="mb-0.5 text-[10px] text-accent">
                          {nameOf(m.sender_kind, m.sender_id)}
                        </div>
                      )}
                      {m.content}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border-t border-glass-border bg-surface-raised/50 p-3">
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-xl border border-glass-border bg-surface px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-accent/40 focus:shadow-glow"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void send()
                  }}
                  placeholder="说点什么…"
                />
                <button
                  type="button"
                  disabled={sending}
                  className="rounded-xl bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  onClick={() => void send()}
                >
                  发送
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
          <div className="glass-panel w-full max-w-md rounded-2xl p-5 shadow-xl">
            <p className="font-display text-[10px] tracking-widest text-accent">NEW GROUP</p>
            <h3 className="mt-1 font-display text-lg font-semibold text-ink">建一个小聚</h3>
            <p className="mt-1 text-[12px] text-ink-muted">
              {friends.length > 0 ? '优先从好友里选，也可改名字。' : '先选人，再起个好记的名字。'}
            </p>

            <label className="mt-4 block text-[11px] text-ink-muted">群名</label>
            <input
              className="mt-1 w-full rounded-xl border border-glass-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent/40"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value.slice(0, 32))}
              placeholder="例如：南枝 · 许昭然"
            />

            <p className="mt-4 text-[11px] text-ink-muted">
              成员（{picked.length}/4）
              {friends.length > 0 ? ' · 好友' : ''}
            </p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {pool.map((a) => {
                const on = picked.includes(a.id)
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={[
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition',
                        on ? 'bg-accent/15 text-ink' : 'hover:bg-surface-inset/60 text-ink-muted',
                      ].join(' ')}
                      onClick={() => togglePick(a.id)}
                    >
                      <AgentAvatar agentId={a.id} name={a.name} size={32} />
                      <span className="font-display text-sm">{a.name}</span>
                      <span className="ml-auto text-[11px] text-accent">{on ? '已选' : '选择'}</span>
                    </button>
                  </li>
                )
              })}
              {pool.length === 0 && (
                <li className="py-6 text-center text-[12px] text-ink-muted">
                  还没有可拉进群的成员。先去「成员」页认识几位。
                </li>
              )}
            </ul>

            {createError && (
              <p className="mt-2 text-[12px] text-emotion-cool">{createError}</p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-glass-border py-2.5 text-sm text-ink-muted hover:bg-surface-inset/50"
                onClick={() => setShowCreate(false)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={creating || picked.length < 1}
                className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                onClick={() => void create()}
              >
                {creating ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
