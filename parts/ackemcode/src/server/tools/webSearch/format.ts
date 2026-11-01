import type { WebSearchHit } from './types.js'

/** Current month/year for query guidance (CC getLocalMonthYear spirit). */
export function getLocalMonthYear(d = new Date()): string {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

/**
 * Format tool_result text — CC mapToolResultToToolResultBlockParam spirit:
 * header + optional snippets + Links JSON + mandatory Sources reminder.
 */
export function formatWebSearchToolResult(opts: {
  query: string
  hits: WebSearchHit[]
  provider: string
  durationSeconds: number
  note?: string
}): string {
  const { query, hits, provider, durationSeconds, note } = opts
  const links = hits.map((h) => ({ title: h.title, url: h.url }))
  const lines: string[] = [
    `Web search results for query: "${query}"`,
    `Provider: ${provider} · ${durationSeconds.toFixed(2)}s · ${hits.length} result(s)`,
    ''
  ]
  if (note) {
    lines.push(note, '')
  }
  if (hits.length === 0) {
    lines.push('No results. Try a different query or check domain filters / API key.')
  } else {
    for (const h of hits) {
      const snip = h.snippet?.trim()
      lines.push(`- [${h.title}](${h.url})`)
      if (snip) lines.push(`  ${snip.slice(0, 280)}`)
    }
    lines.push('')
    lines.push(`Links: ${JSON.stringify(links)}`)
  }
  lines.push('')
  lines.push(
    [
      'REMINDER: Answer the user NOW from these hits. Include a "Sources:" section',
      'listing relevant URLs as markdown hyperlinks: [Title](URL).',
      'Do not run another web_search unless this list is empty or clearly off-topic.',
      'Skip web_fetch unless the user asked to open a page or snippets cannot answer.'
    ].join(' ')
  )
  return lines.join('\n')
}

export function webSearchToolDescription(): string {
  const month = getLocalMonthYear()
  return [
    'Search the web for up-to-date information (docs, APIs, errors, current events).',
    'Returns titles + URLs + short snippets. After one successful search, answer immediately with Sources — do not stack extra searches or hoard more pages.',
    'Optional allowed_domains XOR blocked_domains to filter hosts.',
    `Use the current period (${month}) in queries when asking for recent docs.`,
    'Only web_fetch if the user wants a specific page read, or snippets are not enough.'
  ].join(' ')
}
