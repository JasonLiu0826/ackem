/**
 * D-03 — plain-text transcript from Ink history (Ctrl+O viewer).
 */
import type { HistoryItem } from './historyTypes.js'
import { l } from './language.js'

export function historyToTranscript(items: HistoryItem[]): string[] {
  const lines: string[] = []
  for (const it of items) {
    if (it.kind === 'you') {
      lines.push('', `❯ ${it.text}`)
      continue
    }
    if (it.kind === 'assistant') {
      for (const ln of it.text.split('\n')) lines.push(`  ${ln}`)
      continue
    }
    if (it.kind === 'status') {
      lines.push(`— ${it.text}`)
      continue
    }
    if (it.kind === 'tool') {
      const te = it.tool
      lines.push(`  ● ${te.name}${te.summary ? `  ${te.summary}` : ''} [${te.state}]`)
      continue
    }
    if (it.kind === 'tool_group') {
      lines.push(`  ● ${it.label}`)
      continue
    }
    if (it.kind === 'thought') {
      const sec = Math.max(
        1,
        Math.round(((it.thought.endedAt ?? Date.now()) - it.thought.startedAt) / 1000)
      )
      lines.push(`  ∴ ${l('思考', 'Thought')} ${sec}s`)
      if (it.thought.thinking.trim()) {
        for (const ln of it.thought.thinking.split('\n').slice(0, 12)) {
          lines.push(`    ${ln}`)
        }
      }
    }
  }
  return lines.length ? lines : [l('（记录为空）', '(empty transcript)')]
}
