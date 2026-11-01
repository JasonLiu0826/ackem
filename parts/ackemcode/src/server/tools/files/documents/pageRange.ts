/** CC pdfUtils.parsePDFPageRange — "5" | "1-10" | "3-" ; 1-indexed. */

export type PageRange = { firstPage: number; lastPage: number }

export const PDF_MAX_PAGES_PER_READ = 20
export const PDF_DEFAULT_PAGE_CAP = 10
export const OCR_MAX_PAGES_PER_READ = 8

export function parsePDFPageRange(pages: string): PageRange | null {
  const trimmed = pages.trim()
  if (!trimmed) return null
  if (trimmed.endsWith('-')) {
    const first = parseInt(trimmed.slice(0, -1), 10)
    if (!Number.isFinite(first) || first < 1) return null
    return { firstPage: first, lastPage: Infinity }
  }
  const dash = trimmed.indexOf('-')
  if (dash === -1) {
    const page = parseInt(trimmed, 10)
    if (!Number.isFinite(page) || page < 1) return null
    return { firstPage: page, lastPage: page }
  }
  const first = parseInt(trimmed.slice(0, dash), 10)
  const last = parseInt(trimmed.slice(dash + 1), 10)
  if (
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    first < 1 ||
    last < 1 ||
    last < first
  ) {
    return null
  }
  return { firstPage: first, lastPage: last }
}

export function clampPageRange(
  range: PageRange | null,
  pageCount: number,
  cap: number
): { first: number; last: number; truncated: boolean } {
  const first = Math.max(1, range?.firstPage ?? 1)
  const rawLast =
    range?.lastPage === Infinity || range?.lastPage == null
      ? pageCount
      : range.lastPage
  const lastWanted = Math.min(pageCount, rawLast)
  const last = Math.min(lastWanted, first + cap - 1)
  return { first, last, truncated: last < lastWanted }
}

export function isDocumentExtension(ext: string): boolean {
  const e = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  return e === '.pdf' || e === '.docx' || e === '.pptx' || e === '.xlsx'
}
