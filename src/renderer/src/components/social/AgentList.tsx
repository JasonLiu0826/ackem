import { useCallback, useEffect, useState } from 'react'
import type { SocialAgentSummary } from '../../ackem'
import { PRIMARY_AGENT_ID } from '../../store/appStore'
import { AgentAvatar } from './AgentAvatar'
import { buildPresetShortLabelMap, loadAllSocialPresets } from './presetLabels'

type Props = {
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onEdit: (agent: SocialAgentSummary) => void
  onDelete: (agent: SocialAgentSummary) => void
  refreshToken?: number
  /** 列表顶部展示 Ackem 主体（用于切换主对话） */
  includePrimary?: boolean
}

const PRIMARY_ENTRY: SocialAgentSummary = {
  id: PRIMARY_AGENT_ID,
  name: 'Ackem',
  kind: 'primary',
  origin: 'builtin',
  deletable: false,
  presetId: 'default',
  gender: 'female',
  sessionId: PRIMARY_AGENT_ID,
  se: 0,
  sp: 0,
  so: 0,
  personaSource: null,
  avatarUrl: null,
  createdAt: '',
  updatedAt: '',
}

function Tag({
  children,
  tone = 'muted',
}: {
  children: string
  tone?: 'muted' | 'user' | 'gender' | 'persona'
}): JSX.Element {
  const toneClass =
    tone === 'user'
      ? 'bg-blue-500/15 text-blue-300'
      : tone === 'gender'
        ? 'bg-amber-500/10 text-amber-200/90'
        : tone === 'persona'
          ? 'bg-violet-500/10 text-violet-200/90'
          : 'bg-surface-inset text-ink-muted'
  return (
    <span className={['max-w-[72px] truncate rounded px-1.5 py-0.5 text-[10px]', toneClass].join(' ')}>
      {children}
    </span>
  )
}

export function AgentList({
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  refreshToken = 0,
  includePrimary = false,
}: Props): JSX.Element {
  const [agents, setAgents] = useState<SocialAgentSummary[]>([])
  const [presetLabels, setPresetLabels] = useState<Map<string, string>>(new Map())
  const [menuId, setMenuId] = useState<string | null>(null)

  const reload = useCallback(() => {
    void window.ackem.social.listAgents().then(setAgents)
  }, [])

  useEffect(() => {
    reload()
  }, [reload, refreshToken])

  useEffect(() => {
    void loadAllSocialPresets().then((presets) => {
      setPresetLabels(buildPresetShortLabelMap(presets))
    })
  }, [])

  const rows = includePrimary ? [PRIMARY_ENTRY, ...agents] : agents

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-surface-inset/80 bg-surface-raised/30">
      <div className="flex items-center justify-between border-b border-surface-inset/60 px-3 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">社会成员</h2>
          <p className="mt-0.5 text-[10px] text-ink-muted">选择角色进入主对话</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg bg-accent px-2.5 py-1 text-xs text-white hover:bg-accent-hover"
        >
          添加
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {rows.map((agent) => {
          const active = selectedId === agent.id
          const isPrimary = agent.id === PRIMARY_AGENT_ID
          const isUser = agent.origin === 'user'
          const canManage = agent.deletable
          const genderLabel = agent.gender === 'female' ? '女' : '男'
          const personaLabel = isPrimary
            ? '主体'
            : (presetLabels.get(agent.presetId) ?? agent.presetId)
          return (
            <li key={agent.id} className="relative mb-1">
              <button
                type="button"
                onClick={() => onSelect(agent.id)}
                className={[
                  'flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors',
                  active ? 'bg-accent/15 ring-1 ring-accent/30' : 'hover:bg-surface-raised',
                ].join(' ')}
              >
                <AgentAvatar agentId={agent.id} name={agent.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{agent.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <Tag tone={isPrimary ? 'muted' : isUser ? 'user' : 'muted'}>
                      {isPrimary ? '主体' : isUser ? '自建' : '预制'}
                    </Tag>
                    {!isPrimary && <Tag tone="gender">{genderLabel}</Tag>}
                    <Tag tone="persona">{personaLabel}</Tag>
                  </div>
                </div>
                {canManage && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded p-1 text-ink-muted hover:bg-surface-inset hover:text-ink"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuId(menuId === agent.id ? null : agent.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation()
                        setMenuId(menuId === agent.id ? null : agent.id)
                      }
                    }}
                    aria-label="更多操作"
                  >
                    ⋮
                  </span>
                )}
              </button>
              {menuId === agent.id && canManage && (
                <div className="absolute right-2 top-10 z-10 min-w-[88px] rounded-lg border border-surface-inset bg-surface py-1 shadow-lg">
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-surface-raised"
                    onClick={() => {
                      setMenuId(null)
                      onEdit(agent)
                    }}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-surface-raised"
                    onClick={() => {
                      setMenuId(null)
                      onDelete(agent)
                    }}
                  >
                    删除
                  </button>
                </div>
              )}
            </li>
          )
        })}
        {!includePrimary && agents.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-ink-muted">暂无社会成员</li>
        )}
        {includePrimary && agents.length === 0 && (
          <li className="px-2 py-4 text-center text-[11px] text-ink-muted">
            尚无其他成员，可点「添加」创建
          </li>
        )}
      </ul>
    </aside>
  )
}
