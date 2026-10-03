/**
 * document_edit / document_convert — rewrite Office files without inventing OOXML in the model.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveFileToolPath } from '../pathUtils.js'
import { extractOffice } from './office.js'
import { comConvert, comEditOffice } from './officeCom.js'
import { minimalDocx, zipEditOffice, type ZipEditOp } from './officeMutate.js'
import type { FileToolPathOpts } from '../writeEdit.js'

const execFileAsync = promisify(execFile)

const EDIT_EXT = new Set(['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'])
const CONVERT_SRC = new Set(['.md', '.txt', '.html', '.htm', '.docx', '.doc'])

export type DocumentToolResult = { ok: boolean; output: string }

function pathOpts(cwd: string, rel: string, extra?: FileToolPathOpts): string {
  return resolveFileToolPath(cwd, rel, {
    additionalWorkingDirectories: extra?.additionalWorkingDirectories,
    memoryDir: extra?.memoryDir
  })
}

export async function documentEditTool(
  cwd: string,
  input: Record<string, unknown>,
  extra?: FileToolPathOpts
): Promise<DocumentToolResult> {
  const rel = String(input.path ?? '').trim()
  if (!rel) return { ok: false, output: 'path is required' }
  let abs: string
  try {
    abs = pathOpts(cwd, rel, extra)
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }
  const ext = path.extname(abs).toLowerCase()
  if (!EDIT_EXT.has(ext)) {
    return {
      ok: false,
      output: `document_edit supports .docx .doc .xlsx .xls .pptx .ppt — got ${ext || 'no ext'}`
    }
  }
  try {
    await fs.access(abs)
  } catch {
    return { ok: false, output: `Path not found: ${abs}` }
  }

  const destRel = String(input.to ?? '').trim()
  if (destRel) {
    let dest: string
    try {
      dest = pathOpts(cwd, destRel, extra)
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : String(e) }
    }
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.copyFile(abs, dest)
    abs = dest
  }

  const op = String(input.op ?? '').trim()
  let zipOp: ZipEditOp
  if (op === 'replace') {
    const find = String(input.find ?? '')
    if (!find) return { ok: false, output: 'find is required for replace' }
    zipOp = {
      op: 'replace',
      find,
      replace: String(input.replace ?? ''),
      all: input.all !== false
    }
  } else if (op === 'append') {
    const text = String(input.text ?? '')
    if (!text) return { ok: false, output: 'text is required for append' }
    zipOp = { op: 'append', text }
  } else if (op === 'rewrite') {
    const text = String(input.text ?? '')
    if (!text) return { ok: false, output: 'text is required for rewrite' }
    zipOp = { op: 'rewrite', text }
  } else if (op === 'set_cell') {
    const cell = String(input.cell ?? '').trim()
    if (!cell) return { ok: false, output: 'cell is required for set_cell (e.g. A1)' }
    zipOp = {
      op: 'set_cell',
      cell,
      value: String(input.value ?? input.text ?? ''),
      sheet: input.sheet != null ? String(input.sheet) : undefined
    }
  } else {
    return { ok: false, output: 'op must be replace | append | rewrite | set_cell' }
  }

  await extra?.trackFileEdit?.(abs)

  const errors: string[] = []
  const preferCom = ext === '.doc' || ext === '.xls'

  const tryZip = async () => {
    if (ext === '.doc' || ext === '.xls' || ext === '.ppt') {
      return { ok: false, message: 'legacy Office needs COM' }
    }
    return zipEditOffice(abs, zipOp)
  }
  const tryCom = () => comEditOffice(abs, zipOp)

  const order = preferCom ? [tryCom, tryZip] : [tryZip, tryCom]
  for (const run of order) {
    const result = await run()
    if (result.ok) {
      let preview = ''
      try {
        if (ext === '.docx' || ext === '.xlsx' || ext === '.pptx') {
          preview = (await extractOffice(abs)).text.replace(/\s+/g, ' ').slice(0, 240)
        }
      } catch {
        /* */
      }
      return {
        ok: true,
        output: `Edited ${abs}\nengine: ${result.message}${preview ? `\npreview: ${preview}` : ''}`
      }
    }
    errors.push(result.message)
  }
  return { ok: false, output: `document_edit failed:\n- ${errors.join('\n- ')}` }
}

async function which(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      process.platform === 'win32' ? 'where' : 'which',
      [cmd],
      { windowsHide: true, timeout: 8_000 }
    )
    const line = stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
    return line || null
  } catch {
    return null
  }
}

async function pandocConvert(
  src: string,
  dest: string,
  referenceDoc?: string
): Promise<boolean> {
  const bin = await which('pandoc')
  if (!bin) return false
  const args = [src, '-o', dest]
  if (referenceDoc) args.push('--reference-doc', referenceDoc)
  await execFileAsync(bin, args, { windowsHide: true, timeout: 60_000 })
  return true
}

function stripMd(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

export async function documentConvertTool(
  cwd: string,
  input: Record<string, unknown>,
  extra?: FileToolPathOpts
): Promise<DocumentToolResult> {
  const rel = String(input.path ?? '').trim()
  if (!rel) return { ok: false, output: 'path is required' }
  let src: string
  try {
    src = pathOpts(cwd, rel, extra)
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }
  const srcExt = path.extname(src).toLowerCase()
  if (!CONVERT_SRC.has(srcExt)) {
    return { ok: false, output: `document_convert source must be md/txt/html/docx — got ${srcExt}` }
  }
  try {
    await fs.access(src)
  } catch {
    return { ok: false, output: `Path not found: ${src}` }
  }

  const format = String(input.format ?? 'docx').toLowerCase()
  if (format !== 'docx' && format !== 'pdf') {
    return { ok: false, output: 'format must be docx or pdf' }
  }
  const destRel = String(input.to ?? '').trim()
  const destGuess = destRel
    ? destRel
    : src.replace(/\.[^.]+$/, '') + (format === 'pdf' ? '.pdf' : '.docx')
  let dest: string
  try {
    dest = pathOpts(cwd, destGuess, extra)
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }
  await fs.mkdir(path.dirname(dest), { recursive: true })

  let reference: string | undefined
  const tmpl = String(input.template ?? input.reference ?? '').trim()
  if (tmpl) {
    try {
      reference = pathOpts(cwd, tmpl, extra)
      await fs.access(reference)
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : `template not found: ${tmpl}` }
    }
  }

  const errors: string[] = []

  if (format === 'docx' && (srcExt === '.md' || srcExt === '.txt' || srcExt === '.html' || srcExt === '.htm')) {
    try {
      if (await pandocConvert(src, dest, reference)) {
        return { ok: true, output: `Converted ${src} → ${dest} (pandoc${reference ? '+reference-doc' : ''})` }
      }
    } catch (e) {
      errors.push(`pandoc: ${e instanceof Error ? e.message : e}`)
    }
    const com = await comConvert(src, dest, 'docx')
    if (com.ok) return { ok: true, output: `Converted ${src} → ${dest} (${com.message})` }
    errors.push(com.message)
    if (srcExt === '.md' || srcExt === '.txt') {
      const raw = await fs.readFile(src, 'utf8')
      await fs.writeFile(dest, minimalDocx(stripMd(raw)))
      return { ok: true, output: `Converted ${src} → ${dest} (minimal-docx fallback)` }
    }
  }

  if (format === 'pdf' || srcExt === '.docx' || srcExt === '.doc') {
    try {
      if (await pandocConvert(src, dest, reference)) {
        return { ok: true, output: `Converted ${src} → ${dest} (pandoc${reference ? '+reference-doc' : ''})` }
      }
    } catch (e) {
      errors.push(`pandoc: ${e instanceof Error ? e.message : e}`)
    }
    const com = await comConvert(src, dest, format)
    if (com.ok) return { ok: true, output: `Converted ${src} → ${dest} (${com.message})` }
    errors.push(com.message)
  }

  return { ok: false, output: `document_convert failed:\n- ${errors.join('\n- ')}` }
}
