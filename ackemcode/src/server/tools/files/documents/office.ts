import fs from 'node:fs/promises'
import path from 'node:path'
import {
  docxXmlToText,
  pptxXmlToText,
  unzipNamed,
  xlsxSharedStrings,
  xlsxSheetToRows
} from './zipXml.js'

export type OfficeExtract = {
  kind: 'docx' | 'pptx' | 'xlsx'
  engine: string
  text: string
  note?: string
}

export async function extractOffice(abs: string): Promise<OfficeExtract> {
  const ext = path.extname(abs).toLowerCase()
  const buf = await fs.readFile(abs)
  if (ext === '.docx') return extractDocx(buf)
  if (ext === '.pptx') return extractPptx(buf)
  if (ext === '.xlsx') return extractXlsx(buf)
  throw new Error(`unsupported office type ${ext}`)
}

function extractDocx(buf: Buffer): OfficeExtract {
  const files = unzipNamed(
    buf,
    (n) => n === 'word/document.xml' || n.startsWith('word/header') || n.startsWith('word/footer')
  )
  const parts: string[] = []
  const doc = files.get('word/document.xml')
  if (doc) parts.push(docxXmlToText(doc.toString('utf8')))
  for (const [name, data] of files) {
    if (name === 'word/document.xml') continue
    const t = docxXmlToText(data.toString('utf8'))
    if (t.trim()) parts.push(t)
  }
  const text = parts.filter((p) => p.trim()).join('\n')
  if (!text.trim()) {
    throw new Error('docx contained no extractable text')
  }
  return { kind: 'docx', engine: 'zip-xml', text }
}

function extractPptx(buf: Buffer): OfficeExtract {
  const files = unzipNamed(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  const names = [...files.keys()].sort((a, b) => {
    const na = Number(/slide(\d+)\.xml$/.exec(a)?.[1] || 0)
    const nb = Number(/slide(\d+)\.xml$/.exec(b)?.[1] || 0)
    return na - nb
  })
  const slides = names.map((name, i) => {
    const body = pptxXmlToText(files.get(name)!.toString('utf8'))
    return `--- slide ${i + 1} ---\n${body}`
  })
  const text = slides.join('\n\n')
  if (!text.trim()) throw new Error('pptx contained no extractable text')
  return { kind: 'pptx', engine: 'zip-xml', text }
}

function extractXlsx(buf: Buffer): OfficeExtract {
  const files = unzipNamed(
    buf,
    (n) =>
      n === 'xl/sharedStrings.xml' ||
      n === 'xl/workbook.xml' ||
      /^xl\/worksheets\/sheet\d+\.xml$/.test(n)
  )
  const shared = files.has('xl/sharedStrings.xml')
    ? xlsxSharedStrings(files.get('xl/sharedStrings.xml')!.toString('utf8'))
    : []
  const sheets = [...files.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(/sheet(\d+)\.xml$/.exec(a)?.[1] || 0)
      const nb = Number(/sheet(\d+)\.xml$/.exec(b)?.[1] || 0)
      return na - nb
    })
  const parts = sheets.map((name, i) => {
    const rows = xlsxSheetToRows(files.get(name)!.toString('utf8'), shared)
    return `--- sheet ${i + 1} ---\n${rows.join('\n')}`
  })
  const text = parts.join('\n\n')
  if (!text.trim()) throw new Error('xlsx contained no extractable text')
  return { kind: 'xlsx', engine: 'zip-xml', text }
}
