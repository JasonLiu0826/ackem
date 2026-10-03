/**
 * D-03+ — Ctrl+R search inside transcript viewer.
 */

export function findTranscriptMatches(lines: string[], query: string): number[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.toLowerCase().includes(q)) out.push(i)
  }
  return out
}

export function scrollToTranscriptLine(
  line: number,
  budget: number,
  currentScroll: number
): number {
  if (line < currentScroll) return line
  if (line >= currentScroll + budget) {
    return Math.max(0, line - Math.floor(budget / 2))
  }
  return currentScroll
}

export type TranscriptHighlight = {
  before: string
  match: string
  after: string
}

export function splitTranscriptHighlight(
  line: string,
  query: string
): TranscriptHighlight | null {
  const q = query.trim()
  if (!q) return null
  const idx = line.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return null
  return {
    before: line.slice(0, idx),
    match: line.slice(idx, idx + q.length),
    after: line.slice(idx + q.length)
  }
}
