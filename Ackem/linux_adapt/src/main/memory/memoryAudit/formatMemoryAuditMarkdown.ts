import { formatConfidencePercent } from '../../../shared/confidence'
import type { MemoryAuditReport, MemoryAuditCardPayload } from '../../../shared/memoryAudit'
import { CURATED_AUDIT_MAX_CHARS } from './constants'

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export function formatMemoryAuditMarkdown(report: MemoryAuditReport): string {
  const parts: string[] = []
  const { stats, mode } = report
  const title =
    mode === 'stats_only'
      ? '记忆统计'
      : mode === 'self_report'
        ? '我对你的认识（精选）'
        : mode === 'full_dump'
          ? `记忆明细（第 ${stats.page ?? 1}/${stats.pageCount ?? 1} 页）`
          : '记忆精选审计'

  parts.push(`## ${title}`)
  parts.push(
    `生成于 ${formatGeneratedAt(report.generatedAt)} · 活跃事实 **${stats.totalActiveFacts}** 条 · 核心 **${stats.coreFacts}** 条`
  )

  if (mode === 'stats_only') {
    parts.push('')
    parts.push('| 域 | 条数 |')
    parts.push('| --- | ---: |')
    for (const d of report.domainStats) {
      parts.push(`| ${d.label} | ${d.total} |`)
    }
    if (stats.factsHidden > 0) {
      parts.push('')
      parts.push(`> 另有 ${stats.factsHidden} 条标记为「不想被主动提起」，未计入上表。`)
    }
    return parts.join('\n').slice(0, CURATED_AUDIT_MAX_CHARS)
  }

  if (report.domainStats.length > 0) {
    parts.push('')
    parts.push('### 域分布')
    parts.push('| 域 | 总量 | 本次列出 |')
    parts.push('| --- | ---: | ---: |')
    for (const d of report.domainStats) {
      parts.push(`| ${d.label} | ${d.total} | ${d.listed} |`)
    }
  }

  if (report.facts.length > 0) {
    parts.push('')
    parts.push('### 核心事实')
    parts.push('| # | 域 | 子类 | 主体 | 摘要 | 权重 | 置信度 | 核心 |')
    parts.push('| ---: | --- | --- | --- | --- | ---: | ---: | :---: |')
    report.facts.forEach((f, i) => {
      parts.push(
        `| ${i + 1} | ${f.domainLabel} | ${f.subcategoryLabel} | ${escapeCell(f.subject)} | ${escapeCell(f.summary)} | ${f.weight} | ${formatConfidencePercent(f.confidence)} | ${f.isCore ? '★' : ''} |`
      )
    })
  }

  if (report.timeline.length > 0) {
    parts.push('')
    parts.push('### 关键时间点')
    parts.push('| 时间 | 类型 | 内容 |')
    parts.push('| --- | --- | --- |')
    for (const t of report.timeline) {
      parts.push(`| ${escapeCell(t.dateLabel)} | ${t.typeLabel} | ${escapeCell(t.summary)} |`)
    }
  }

  if (report.episodes.length > 0) {
    parts.push('')
    parts.push('### 重要情节')
    parts.push('| 摘要 | 情绪 | 强度 |')
    parts.push('| --- | --- | ---: |')
    for (const e of report.episodes) {
      parts.push(
        `| ${escapeCell(e.summary)} | ${escapeCell(e.dominantEmotion)} | ${Math.round(e.emotionalIntensity * 100)}% |`
      )
    }
  }

  parts.push('')
  if (mode === 'full_dump' && stats.pageCount && (stats.page ?? 1) < stats.pageCount) {
    parts.push(`> 第 ${stats.page}/${stats.pageCount} 页。可说「记忆下一页」继续，或打开「记忆档案」查看完整 md。`)
  } else if (mode !== 'full_dump' && stats.totalActiveFacts > stats.factsListed) {
    parts.push(
      `> 从 ${stats.totalActiveFacts} 条中精选 ${stats.factsListed} 条。完整清单见「记忆档案 / 关联」；要说「每一条都列出来」可分页导出。`
    )
  }
  if (stats.factsHidden > 0) {
    parts.push(`> 已隐藏 ${stats.factsHidden} 条「不想被提起」的记忆。`)
  }
  parts.push('')
  parts.push('*以上内容直接读取 FactStore，非 AI 推断。*')

  return parts.join('\n').slice(0, mode === 'full_dump' ? 12000 : CURATED_AUDIT_MAX_CHARS)
}

export function toMemoryAuditCardPayload(
  report: MemoryAuditReport,
  cardBody: string
): MemoryAuditCardPayload {
  const titleByMode = {
    stats_only: '记忆统计',
    self_report: '我对你的认识',
    curated_audit: '记忆精选',
    full_dump: '记忆明细',
  } as const

  return {
    mode: report.mode,
    displayTitle: titleByMode[report.mode],
    cardBody,
    copyText: cardBody,
    stats: report.stats,
    domainStats: report.domainStats,
  }
}
