/**
 * Plan Assistant 正文后处理 — 剥离与快照矛盾的误导性话术
 */
import type { PlanSession } from './planSession'
import { finalizeDesignSpec } from './planDesignSpec'
import { stripPlanStructuredBlock } from './planStructured'
import type { AgentRunPhase } from './openforuAgentTypes'

export type PlanAssistantSanitizeInput = {
  session: PlanSession
  agentPhase?: AgentRunPhase | null
}

export type PlanAssistantSanitizeResult = {
  content: string
  corrections: string[]
}

const WIREFRAME_OK_LINE_RE = /[^\n]*界面\s*OK[^\n]*/gi

const DEPLOY_PENDING_RE =
  /(?:即将(?:开始)?(?:执行)?部署|将自动执行部署|部署管线将自动|确认后将自动执行部署)/gi

const GATE3_PENDING_RE = /(?:随后自动执行(?:部署与)?\s*Gate3|将自动跑\s*Gate3)/gi

export function sanitizePlanAssistantDisplay(
  rawContent: string,
  input: PlanAssistantSanitizeInput
): PlanAssistantSanitizeResult {
  const { session, agentPhase } = input
  const spec = session.designSpec ? finalizeDesignSpec(session.designSpec) : null
  let content = stripPlanStructuredBlock(rawContent)
  const corrections: string[] = []

  if (spec?.ui.wireframeApproved) {
    if (WIREFRAME_OK_LINE_RE.test(content)) {
      content = content.replace(WIREFRAME_OK_LINE_RE, '').trim()
      corrections.push('已移除过期界面确认指引（侧栏：界面已确认）')
    }
    WIREFRAME_OK_LINE_RE.lastIndex = 0
  }

  const deployed = Boolean(session.deployedUskillId?.trim())
  if (session.planConfirmed || deployed) {
    if (DEPLOY_PENDING_RE.test(content)) {
      content = content.replace(DEPLOY_PENDING_RE, '').trim()
      corrections.push('已移除「即将部署」话术（方案已确认或已部署）')
    }
    DEPLOY_PENDING_RE.lastIndex = 0
    if (GATE3_PENDING_RE.test(content)) {
      content = content.replace(GATE3_PENDING_RE, '').trim()
      corrections.push('已移除「将自动 Gate3」话术（交付由管线负责）')
    }
    GATE3_PENDING_RE.lastIndex = 0
  }

  if (agentPhase === 'done' || deployed) {
    content = content.replace(/部署进行中|正在部署（第\s*\d+\s*轮）/gi, '').trim()
  }

  content = content.replace(/\n{3,}/g, '\n\n').trim()

  if (corrections.length) {
    content = [
      content,
      '',
      '---',
      '_系统校正：以下以侧栏「设计规格 / 下一步」为准，勿信上文过期指引。_',
      ...corrections.map((c) => `- ${c}`)
    ]
      .filter(Boolean)
      .join('\n')
  }

  return { content, corrections }
}
