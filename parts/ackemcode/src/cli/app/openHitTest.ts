import { classifyOpenTarget, extractOpenTargets, type OpenTarget } from '../../shared/openExternal.js'
import type { MarkdownSpan } from './TerminalMarkdown.js'
import { stringDisplayWidth } from './textWidth.js'

function indexAtDisplayCol(text: string, col: number): number {
  let width = 0
  let index = 0
  for (const ch of [...text]) {
    const next = width + stringDisplayWidth(ch)
    if (col < next) return index
    width = next
    index += ch.length
  }
  return text.length
}

export function hitTestOpenTarget(
  text: string,
  col: number,
  spans?: MarkdownSpan[]
): OpenTarget | null {
  if (spans?.length) {
    let width = 0
    for (const span of spans) {
      const spanWidth = stringDisplayWidth(span.text)
      if (col >= width && col < width + Math.max(1, spanWidth)) {
        if (span.href) {
          const fromHref = classifyOpenTarget(span.href)
          if (fromHref) return fromHref
        }
      }
      width += spanWidth
    }
  }
  const index = indexAtDisplayCol(text || ' ', Math.max(0, col))
  for (const hit of extractOpenTargets(text || '')) {
    if (index >= hit.start && index < hit.end) return hit.target
  }
  return null
}
