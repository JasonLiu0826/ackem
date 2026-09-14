import type { ChatMessage } from '../../../shared/types.js'
import { flattenMessageContent } from '../../../shared/messageContent.js'

const PATH_RE =
  /(?:^|[\s"'`(=])((?:[A-Za-z]:)?(?:[./\\][\w.@+-]+)+|\w[\w./\\-]*\.(?:ts|tsx|js|jsx|py|md|json|css|html|vue|go|rs|java|kt))/g

/**
 * R3: canonical nine-section compact summary structure (CC services/compact/prompt.ts
 * spirit — own wording, not a copy). Both the extractive fallback and the LLM prompt
 * follow this outline so downstream checks (quality gate, reinjection) can rely on it.
 */
export const COMPACT_SUMMARY_SECTIONS = [
  'Task Intent',
  'Technical Approach',
  'Files and Key Sections',
  'Errors and Fixes',
  'All User Requests',
  'Current State',
  'Next Step',
  'Open Questions',
  'Constraints'
] as const

/**
 * Extractive summary without an LLM call — keeps goals, paths, pending cues.
 * Used as the default full-compact path (reliable for smoke / offline).
 * R3: emits the nine-section structure.
 */
export function buildExtractiveSummary(messages: ChatMessage[]): string {
  const userGoals: string[] = []
  const paths = new Set<string>()
  const toolNames: string[] = []
  let lastAssistant = ''
  let pendingHints: string[] = []
  const constraints: string[] = []

  for (const m of messages) {
    if (m.role === 'system') continue
    const body = flattenMessageContent(m.content)
    if (m.role === 'user' && body.trim()) {
      const t = body.trim()
      if (!t.startsWith('[Context compacted]') && !t.startsWith('This session is being continued')) {
        userGoals.push(t.length > 400 ? t.slice(0, 400) + '…' : t)
        // Heuristic constraint cues from user text
        if (/\b(don'?t|do not|must not|never|only|不要|禁止|必须|仅)\b/i.test(t)) {
          constraints.push(t.slice(0, 200))
        }
      }
      for (const match of t.matchAll(PATH_RE)) {
        if (match[1]) paths.add(match[1])
      }
    }
    if (m.role === 'assistant') {
      if (body.trim()) lastAssistant = body.trim().slice(0, 800)
      for (const tc of m.tool_calls ?? []) {
        toolNames.push(tc.function.name)
        for (const match of (tc.function.arguments || '').matchAll(PATH_RE)) {
          if (match[1]) paths.add(match[1])
        }
      }
    }
    if (m.role === 'tool' && body) {
      for (const match of body.matchAll(PATH_RE)) {
        if (match[1]) paths.add(match[1])
      }
      if (/error|fail|denied|blocked/i.test(body.slice(0, 200))) {
        pendingHints.push(
          `${m.name || 'tool'}: ${body.slice(0, 160).replace(/\s+/g, ' ')}…`
        )
      }
    }
  }

  const uniqueTools = [...new Set(toolNames)].slice(-20)
  const pathList = [...paths].slice(0, 40)
  const goals = userGoals.slice(-8)
  pendingHints = pendingHints.slice(-6)
  const uniqueConstraints = [...new Set(constraints)].slice(-4)

  return [
    '1. Task Intent:',
    goals.length
      ? `  - ${goals[goals.length - 1]}`
      : '  - (none captured)',
    '',
    '2. Technical Approach (tools used):',
    uniqueTools.length ? `  ${uniqueTools.join(', ')}` : '  - (none)',
    '',
    '3. Files and Key Sections (paths seen):',
    pathList.length ? pathList.map((p) => `  - ${p}`).join('\n') : '  - (none extracted)',
    '',
    '4. Errors and Fixes:',
    pendingHints.length ? pendingHints.map((h) => `  - ${h}`).join('\n') : '  - (none flagged)',
    '',
    '5. All User Requests:',
    goals.length ? goals.map((g, i) => `  - [${i + 1}] ${g}`).join('\n') : '  - (none captured)',
    '',
    '6. Current State:',
    lastAssistant
      ? `  Last assistant note:\n  ${lastAssistant}`
      : '  - Continue from the most recent user request above.',
    '',
    '7. Next Step:',
    '  - Re-read key files above if details were truncated; continue the user\'s latest explicit request.',
    '',
    '8. Open Questions:',
    pendingHints.length
      ? '  - Verify the flagged errors above are resolved.'
      : '  - (none)',
    '',
    '9. Constraints:',
    uniqueConstraints.length
      ? uniqueConstraints.map((c) => `  - ${c}`).join('\n')
      : '  - (none stated)'
  ].join('\n')
}

export function wrapCompactSummary(summary: string): string {
  return [
    '[Context compacted] This session was compacted to free context space.',
    'Earlier turns were summarized. Prefer this summary over truncated tool logs.',
    '',
    summary.trim()
  ].join('\n')
}

/**
 * R3 contract 2: quality gate for LLM-produced summaries. A usable summary must
 * carry a "next step" direction and a "files" inventory — the two fields whose
 * loss causes post-compact derailment. Missing either → caller degrades to
 * extractive and counts a failure.
 */
export function summaryPassesQualityCheck(summary: string): boolean {
  const s = summary.toLowerCase()
  const hasNextStep = /next step|next task|下一步|接下来/.test(s)
  const hasFiles = /files?|文件|路径|paths?/.test(s)
  return hasNextStep && hasFiles
}
