import { useCallback, useEffect, useState } from 'react'
import type { SocialAgentSummary } from '../../ackem'
import { PRIMARY_AGENT_ID, useAppStore } from '../../store/appStore'
import { AgentList } from './AgentList'
import { AgentManagePanel } from './AgentManagePanel'
import { AddAgentWizard } from './AddAgentWizard'
import { EditAgentDialog } from './EditAgentDialog'
import { DeleteAgentDialog } from './DeleteAgentDialog'
import { SocialFeed } from './feed/SocialFeed'
import { GroupsPanel } from './group/GroupsPanel'

type SocialTab = 'feed' | 'members' | 'groups' | 'more'

const TABS: Array<{ id: SocialTab; label: string; hint: string }> = [
  { id: 'feed', label: '动态', hint: '朋友圈' },
  { id: 'members', label: '成员', hint: '角色' },
  { id: 'groups', label: '群聊', hint: '小聚' },
  { id: 'more', label: '更多', hint: '设置' },
]

export function SocialPage(): JSX.Element {
  const pushToast = useAppStore((s) => s.pushToast)
  const activeAgentId = useAppStore((s) => s.activeAgentId)
  const setActiveAgent = useAppStore((s) => s.setActiveAgent)
  const setTab = useAppStore((s) => s.setTab)
  const requestChatInputFocus = useAppStore((s) => s.requestChatInputFocus)

  const [socialTab, setSocialTab] = useState<SocialTab>('feed')
  const [selectedId, setSelectedId] = useState<string>(activeAgentId)
  const [selectedAgent, setSelectedAgent] = useState<SocialAgentSummary | null>(null)
  const [listRefresh, setListRefresh] = useState(0)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editAgent, setEditAgent] = useState<SocialAgentSummary | null>(null)
  const [deleteAgent, setDeleteAgent] = useState<SocialAgentSummary | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [friendStatus, setFriendStatus] = useState<string | null>(null)
  const [offlineNote, setOfflineNote] = useState('')
  const [socialEnabled, setSocialEnabled] = useState(true)
  const [achieveHint, setAchieveHint] = useState('')

  const refreshList = useCallback(() => {
    setListRefresh((n) => n + 1)
  }, [])

  useEffect(() => {
    setSelectedId(activeAgentId)
  }, [activeAgentId])

  useEffect(() => {
    void window.ackem.social.ensureSeeded()
    void window.ackem.social.getSocialSettings().then((s) => setSocialEnabled(s.enabled))
    void window.ackem.social.getOfflineReplay().then((r) => {
      if (r.show && r.narrative) setOfflineNote(r.narrative)
    })
  }, [])

  useEffect(() => {
    if (selectedId === PRIMARY_AGENT_ID) {
      setSelectedAgent({
        id: PRIMARY_AGENT_ID,
        name: 'Ackem',
        kind: 'primary',
        origin: 'builtin',
        deletable: false,
        presetId: 'default',
        gender: 'male',
        sessionId: PRIMARY_AGENT_ID,
        se: 0,
        sp: 0,
        so: 0,
        personaSource: null,
        avatarUrl: null,
        createdAt: '',
        updatedAt: '',
      })
      setFriendStatus(null)
      return
    }
    void window.ackem.social.getAgent(selectedId).then(setSelectedAgent)
    void window.ackem.social.getFriendship({ agentId: selectedId }).then((r) => {
      setFriendStatus(r.status)
    })
  }, [selectedId, listRefresh])

  const enterChatWith = useCallback(
    (id: string, name: string) => {
      setActiveAgent(id, name)
      setTab('chat')
      requestChatInputFocus()
    },
    [setActiveAgent, setTab, requestChatInputFocus]
  )

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id)
      setSocialTab('members')
      if (id === PRIMARY_AGENT_ID) {
        enterChatWith(PRIMARY_AGENT_ID, 'Ackem')
        return
      }
      void window.ackem.social.getAgent(id).then((row) => {
        if (row) enterChatWith(row.id, row.name)
        else setSelectedId(PRIMARY_AGENT_ID)
      })
    },
    [enterChatWith]
  )

  const handleDelete = async () => {
    if (!deleteAgent) return
    setDeleteBusy(true)
    try {
      const res = await window.ackem.social.deleteAgent(deleteAgent.id)
      if (!res.ok) {
        pushToast(res.message)
        return
      }
      if (selectedId === deleteAgent.id || activeAgentId === deleteAgent.id) {
        setSelectedId(PRIMARY_AGENT_ID)
        setActiveAgent(PRIMARY_AGENT_ID, 'Ackem')
      }
      setDeleteAgent(null)
      refreshList()
      pushToast('已删除角色')
    } finally {
      setDeleteBusy(false)
    }
  }

  const requestFriend = async () => {
    if (!selectedAgent || selectedAgent.kind === 'primary') return
    const res = await window.ackem.social.requestFriend({ agentId: selectedAgent.id })
    setFriendStatus(res.status)
    pushToast(
      res.status === 'accepted'
        ? `已与 ${selectedAgent.name} 成为好友`
        : res.status === 'cooldown'
          ? '对方还在犹豫，稍后再试'
          : '这次没有通过'
    )
  }

  return (
    <div className="social-page flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      {offlineNote && (
        <div className="social-offline-banner relative z-[2] flex items-start gap-3 border-b border-accent/25 bg-gradient-to-r from-accent/15 via-emotion-warm/10 to-transparent px-5 py-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 font-display text-xs text-accent">
            忆
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xs font-medium text-ink">你不在的时候</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{offlineNote}</p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-ink-muted transition hover:bg-surface/40 hover:text-ink"
            onClick={() => {
              void window.ackem.social.ackOfflineReplay()
              setOfflineNote('')
            }}
          >
            知道了
          </button>
        </div>
      )}

      <nav className="relative z-[1] flex shrink-0 items-stretch border-b border-glass-border bg-surface-raised/35 px-2">
        {TABS.map((t) => {
          const on = socialTab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSocialTab(t.id)}
              className={[
                'relative mx-0.5 flex min-w-[4.5rem] flex-col items-center px-3 pb-2.5 pt-3 transition',
                on ? 'text-ink' : 'text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              <span className="font-display text-sm font-semibold tracking-wide">{t.label}</span>
              <span className="mt-0.5 text-[9px] tracking-wider opacity-60">{t.hint}</span>
              {on && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-accent shadow-glow" />
              )}
            </button>
          )
        })}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1">
        {socialTab === 'feed' && <SocialFeed />}
        {socialTab === 'groups' && <GroupsPanel />}

        {socialTab === 'more' && (
          <div className="relative min-h-0 flex-1 overflow-y-auto">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse 70% 45% at 50% 0%, var(--color-accent-glow), transparent 55%)',
              }}
            />
            <div className="relative mx-auto max-w-md space-y-4 px-5 py-8">
              <div>
                <p className="font-display text-[11px] tracking-[0.2em] text-accent">WORLD</p>
                <h2 className="font-display text-lg font-semibold text-ink">社会设置</h2>
                <p className="mt-1 text-xs text-ink-muted">控制这座小镇要不要自己往前走</p>
              </div>

              <label className="glass-panel flex cursor-pointer items-center gap-4 rounded-2xl p-4 transition hover:shadow-glow">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">社会自动演化</div>
                  <div className="mt-0.5 text-[11px] text-ink-muted">
                    开启后后台 Tick 会发帖、互动、更新关系
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-accent)]"
                  checked={socialEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked
                    setSocialEnabled(enabled)
                    void window.ackem.social.toggle({ enabled })
                    pushToast(enabled ? '社会已苏醒' : '社会已暂停')
                  }}
                />
              </label>

              <div className="glass-panel space-y-3 rounded-2xl p-4">
                <button
                  type="button"
                  className="w-full rounded-xl bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
                  onClick={() => {
                    void window.ackem.social.runTickNow().then(() => pushToast('世界往前走了一小步'))
                  }}
                >
                  立即推进一轮社会
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl border border-glass-border py-2.5 text-sm text-ink-muted transition hover:border-accent/30 hover:text-ink"
                  onClick={() => {
                    void window.ackem.social.getAchievements().then((r) => {
                      const msg = `成就 ${r.unlocked.length} / ${r.defs.length}`
                      setAchieveHint(msg)
                      pushToast(msg)
                    })
                  }}
                >
                  查看成就进度
                </button>
                {achieveHint && (
                  <p className="text-center text-[11px] text-accent">{achieveHint}</p>
                )}
              </div>

              <p className="px-1 text-[11px] leading-relaxed text-ink-subtle">
                主 Chat 里的 Ackem 仍是唯一主体；这里的人会刷圈、建群，偶尔把见闻带回给你。
              </p>
            </div>
          </div>
        )}

        {socialTab === 'members' && (
          <>
            <AgentList
              selectedId={selectedId}
              onSelect={handleSelect}
              onAdd={() => setWizardOpen(true)}
              onEdit={setEditAgent}
              onDelete={setDeleteAgent}
              refreshToken={listRefresh}
              includePrimary
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <AgentManagePanel
                agent={selectedAgent}
                onEnterChat={() => {
                  if (!selectedAgent) return
                  enterChatWith(selectedAgent.id, selectedAgent.name)
                }}
                onEdit={setEditAgent}
                onDelete={setDeleteAgent}
              />
              {selectedAgent && selectedAgent.kind !== 'primary' && (
                <div className="flex flex-wrap items-center justify-center gap-2 border-t border-glass-border bg-surface-raised/30 px-4 py-3">
                  <button
                    type="button"
                    disabled={friendStatus === 'accepted'}
                    className="rounded-xl bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                    onClick={() => void requestFriend()}
                  >
                    {friendStatus === 'accepted' ? '已是好友' : '申请加好友'}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-glass-border px-3 py-2 text-xs text-ink-muted hover:text-ink"
                    onClick={() => {
                      void window.ackem.social.muteAgent({ agentId: selectedAgent.id })
                      pushToast(`已屏蔽 ${selectedAgent.name} 的动态`)
                    }}
                  >
                    屏蔽动态
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-danger/30 px-3 py-2 text-xs text-danger/90 hover:bg-danger/10"
                    onClick={() => {
                      void window.ackem.social.blockAgent({ agentId: selectedAgent.id })
                      pushToast(`已拉黑 ${selectedAgent.name}`)
                    }}
                  >
                    拉黑
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <AddAgentWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={(id) => {
          refreshList()
          setSelectedId(id)
          void window.ackem.social.getAgent(id).then((row) => {
            if (row) enterChatWith(row.id, row.name)
            else pushToast('角色创建成功')
          })
        }}
      />
      {editAgent && (
        <EditAgentDialog
          open={editAgent != null}
          agent={editAgent}
          onClose={() => setEditAgent(null)}
          onSaved={() => {
            refreshList()
            if (activeAgentId === editAgent.id) {
              void window.ackem.social.getAgent(editAgent.id).then((row) => {
                if (row) setActiveAgent(row.id, row.name)
              })
            }
            pushToast('已保存')
          }}
        />
      )}
      <DeleteAgentDialog
        open={deleteAgent != null}
        agentName={deleteAgent?.name ?? ''}
        busy={deleteBusy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteAgent(null)}
      />
    </div>
  )
}
