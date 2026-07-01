import type { WebContents } from 'electron'
import type { AppSettings } from '../../settings'
import { isDesktopAgentToolingActive } from '../../../shared/desktopAgent'
import type { DesktopAgentCapabilityMatch } from '../../../shared/desktopAgentCapabilities'
import type { InvestigationIntent, InvestigationReport } from '../../../shared/investigation'
import { detectInvestigationIntent } from './intentRouter'
import { runInvestigation } from './runInvestigation'
import { synthesizeInvestigationReply } from './synthesize'
import { clearInvestigationProgress } from './investigationProgress'
import { finalizeTurnAfterStream } from '../../postChatTurn'
import { notifyUiChatBubble } from '../../uiWindow'
import { finalizePaperCardCompanionReply } from '../../paperCard/finalizeCompanionReply'
import { resolveChatCompletionsUrl } from '../../llmEndpoint'
import { createLogger } from '../../logger'
import { synthesizeCapabilityHelpReply } from '../routing/capabilityHelpReply'
import { getCachedEmbeddingProvider } from '../../engineCache'
import { resolveDesktopAgentCapability } from '../routing/resolveCapability'

const log = createLogger('desktop-agent.turn')

export type InvestigationChatTurnContext = {
  webContents: WebContents
  settings: AppSettings
  dataRoot: string
  body: Record<string, unknown>
  userMsg: string
  turnId?: string
  signal: AbortSignal
}

function readCapabilityMatch(body: Record<string, unknown>): DesktopAgentCapabilityMatch | null {
  const raw = body.desktopAgentCapability
  if (!raw || typeof raw !== 'object') return null
  const m = raw as DesktopAgentCapabilityMatch
  if (!m.capabilityId || !m.handler) return null
  return m
}

function capabilityToInvestigation(
  match: DesktopAgentCapabilityMatch,
  userQuery: string
): InvestigationIntent | null {
  if (match.handler === 'investigate_games') {
    return {
      intentId: 'filesystem_inventory',
      templateId: 'games',
      userQuery
    }
  }
  if (match.handler === 'investigate_documents') {
    return {
      intentId: 'filesystem_inventory',
      templateId: 'documents',
      userQuery
    }
  }
  return null
}

async function resolveMatch(
  ctx: InvestigationChatTurnContext
): Promise<DesktopAgentCapabilityMatch | null> {
  const fromBuild = readCapabilityMatch(ctx.body)
  if (fromBuild) return fromBuild

  const queryEmbed = Array.isArray(ctx.body.queryEmbed)
    ? (ctx.body.queryEmbed as number[])
    : undefined
  const provider = getCachedEmbeddingProvider(ctx.dataRoot)
  return resolveDesktopAgentCapability({
    dataRoot: ctx.dataRoot,
    userText: ctx.userMsg,
    queryEmbed,
    settings: ctx.settings,
    provider
  })
}

/** 电脑助手模式早退：调查 / 能力说明；true 表示已 chat:done */
export async function tryHandleInvestigationChatTurn(
  ctx: InvestigationChatTurnContext
): Promise<boolean> {
  const desktopAgentChatMode = ctx.body.desktopAgentChatMode === true
  const agentActive = isDesktopAgentToolingActive(ctx.settings, desktopAgentChatMode)
  if (!agentActive) return false

  const match = await resolveMatch(ctx)
  if (!match) {
    const legacy = detectInvestigationIntent(ctx.userMsg)
    if (!legacy) return false
    log.info('investigation.start', {
      template: legacy.templateId,
      intent: legacy.intentId,
      route: 'legacy_regex'
    })
    return deliverInvestigation(ctx, legacy)
  }

  log.info('desktop-agent.route', {
    capabilityId: match.capabilityId,
    handler: match.handler,
    score: match.score,
    source: match.source
  })

  if (match.handler === 'capability_help') {
    ctx.webContents.send('chat:status', '正在整理电脑助手能力说明…')
    const reply = await synthesizeCapabilityHelpReply(ctx.settings, ctx.userMsg, ctx.signal)
    const assistantAcc = finalizePaperCardCompanionReply(reply)
    ctx.webContents.send('chat:replace', assistantAcc)
    ctx.webContents.send('chat:done', {
      memoryWrites: ['DESKTOP_AGENT capability_help'],
      assistantText: assistantAcc,
      turnId: ctx.turnId
    })
    notifyUiChatBubble({ text: assistantAcc, role: 'assistant' })
    void finalizeTurnAfterStream({
      turnId: ctx.turnId,
      dataRoot: ctx.dataRoot,
      assistantText: assistantAcc,
      settings: ctx.settings
    })
    return true
  }

  const invIntent = capabilityToInvestigation(match, ctx.userMsg)
  if (!invIntent) return false

  return deliverInvestigation(ctx, invIntent, match.capabilityId)
}

async function deliverInvestigation(
  ctx: InvestigationChatTurnContext,
  invIntent: InvestigationIntent,
  capabilityId?: string
): Promise<boolean> {
  log.info('investigation.start', {
    template: invIntent.templateId,
    intent: invIntent.intentId,
    capabilityId
  })
  ctx.webContents.send('chat:status', '电脑助手查找中…')

  const report = await runInvestigation(invIntent, {
    webContents: ctx.webContents,
    dataRoot: ctx.dataRoot
  })
  if (!report) return false

  ctx.webContents.send('chat:status', '正在整理查找结果…')
  const url = resolveChatCompletionsUrl(ctx.settings)
  const synthesized = await synthesizeInvestigationReply(
    ctx.settings,
    url,
    ctx.userMsg,
    report,
    ctx.signal
  )
  clearInvestigationProgress(ctx.webContents)

  const assistantAcc = finalizePaperCardCompanionReply(synthesized)
  ctx.webContents.send('chat:replace', assistantAcc)
  ctx.webContents.send('chat:done', {
    memoryWrites: [memoryWriteFromReport(report)],
    assistantText: assistantAcc,
    turnId: ctx.turnId
  })
  notifyUiChatBubble({ text: assistantAcc, role: 'assistant' })
  void finalizeTurnAfterStream({
    turnId: ctx.turnId,
    dataRoot: ctx.dataRoot,
    assistantText: assistantAcc,
    settings: ctx.settings
  })
  log.info('investigation.delivered', {
    template: report.template,
    total: report.stats.total,
    capabilityId,
    assistantMessagesEmitted: 1
  })
  return true
}

function memoryWriteFromReport(report: InvestigationReport): string {
  if (report.template === 'games') {
    return `INVESTIGATION games：共 ${report.stats.total} 款游戏`
  }
  return `INVESTIGATION documents：共 ${report.stats.total} 个文件`
}
