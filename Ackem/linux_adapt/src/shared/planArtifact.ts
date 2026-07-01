import type { PlanDispatchDraft, PlanSummary } from './planSession'
import { formatTierSummaryForPermissions } from './openforuCapabilityTier'

export type PlanArtifactKind = 'uskill' | 'uplugin' | 'undecided'

export type PlanArtifactDeployStatus = {
  kind: PlanArtifactKind
  canDeploy: boolean
  label: string
  hint: string
  confirmButtonLabel: string
}

type PlanArtifactSource = {
  planSummary?: PlanSummary | null
  dispatchDraft?: PlanDispatchDraft
}

const USKILL_RE = /uskill|\bskill\b|技能/
const UPLUGIN_RE = /uplugin|\bplugin\b|插件/
const PLACEHOLDER_BOTH_RE =
  /uskill\s*或\s*uplugin|uplugin\s*或\s*uskill|skill\s*或\s*plugin|plugin\s*或\s*skill|技能\s*或\s*插件|插件\s*或\s*技能/i

export function planArtifactTypeText(source: PlanArtifactSource): string {
  return `${source.planSummary?.artifactType ?? ''} ${source.dispatchDraft?.artifactType ?? ''}`.trim()
}

/** 从 Plan 摘要 / dispatchDraft 解析产物类型（Skill vs Plugin） */
export function resolvePlanArtifactKind(source: PlanArtifactSource): PlanArtifactKind {
  const text = planArtifactTypeText(source).toLowerCase()
  if (!text) return 'undecided'
  if (PLACEHOLDER_BOTH_RE.test(text)) return 'undecided'

  const wantsPlugin = UPLUGIN_RE.test(text)
  const wantsSkill = USKILL_RE.test(text)

  if (wantsPlugin && wantsSkill) return 'undecided'
  if (wantsPlugin) return 'uplugin'
  if (wantsSkill) return 'uskill'
  return 'undecided'
}

export function isUpluginPlan(source: PlanArtifactSource): boolean {
  return resolvePlanArtifactKind(source) === 'uplugin'
}

export function isUskillPlan(source: PlanArtifactSource): boolean {
  return resolvePlanArtifactKind(source) === 'uskill'
}

/** @deprecated 使用 resolvePlanArtifactKind === 'uplugin' */
export function isUpluginOnlyRequest(source: PlanArtifactSource): boolean {
  return isUpluginPlan(source)
}

export function canDeployPlanArtifact(kind: PlanArtifactKind): boolean {
  return kind === 'uskill' || kind === 'uplugin'
}

export function isPlanArtifactTypeResolved(source: PlanArtifactSource): boolean {
  return resolvePlanArtifactKind(source) !== 'undecided'
}

export function getPlanArtifactDeployStatus(source: PlanArtifactSource): PlanArtifactDeployStatus {
  const kind = resolvePlanArtifactKind(source)
  const perms = [
    ...(source.dispatchDraft?.permissions ?? []),
    ...(source.planSummary?.permissions
      ? source.planSummary.permissions.split(/[·,，、;；|│]/)
      : [])
  ].map((p) => p.trim()).filter(Boolean)

  if (kind === 'uskill') {
    const tierHint = perms.length ? formatTierSummaryForPermissions(perms) : '支持 dispatched 关键词或 autonomous 定时主动（T2 通知已实装）。'
    return {
      kind,
      canDeploy: true,
      label: 'uskill（Skill）',
      hint: `确认后将生成 manifest 与 skill.json，并部署到 data/openforu/uskills/。${tierHint}`,
      confirmButtonLabel: '确认方案，准备生成'
    }
  }

  if (kind === 'uplugin') {
    const tierHint = perms.length
      ? formatTierSummaryForPermissions(perms)
      : '默认 T1 注入；声明 system_notification / network_outbound 则为 T2（notify/fetch/tick 已实装）。'
    return {
      kind,
      canDeploy: true,
      label: 'uplugin（Plugin）',
      hint: `确认后将生成 manifest 与 plugin.meta.json，并部署到 data/openforu/uplugins/。${tierHint}`,
      confirmButtonLabel: '确认方案，准备生成'
    }
  }

  return {
    kind,
    canDeploy: false,
    label: '未确定',
    hint: '请与 Agent 明确选择 uskill（聊天触发能力）或 uplugin（系统/界面钩子），再确认方案。',
    confirmButtonLabel: '请先确认产物类型'
  }
}
