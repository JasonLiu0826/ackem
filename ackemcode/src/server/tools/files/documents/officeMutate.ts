/**
 * In-process OOXML mutate (no Word/Python). Good for replace / append / simple cells.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  decodeXmlEntities,
  encodeXmlEntities,
  unzipAll,
  zipFromFiles
} from './zipXml.js'

export type ZipEditOp =
  | { op: 'replace'; find: string; replace: string; all?: boolean }
  | { op: 'append'; text: string }
  | { op: 'rewrite'; text: string }
  | { op: 'set_cell'; cell: string; value: string; sheet?: string }

export type ZipEditResult = { ok: boolean; message: string; count?: number }

function replacePlain(hay: string, find: string, repl: string, all: boolean): {
  text: string
  count: number
} {
  if (!find) return { text: hay, count: 0 }
  if (all) {
    if (!hay.includes(find)) return { text: hay, count: 0 }
    const count = hay.split(find).length - 1
    return { text: hay.split(find).join(repl), count }
  }
  const i = hay.indexOf(find)
  if (i < 0) return { text: hay, count: 0 }
  return { text: hay.slice(0, i) + repl + hay.slice(i + find.length), count: 1 }
}

function decodeRunText(inner: string): string {
  return decodeXmlEntities(inner.replace(/<[^>]+>/g, ''))
}

function findRanges(joined: string, find: string, all: boolean): { start: number; end: number }[] {
  if (!find) return []
  const out: { start: number; end: number }[] = []
  let from = 0
  while (from <= joined.length - find.length) {
    const i = joined.indexOf(find, from)
    if (i < 0) break
    out.push({ start: i, end: i + find.length })
    if (!all) break
    from = i + Math.max(find.length, 1)
  }
  return out
}

/**
 * Replace text inside a paragraph without collapsing sibling runs.
 * Mixed bold/color/underline in the same paragraph stay on their runs.
 */
export function replaceInOfficeXml(
  xml: string,
  find: string,
  repl: string,
  all: boolean
): { xml: string; count: number } {
  let total = 0
  const tTag = /<(?:[\w.-]+:)?t\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?t>/g
  const next = xml.replace(
    /<(?:[\w.-]+:)?p\b[\s\S]*?<\/(?:[\w.-]+:)?p>/g,
    (para) => {
      const runs: { full: string; attrs: string; text: string; index: number }[] = []
      para.replace(tTag, (full, attrs: string, inner: string) => {
        runs.push({
          full,
          attrs,
          text: decodeRunText(inner),
          index: runs.length
        })
        return full
      })
      if (!runs.length) return para
      const joined = runs.map((r) => r.text).join('')
      const ranges = findRanges(joined, find, all)
      if (!ranges.length) return para
      total += ranges.length

      const chars: { ch: string; run: number }[] = []
      for (const r of runs) {
        for (let i = 0; i < r.text.length; i++) {
          chars.push({ ch: r.text[i]!, run: r.index })
        }
      }
      for (const range of [...ranges].reverse()) {
        const owner = chars[range.start]?.run ?? 0
        const inserted: { ch: string; run: number }[] = []
        for (let k = 0; k < repl.length; k++) inserted.push({ ch: repl[k]!, run: owner })
        chars.splice(range.start, range.end - range.start, ...inserted)
      }
      const runTexts = runs.map(() => '')
      for (const c of chars) runTexts[c.run] += c.ch

      let i = 0
      return para.replace(tTag, (full, attrs: string) => {
        const text = runTexts[i++] ?? ''
        const space = text.length !== text.trim().length ? ' xml:space="preserve"' : ''
        const cleanAttrs = String(attrs).replace(/\s*xml:space="preserve"/, '')
        const open = /^<([^\s>/]+)/.exec(full)?.[1] ?? 'w:t'
        return `<${open}${cleanAttrs}${space}>${encodeXmlEntities(text)}</${open}>`
      })
    }
  )
  return { xml: next, count: total }
}

/** Replace inside `<t>` / `<w:t>` runs (xlsx shared strings have no `<p>`). */
export function replaceInTTags(
  xml: string,
  find: string,
  repl: string,
  all: boolean
): { xml: string; count: number } {
  let total = 0
  const next = xml.replace(
    /<(?:[\w.-]+:)?t\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?t>/g,
    (full, attrs: string, inner: string) => {
      const decoded = decodeXmlEntities(inner.replace(/<[^>]+>/g, ''))
      const { text, count } = replacePlain(decoded, find, repl, all)
      if (!count) return full
      total += count
      const space = text !== text.trim() ? ' xml:space="preserve"' : ''
      const cleanAttrs = String(attrs).replace(/\s*xml:space="preserve"/, '')
      const open = full.startsWith('<w:t') ? 'w:t' : full.startsWith('<a:t') ? 'a:t' : 't'
      return `<${open}${cleanAttrs}${space}>${encodeXmlEntities(text)}</${open}>`
    }
  )
  return { xml: next, count: total }
}

function wordParagraphs(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  return lines
    .map((line) => {
      const t = encodeXmlEntities(line)
      const space = line !== line.trim() ? ' xml:space="preserve"' : ''
      return `<w:p><w:r><w:t${space}>${t}</w:t></w:r></w:p>`
    })
    .join('')
}

export function appendWordXml(xml: string, text: string): string {
  const block = wordParagraphs(text)
  if (/<w:sectPr[\s\S]*<\/w:sectPr>/.test(xml)) {
    return xml.replace(/<w:sectPr[\s\S]*<\/w:sectPr>/, `${block}$&`)
  }
  return xml.replace(/<\/w:body>/, `${block}</w:body>`)
}

export function rewriteWordXml(xml: string, text: string): string {
  const block = wordParagraphs(text)
  if (/<w:body[\s\S]*<\/w:body>/.test(xml)) {
    return xml.replace(
      /<w:body[\s\S]*<\/w:body>/,
      (body) => {
        const sect = body.match(/<w:sectPr[\s\S]*<\/w:sectPr>/)?.[0] ?? ''
        return `<w:body>${block}${sect}</w:body>`
      }
    )
  }
  return xml
}

function parseCell(ref: string): { col: string; row: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim())
  if (!m) return null
  return { col: m[1]!.toUpperCase(), row: Number(m[2]) }
}

function setXlsxCell(sheetXml: string, cell: string, value: string): string {
  const parsed = parseCell(cell)
  if (!parsed) throw new Error(`Invalid cell ${cell}`)
  const ref = `${parsed.col}${parsed.row}`
  const encoded = encodeXmlEntities(value)
  const inline = `<c r="${ref}" t="inlineStr"><is><t>${encoded}</t></is></c>`
  const cellRe = new RegExp(
    `<(?:[\\w.-]+:)?c\\b[^>]*\\br="${ref}"[^>]*(?:/>|>[\\s\\S]*?</(?:[\\w.-]+:)?c>)`
  )
  if (cellRe.test(sheetXml)) {
    return sheetXml.replace(cellRe, inline)
  }
  const rowRe = new RegExp(
    `<(?:[\\w.-]+:)?row\\b[^>]*\\br="${parsed.row}"[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?row>`
  )
  if (rowRe.test(sheetXml)) {
    return sheetXml.replace(rowRe, (row) => row.replace(/<\/(?:[\w.-]+:)?row>/, `${inline}</w:row>`))
  }
  const rowXml = `<row r="${parsed.row}">${inline}</row>`
  if (/<\/sheetData>/.test(sheetXml)) {
    return sheetXml.replace(/<\/sheetData>/, `${rowXml}</sheetData>`)
  }
  throw new Error('xlsx sheetData not found')
}

export async function zipEditOffice(
  abs: string,
  op: ZipEditOp
): Promise<ZipEditResult> {
  const ext = path.extname(abs).toLowerCase()
  const buf = await fs.readFile(abs)
  const files = unzipAll(buf)
  if (!files.size) return { ok: false, message: 'not a zip/Office file' }

  let count = 0
  const touch = (name: string, next: string) => {
    files.set(name, Buffer.from(next, 'utf8'))
  }

  if (ext === '.docx') {
    const keys = [...files.keys()].filter(
      (n) =>
        n === 'word/document.xml' ||
        n.startsWith('word/header') ||
        n.startsWith('word/footer')
    )
    if (!keys.includes('word/document.xml')) {
      return { ok: false, message: 'word/document.xml missing' }
    }
    if (op.op === 'replace') {
      for (const key of keys) {
        const out = replaceInOfficeXml(
          files.get(key)!.toString('utf8'),
          op.find,
          op.replace,
          op.all !== false
        )
        count += out.count
        touch(key, out.xml)
      }
    } else if (op.op === 'append') {
      const key = 'word/document.xml'
      touch(key, appendWordXml(files.get(key)!.toString('utf8'), op.text))
      count = 1
    } else if (op.op === 'rewrite') {
      const key = 'word/document.xml'
      touch(key, rewriteWordXml(files.get(key)!.toString('utf8'), op.text))
      count = 1
    } else {
      return { ok: false, message: 'set_cell is for xlsx' }
    }
  } else if (ext === '.pptx') {
    const slides = [...files.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    if (op.op === 'set_cell') return { ok: false, message: 'set_cell is for xlsx' }
    if (op.op === 'rewrite' || op.op === 'append') {
      const first = slides.sort()[0]
      if (!first) return { ok: false, message: 'no slides' }
      const xml = files.get(first)!.toString('utf8')
      if (op.op === 'append') {
        const extra = encodeXmlEntities(op.text)
        touch(
          first,
          xml.replace(
            /<\/(?:[\w.-]+:)?spTree>/,
            `<p:sp><p:txBody><a:p><a:r><a:t>${extra}</a:t></a:r></a:p></p:txBody></p:sp>$&`
          )
        )
        count = 1
      } else {
        touch(
          first,
          xml.replace(
            /<(?:[\w.-]+:)?t\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?t>/,
            `<a:t>${encodeXmlEntities(op.text)}</a:t>`
          )
        )
        count = 1
      }
    } else {
      for (const name of slides) {
        const out = replaceInOfficeXml(
          files.get(name)!.toString('utf8'),
          op.find,
          op.replace,
          op.all !== false
        )
        count += out.count
        touch(name, out.xml)
      }
    }
  } else if (ext === '.xlsx') {
    if (op.op === 'set_cell') {
      const sheetName = [...files.keys()]
        .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
        .sort()[0]
      if (!sheetName) return { ok: false, message: 'no worksheet' }
      touch(
        sheetName,
        setXlsxCell(files.get(sheetName)!.toString('utf8'), op.cell, op.value)
      )
      count = 1
    } else if (op.op === 'replace') {
      for (const [name, data] of files) {
        if (!name.endsWith('.xml')) continue
        const raw = data.toString('utf8')
        const viaT = replaceInTTags(raw, op.find, op.replace, op.all !== false)
        const viaP = replaceInOfficeXml(viaT.xml, op.find, op.replace, op.all !== false)
        const nextCount = viaT.count + viaP.count
        if (nextCount) {
          count += nextCount
          touch(name, viaP.xml)
        }
      }
    } else {
      return { ok: false, message: `xlsx does not support ${op.op} via zip-xml` }
    }
  } else {
    return { ok: false, message: `zip-xml cannot edit ${ext}` }
  }

  if (op.op === 'replace' && count === 0) {
    return { ok: false, message: `Text not found: ${'find' in op ? op.find : ''}` }
  }
  await fs.writeFile(abs, zipFromFiles(files))
  return { ok: true, message: `zip-xml ${op.op} count=${count}`, count }
}

export function minimalDocx(text: string): Buffer {
  const body = wordParagraphs(text)
  const files = new Map<string, Buffer>()
  files.set(
    '[Content_Types].xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
      'utf8'
    )
  )
  files.set(
    '_rels/.rels',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
      'utf8'
    )
  )
  files.set(
    'word/_rels/document.xml.rels',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`,
      'utf8'
    )
  )
  files.set(
    'word/document.xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body>
</w:document>`,
      'utf8'
    )
  )
  return zipFromFiles(files)
}
