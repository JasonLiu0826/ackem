import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ocrImageFiles } from './ocr.js'
import {
  OCR_MAX_PAGES_PER_READ,
  PDF_DEFAULT_PAGE_CAP,
  PDF_MAX_PAGES_PER_READ,
  clampPageRange,
  type PageRange
} from './pageRange.js'

export type PdfPage = {
  n: number
  text: string
  chars: number
  imageOnly?: boolean
  images?: number
  ocr?: boolean
}

export type PdfExtract = {
  engine: string
  pageCount: number
  first: number
  last: number
  truncated: boolean
  pages: PdfPage[]
  note: string
}

type PyResult = {
  ok?: boolean
  error?: string
  engine?: string
  pageCount?: number
  pages?: PdfPage[]
  rendered?: Array<{ n: number; path: string; mime?: string }>
  renderError?: string
}

function pythonCandidates(): string[] {
  const out: string[] = []
  if (process.env.ACKEM_PYTHON?.trim()) out.push(process.env.ACKEM_PYTHON.trim())
  if (process.platform === 'win32') {
    out.push('python', 'py', 'python3')
  } else {
    out.push('python3', 'python')
  }
  return out
}

function scriptPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(here, 'extractPdf.py'),
    path.resolve(here, '../../../../../src/server/tools/files/documents/extractPdf.py')
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!
}

async function runPython(
  py: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number; stdout: string; stderr: string }> {
  const argv = py === 'py' ? ['-3', ...args] : args
  return new Promise((resolve) => {
    const child = spawn(py, argv, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1'
      }
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve({ code: 1, stdout, stderr: stderr + '\ntimeout' })
    }, timeoutMs)
    child.stdout?.on('data', (d) => {
      stdout += d.toString('utf8')
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString('utf8')
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({
        code: 1,
        stdout,
        stderr: e instanceof Error ? e.message : String(e)
      })
    })
  })
}

async function invokeExtractor(
  abs: string,
  extra: string[]
): Promise<PyResult> {
  const script = scriptPath()
  let lastErr = 'python not found'
  for (const py of pythonCandidates()) {
    const r = await runPython(py, [script, '--path', abs, ...extra], 90_000)
    const line = r.stdout.trim().split(/\r?\n/).filter(Boolean).pop() || ''
    if (!line) {
      lastErr = r.stderr.trim() || `python ${py} produced no JSON`
      continue
    }
    try {
      return JSON.parse(line) as PyResult
    } catch {
      lastErr = `invalid JSON from extractor: ${line.slice(0, 200)}`
    }
  }
  return { ok: false, error: lastErr }
}

export async function extractPdf(
  abs: string,
  range: PageRange | null,
  opts?: { skipOcr?: boolean }
): Promise<PdfExtract> {
  const firstPass = await invokeExtractor(abs, [])
  if (!firstPass.ok || !firstPass.pages?.length) {
    throw new Error(firstPass.error || 'PDF extract failed')
  }
  const pageCount = firstPass.pageCount || firstPass.pages.length
  const cap = range ? PDF_MAX_PAGES_PER_READ : PDF_DEFAULT_PAGE_CAP
  const { first, last, truncated } = clampPageRange(range, pageCount, cap)
  const window = firstPass.pages.filter((p) => p.n >= first && p.n <= last)
  const imageOnly = window.filter((p) => p.imageOnly).map((p) => p.n)
  const ocrNums = imageOnly.slice(0, OCR_MAX_PAGES_PER_READ)
  const notes: string[] = []
  notes.push(`PDF extract engine=${firstPass.engine} pages=${pageCount}`)
  if (truncated) {
    notes.push(
      `Showing pages ${first}-${last} of ${pageCount}. Pass pages="${last + 1}-${Math.min(pageCount, last + PDF_MAX_PAGES_PER_READ)}" to continue (max ${PDF_MAX_PAGES_PER_READ} per read).`
    )
  }
  if (imageOnly.length > ocrNums.length) {
    notes.push(
      `${imageOnly.length} page(s) look like scans; OCR limited to ${ocrNums.length} this turn.`
    )
  }

  if (ocrNums.length && !opts?.skipOcr) {
    const renderDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ackem-pdf-ocr-'))
    const second = await invokeExtractor(abs, [
      '--render-dir',
      renderDir,
      '--render-pages',
      ocrNums.join(',')
    ])
    const rendered = second.rendered ?? []
    if (second.renderError) notes.push(`render: ${second.renderError}`)
    if (rendered.length) {
      const ocr = await ocrImageFiles(rendered.map((x) => x.path))
      for (const item of ocr) {
        const n = rendered.find((r) => r.path === item.path)?.n
        const page = window.find((p) => p.n === n)
        if (!page) continue
        if ('text' in item && item.text.trim()) {
          page.text = item.text
          page.chars = item.text.trim().length
          page.ocr = true
          page.imageOnly = false
        } else if ('error' in item) {
          notes.push(`page ${n} OCR: ${item.error}`)
        }
      }
      await fs.rm(renderDir, { recursive: true, force: true }).catch(() => {})
    } else if (ocrNums.length) {
      notes.push(
        'Scan-like pages have no text layer. Install Tesseract (or tesseract.js) to OCR them.'
      )
    }
  }

  return {
    engine: firstPass.engine || 'python',
    pageCount,
    first,
    last,
    truncated,
    pages: window,
    note: notes.join('\n')
  }
}

export function formatPdfExtract(abs: string, extracted: PdfExtract): string {
  const header = [
    `# PDF ${path.basename(abs)}`,
    extracted.note,
    `Range: ${extracted.first}-${extracted.last} / ${extracted.pageCount}`
  ]
    .filter(Boolean)
    .join('\n')
  const body = extracted.pages
    .map((p) => {
      const tag = p.ocr ? ' [OCR]' : p.imageOnly ? ' [no text layer]' : ''
      const text = (p.text || '').trim() || '(empty)'
      return `----- page ${p.n}${tag} -----\n${text}`
    })
    .join('\n\n')
  return `${header}\n\n${body}`
}

export type RenderedPdfPage = {
  n: number
  mime: string
  base64: string
}

export async function renderPdfPageImages(
  abs: string,
  pageNums: number[]
): Promise<RenderedPdfPage[]> {
  if (!pageNums.length) return []
  const renderDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ackem-pdf-vis-'))
  try {
    const r = await invokeExtractor(abs, [
      '--render-dir',
      renderDir,
      '--render-pages',
      pageNums.join(',')
    ])
    const out: RenderedPdfPage[] = []
    for (const item of r.rendered ?? []) {
      const buf = await fs.readFile(item.path)
      const mime =
        (item as { mime?: string }).mime ||
        (item.path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')
      out.push({ n: item.n, mime, base64: buf.toString('base64') })
    }
    return out
  } finally {
    await fs.rm(renderDir, { recursive: true, force: true }).catch(() => {})
  }
}
