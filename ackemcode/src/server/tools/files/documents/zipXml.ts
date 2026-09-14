import zlib from 'node:zlib'

type ZipEntry = { name: string; data: Buffer }

function u16(buf: Buffer, off: number): number {
  return buf.readUInt16LE(off)
}
function u32(buf: Buffer, off: number): number {
  return buf.readUInt32LE(off)
}

/** Read named files from a zip buffer (deflate / store). Office OOXML only. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

export function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/** Read every named file from a zip (deflate / store). */
export function unzipAll(buf: Buffer): Map<string, Buffer> {
  return unzipNamed(buf, () => true)
}

/** Rebuild an OOXML zip (deflate). Office accepts this. */
export function zipFromFiles(files: Map<string, Buffer>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name.replace(/\\/g, '/'), 'utf8')
    const crc = crc32(data)
    const compressed = zlib.deflateRawSync(data)
    const local = Buffer.alloc(30 + nameBuf.length + compressed.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    nameBuf.copy(local, 30)
    compressed.copy(local, 30 + nameBuf.length)
    locals.push(local)

    const central = Buffer.alloc(46 + nameBuf.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    nameBuf.copy(central, 46)
    centrals.push(central)
    offset += local.length
  }
  const cd = Buffer.concat(centrals)
  const cdOffset = offset
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.size, 8)
  eocd.writeUInt16LE(files.size, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(cdOffset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

export function unzipNamed(buf: Buffer, want: (name: string) => boolean): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  if (buf.length < 22 || buf.subarray(0, 2).toString('latin1') !== 'PK') {
    throw new Error('not a zip archive')
  }
  let eocd = -1
  const start = Math.max(0, buf.length - 65557)
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('zip end-of-central-directory not found')
  const count = u16(buf, eocd + 10)
  let cdOff = u32(buf, eocd + 16)
  for (let n = 0; n < count; n++) {
    if (cdOff + 46 > buf.length) break
    if (u32(buf, cdOff) !== 0x02014b50) break
    const method = u16(buf, cdOff + 10)
    const compSize = u32(buf, cdOff + 20)
    const nameLen = u16(buf, cdOff + 28)
    const extraLen = u16(buf, cdOff + 30)
    const commentLen = u16(buf, cdOff + 32)
    const localOff = u32(buf, cdOff + 42)
    const name = buf.subarray(cdOff + 46, cdOff + 46 + nameLen).toString('utf8')
    cdOff += 46 + nameLen + extraLen + commentLen
    if (!want(name)) continue
    const localNameLen = u16(buf, localOff + 26)
    const localExtra = u16(buf, localOff + 28)
    const dataStart = localOff + 30 + localNameLen + localExtra
    const compressed = buf.subarray(dataStart, dataStart + compSize)
    let data: Buffer
    if (method === 0) data = Buffer.from(compressed)
    else if (method === 8) data = zlib.inflateRawSync(compressed)
    else continue
    out.set(name, data)
  }
  return out
}

export function encodeXmlEntities(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

function tagTexts(xml: string, localName: string): string[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${localName}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${localName}>`, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const inner = m[1]!.replace(/<[^>]+>/g, '')
    const t = decodeXmlEntities(inner)
    if (t) out.push(t)
  }
  return out
}

export function docxXmlToText(xml: string): string {
  const paras = xml.split(/<\/(?:[\w.-]+:)?p\s*>/i)
  const lines: string[] = []
  for (const p of paras) {
    const runs = tagTexts(p, 't')
    const line = runs.join('')
    if (line.trim()) lines.push(line)
  }
  return lines.join('\n')
}

export function pptxXmlToText(xml: string): string {
  const paras = xml.split(/<\/(?:[\w.-]+:)?p\s*>/i)
  const lines: string[] = []
  for (const p of paras) {
    const runs = tagTexts(p, 't')
    const line = runs.join('')
    if (line.trim()) lines.push(line)
  }
  return lines.join('\n')
}

export function xlsxSharedStrings(xml: string): string[] {
  const items = xml.split(/<\/(?:[\w.-]+:)?si\s*>/i)
  return items.map((si) => tagTexts(si, 't').join('')).filter((s, i, a) => i < a.length - 1 || s)
}

export function xlsxSheetToRows(xml: string, shared: string[]): string[] {
  const rows: string[] = []
  const rowRe = /<(?:[\w.-]+:)?row\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?row>/g
  let rm: RegExpExecArray | null
  while ((rm = rowRe.exec(xml))) {
    const cells: string[] = []
    const cellRe =
      /<(?:[\w.-]+:)?c\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?c>/g
    let cm: RegExpExecArray | null
    while ((cm = cellRe.exec(rm[1]!))) {
      const attrs = cm[1]!
      const body = cm[2]!
      const t = /\bt="(\w+)"/.exec(attrs)?.[1]
      const v = tagTexts(body, 'v')[0] ?? tagTexts(body, 't').join('')
      if (t === 's') {
        const idx = Number(v)
        cells.push(shared[idx] ?? '')
      } else if (t === 'inlineStr') {
        cells.push(tagTexts(body, 't').join(''))
      } else {
        cells.push(v)
      }
    }
    const line = cells.join('\t').trimEnd()
    if (line.trim()) rows.push(line)
  }
  return rows
}
