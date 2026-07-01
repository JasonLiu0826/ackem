import type { WebContents } from 'electron'
import type { FactStore } from '../factStore'
import type { EpisodicStore } from '../episodicStore'
import type { PreLlmResult } from '../../engine/orchestrator'
import type { MemoryAuditIntent } from '../../../shared/memoryAuditIntent'
import { buildMemoryAuditIntro } from '../../../shared/memoryAuditIntent'
import type { MemoryAuditCardPayload } from '../../../shared/memoryAudit'
import { buildMemoryAuditReport } from './buildMemoryAuditReport'
import { formatMemoryAuditMarkdown, toMemoryAuditCardPayload } from './formatMemoryAuditMarkdown'

export function executeMemoryAuditTurn(args: {
  dataRoot: string
  factStore: FactStore
  episodicStore: EpisodicStore
  intent: MemoryAuditIntent
  pre: PreLlmResult
  webContents?: WebContents
}): { intro: string; cardPayload: MemoryAuditCardPayload; pre: PreLlmResult } {
  const report = buildMemoryAuditReport({
    dataRoot: args.dataRoot,
    factStore: args.factStore,
    episodicStore: args.episodicStore,
    mode: args.intent.mode,
    includeAvoid: args.intent.includeAvoid,
    page: args.intent.page,
  })

  const cardBody = formatMemoryAuditMarkdown(report)
  const cardPayload = toMemoryAuditCardPayload(report, cardBody)
  const intro = buildMemoryAuditIntro(report.mode, report.stats.factsListed, report.stats.totalActiveFacts)

  const pre: PreLlmResult = {
    ...args.pre,
    skipLlm: true,
    tierBBlock: '',
    trace: {
      ...args.pre.trace,
      l3: {
        ...args.pre.trace.l3,
        memoryAudit: {
          mode: report.mode,
          factsListed: report.stats.factsListed,
          factsHidden: report.stats.factsHidden,
          episodesListed: report.stats.episodesListed,
          timelineCount: report.stats.timelineCount,
          paginated: report.mode === 'full_dump',
          page: report.stats.page,
        },
      },
    },
  }

  args.webContents?.send('chat:memoryAudit', cardPayload)

  return { intro, cardPayload, pre }
}
