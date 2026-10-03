import type { SocialAgentSummary } from '../../ackem'
import { PRIMARY_AGENT_ID } from '../../store/appStore'
import { AgentAvatar } from './AgentAvatar'
import { buildPresetShortLabelMap, loadAllSocialPresets } from './presetLabels'
import { useEffect, useState } from 'react'

type Props = {
  agent: SocialAgentSummary | null
  onEnterChat: () => void
  onEdit: (agent: SocialAgentSummary) => void
  onDelete: (agent: SocialAgentSummary) => void
}

export function AgentManagePanel({
  agent,
  onEnterChat,
  onEdit,
  onDelete,
}: Props): JSX.Element {
  const [presetLabels, setPresetLabels] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    void loadAllSocialPresets().then((presets) => {
      setPresetLabels(buildPresetShortLabelMap(presets))
    })
  }, [])

  if (!agent) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="text-sm text-ink-muted">从左侧选择角色</p>
        <p className="text-xs text-ink-muted/80">
          选择后将切换主对话与记忆档案；此处可编辑自建角色
        </p>
      </div>
    )
  }

  const isPrimary = agent.id === PRIMARY_AGENT_ID
  const isUser = agent.origin === 'user'
  const genderLabel = agent.gender === 'female' ? '女' : '男'
  const personaLabel = presetLabels.get(agent.presetId) ?? agent.presetId
  const originLabel = isPrimary ? '主体' : isUser ? '自建' : '预制'

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 py-10">
        <AgentAvatar agentId={agent.id} name={agent.name} size={72} />
        <div className="text-center">
          <h1 className="text-lg font-semibold text-ink">{agent.name}</h1>
          <p className="mt-1.5 text-xs text-ink-muted">
            {originLabel} · {genderLabel} · {personaLabel}
          </p>
          {!isPrimary && (
            <p className="mt-3 max-w-sm text-[11px] leading-relaxed text-ink-muted/90">
              点击下方进入主对话。记忆档案会跟随当前对话角色切换。
            </p>
          )}
          {isPrimary && (
            <p className="mt-3 max-w-sm text-[11px] leading-relaxed text-ink-muted/90">
              Ackem 主体：完整陪伴、扩展与微信通道均绑定于此。
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onEnterChat}
            className="rounded-xl bg-accent px-5 py-2 text-sm text-white hover:bg-accent-hover"
          >
            进入对话
          </button>
          {agent.deletable && (
            <>
              <button
                type="button"
                onClick={() => onEdit(agent)}
                className="rounded-xl border border-glass-border px-4 py-2 text-sm text-ink-muted hover:text-ink"
              >
                编辑
              </button>
              <button
                type="button"
                onClick={() => onDelete(agent)}
                className="rounded-xl border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
              >
                删除
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
