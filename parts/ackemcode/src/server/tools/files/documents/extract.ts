import fs from 'node:fs/promises'
import path from 'node:path'
import type { ModelMediaCaps } from '../../../llm/capabilities.js'
import type { ToolMediaPart } from '../types.js'
import { extractOffice } from './office.js'
import {
  PDF_DEFAULT_PAGE_CAP,
  parsePDFPageRange
} from './pageRange.js'
import {
  extractPdf,
  formatPdfExtract,
  renderPdfPageImages
} from './pdfExtract.js'

export { isDocumentExtension, parsePDFPageRange } from './pageRange.js'
export {
  PDF_DEFAULT_PAGE_CAP,
  PDF_MAX_PAGES_PER_READ
} from './pageRange.js'

/** CC ~20MB raw PDF cap spirit; stay under typical 32MB request after base64. */
const NATIVE_PDF_MAX_BYTES = 15 * 1024 * 1024

export type DocumentExtractResult = {
  ok: boolean
  output: string
  media?: ToolMediaPart[]
}

export async function extractDocumentFile(
  abs: string,
  input: Record<string, unknown>,
  caps?: ModelMediaCaps
): Promise<DocumentExtractResult> {
  const ext = path.extname(abs).toLowerCase()
  try {
    if (ext === '.pdf') {
      return await extractPdfForModel(abs, input, caps)
    }

    if (ext === '.docx' || ext === '.pptx' || ext === '.xlsx') {
      const office = await extractOffice(abs)
      const header = `# ${office.kind.toUpperCase()} ${path.basename(abs)} (engine=${office.engine})`
      return { ok: true, output: `${header}\n\n${office.text}` }
    }

    return { ok: false, output: `Unsupported document type ${ext}` }
  } catch (e) {
    return {
      ok: false,
      output: `Failed to extract ${path.basename(abs)}: ${e instanceof Error ? e.message : String(e)}`
    }
  }
}

async function extractPdfForModel(
  abs: string,
  input: Record<string, unknown>,
  caps?: ModelMediaCaps
): Promise<DocumentExtractResult> {
  const pagesRaw = input.pages != null ? String(input.pages).trim() : ''
  const range = pagesRaw ? parsePDFPageRange(pagesRaw) : null
  if (pagesRaw && !range) {
    return {
      ok: false,
      output: `Invalid pages parameter: "${pagesRaw}". Use formats like "1-5", "3", or "10-20". Pages are 1-indexed.`
    }
  }

  const vision = Boolean(caps?.vision)
  const extracted = await extractPdf(abs, range, { skipOcr: vision })
  let output = formatPdfExtract(abs, extracted)
  const media: ToolMediaPart[] = []

  const st = await fs.stat(abs)
  const wantPages = Boolean(pagesRaw)
  const smallEnough =
    extracted.pageCount <= PDF_DEFAULT_PAGE_CAP && st.size <= NATIVE_PDF_MAX_BYTES

  if (caps?.nativePdf && !wantPages && smallEnough) {
    const buf = await fs.readFile(abs)
    if (buf.subarray(0, 5).toString('latin1') === '%PDF-') {
      media.push({
        kind: 'pdf',
        mime: 'application/pdf',
        base64: buf.toString('base64'),
        label: path.basename(abs)
      })
      output +=
        '\n\n[Attached native PDF document for this multimodal model.]'
    }
  } else if (vision) {
    const nums = extracted.pages.map((p) => p.n)
    const pages = await renderPdfPageImages(abs, nums)
    for (const p of pages) {
      media.push({
        kind: 'image',
        mime: p.mime,
        base64: p.base64,
        label: `${path.basename(abs)} p.${p.n}`
      })
    }
    if (pages.length) {
      output += `\n\n[Attached ${pages.length} page image(s) for this vision model.]`
    } else {
      output +=
        '\n\n[Vision model is on, but page images could not be rendered (need Python+pymupdf). Text extract is above.]'
    }
  }

  return { ok: true, output, media: media.length ? media : undefined }
}
