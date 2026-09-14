import fs from 'node:fs/promises'
import path from 'node:path'
import { cwdNote, resolveFileToolPath } from './pathUtils.js'
import type { ReadFileState } from './readFileState.js'
import type { FileToolResult } from './types.js'
import { guardSignal } from './signalCheck.js'
import { memoryFreshnessNote } from '../../memdir/memoryAge.js'
import { isPathInside } from '../../memdir/paths.js'
import {
  getToolResultsProjectRoot,
  isToolResultPersistPath
} from '../../agent/compact/toolResultStorage.js'
import {
  extractDocumentFile,
  isDocumentExtension
} from './documents/index.js'
import type { ModelMediaCaps } from '../../llm/capabilities.js'

/** 256 KiB — CC FileReadTool maxSizeBytes when limit omitted */
export const READ_MAX_BYTES = Math.floor(0.25 * 1024 * 1024)
/** Soft token-ish char gate (~25k tokens ≈ chars conservative) */
export const READ_MAX_CHARS = 100_000

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

const BINARY_EXT = new Set([
  '.ico',
  '.zip',
  '.gz',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.woff',
  '.woff2',
  '.ttf',
  '.mp3',
  '.mp4',
  '.wasm'
])

function formatNumberedSlice(
  raw: string,
  input: Record<string, unknown>,
  opts: {
    abs: string
    mtimeMs: number
    persisted: boolean
    memoryDir?: string | null
    readState?: ReadFileState
  }
): FileToolResult {
  const hasLimit = input.limit != null && input.limit !== ''
  const lines = raw.split(/\r?\n/)
  const totalLines = lines.length
  let offset = Number(input.offset ?? 1)
  if (!Number.isFinite(offset) || offset < 0) offset = 1
  if (offset === 0) offset = 1
  offset = Math.floor(offset)

  if (offset > totalLines) {
    return {
      ok: false,
      output: `<system-reminder>Warning: the file is shorter than the provided offset (${offset}). The file has ${totalLines} lines.</system-reminder>`
    }
  }

  const limit = hasLimit ? Math.max(1, Math.floor(Number(input.limit))) : totalLines
  const slice = lines.slice(offset - 1, offset - 1 + limit)
  const numbered = slice
    .map((l, i) => {
      const n = String(offset + i).padStart(6, ' ')
      return `${n}\t${l}`
    })
    .join('\n')

  const maxChars = opts.persisted ? 500_000 : READ_MAX_CHARS
  if (numbered.length > maxChars) {
    return {
      ok: false,
      output: `File content (${numbered.length} chars) exceeds maximum allowed output (${maxChars}). Use offset and limit parameters to read specific portions of the file.`
    }
  }

  const complete =
    offset === 1 && (!hasLimit || Number(input.limit) >= totalLines)
  opts.readState?.remember(opts.abs, opts.mtimeMs, complete)

  let output = numbered
  if (opts.persisted) {
    output = `[Persisted tool result — full file read]\n${output}`
  }
  if (opts.memoryDir && isPathInside(opts.abs, opts.memoryDir)) {
    const note = memoryFreshnessNote(opts.mtimeMs)
    if (note) output = note + output
  }
  return { ok: true, output }
}

const MAX_VISION_IMAGE_BYTES = 8 * 1024 * 1024

export async function readFileTool(
  cwd: string,
  input: Record<string, unknown>,
  readState?: ReadFileState,
  memoryDir?: string | null,
  signal?: AbortSignal,
  mediaCaps?: ModelMediaCaps,
  additionalWorkingDirectories?: readonly string[],
  planFilePath?: string | null
): Promise<FileToolResult> {
  const aborted = guardSignal(signal)
  if (aborted) return aborted
  const rel = String(input.path ?? input.file_path ?? '')
  let abs: string
  try {
    abs = resolveFileToolPath(cwd, rel, {
      additionalWorkingDirectories,
      memoryDir,
      toolResultsRoot: getToolResultsProjectRoot(cwd),
      planFilePath
    })
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }

  let st: Awaited<ReturnType<typeof fs.stat>>
  try {
    st = await fs.stat(abs)
  } catch {
    return {
      ok: false,
      output: `File does not exist. ${cwdNote(cwd)}`
    }
  }
  if (st.isDirectory()) {
    return { ok: false, output: `EISDIR: illegal operation on a directory: ${rel}` }
  }

  const ext = path.extname(abs).toLowerCase()
  const isPersistedToolResult = isToolResultPersistPath(abs, cwd)
  const sliceOpts = {
    abs,
    mtimeMs: st.mtimeMs,
    persisted: isPersistedToolResult,
    memoryDir,
    readState
  }

  if (isDocumentExtension(ext)) {
    const extracted = await extractDocumentFile(abs, input, mediaCaps)
    if (!extracted.ok) return extracted
    if (!extracted.output.trim()) {
      readState?.remember(abs, st.mtimeMs, true)
      return {
        ok: true,
        output:
          '<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>',
        media: extracted.media
      }
    }
    const sliced = formatNumberedSlice(extracted.output, input, sliceOpts)
    return { ...sliced, media: extracted.media }
  }

  if (IMAGE_EXT.has(ext)) {
    if (!mediaCaps?.vision) {
      return {
        ok: false,
        output: `Cannot read image file (${ext}) with a text-only model. Use a vision model (DeepSeek: deepseek-flash; also gpt-4o, gemini, qwen-vl, …), or set settings.multimodal to "vision" if this gateway accepts image_url.`
      }
    }
    if (st.size > MAX_VISION_IMAGE_BYTES) {
      return {
        ok: false,
        output: `Image is too large (${st.size} bytes) to attach (max ${MAX_VISION_IMAGE_BYTES}).`
      }
    }
    const buf = await fs.readFile(abs)
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.gif'
          ? 'image/gif'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg'
    readState?.remember(abs, st.mtimeMs, true)
    return {
      ok: true,
      output: `Image attached: ${rel} (${st.size} bytes, ${mime}). Look at the attached image; do not claim you cannot see it.`,
      media: [
        {
          kind: 'image',
          mime,
          base64: buf.toString('base64'),
          label: path.basename(abs)
        }
      ]
    }
  }

  if (BINARY_EXT.has(ext)) {
    return {
      ok: false,
      output: `Cannot read binary file (${ext}). Use a dedicated viewer or omit binary assets.`
    }
  }

  const hasLimit = input.limit != null && input.limit !== ''
  const maxBytes = isPersistedToolResult ? 2 * 1024 * 1024 : READ_MAX_BYTES
  if (!hasLimit && st.size > maxBytes) {
    return {
      ok: false,
      output: `File content (${st.size} bytes) exceeds maximum allowed size (${maxBytes} bytes). Use offset and limit parameters to read specific portions of the file.`
    }
  }

  let raw: string
  try {
    raw = await fs.readFile(abs, 'utf8')
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }

  if (raw.length === 0) {
    readState?.remember(abs, st.mtimeMs, true)
    let emptyOut =
      '<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>'
    if (memoryDir && isPathInside(abs, memoryDir)) {
      const note = memoryFreshnessNote(st.mtimeMs)
      if (note) emptyOut = note + emptyOut
    }
    return {
      ok: true,
      output: emptyOut
    }
  }

  return formatNumberedSlice(raw, input, sliceOpts)
}
