import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import type { FileToolResult } from './types.js'
import { GREP_IGNORE, GREP_TYPE_SUFFIXES, clampToolHint } from './grepConstants.js'
import type { ParsedGrepInput } from './grepTypes.js'
import { grepNodeScan } from './grepNode.js'

const execFileAsync = promisify(execFile)

export const RG_INSTALL_HINT =
  'Tip: install ripgrep (rg) on PATH for faster full-repo search — Windows: scoop install ripgrep or choco install ripgrep. Override binary with ACKEM_RG.'

export async function resolveRipgrepBin(): Promise<string | null> {
  const fromEnv = process.env.ACKEM_RG?.trim()
  if (fromEnv) return fromEnv
  return 'rg'
}

function rgGlobArgs(userGlob?: string): string[] {
  const args: string[] = []
  for (const ig of GREP_IGNORE) {
    args.push('--glob', `!${ig}`)
  }
  if (userGlob?.trim()) args.push('--glob', userGlob)
  return args
}

function appendNoMatchGlobHint(out: string, userGlob?: string): string {
  if (!userGlob?.trim()) return out
  return clampToolHint(
    `${out}\nNo matches in glob ${userGlob}; omit glob to search the whole project.`
  )
}

async function runRgOnce(
  bin: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; code: number; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true
    })
    return { stdout: stdout ?? '', code: 0, stderr: stderr ?? '' }
  } catch (e: unknown) {
    const err = e as { code?: number; stdout?: string; stderr?: string }
    return {
      stdout: err.stdout ?? '',
      code: typeof err.code === 'number' ? err.code : 2,
      stderr: err.stderr ?? String(e)
    }
  }
}

function paginateLines(lines: string[], offset: number, headLimit: number): string {
  const page = lines.slice(offset, offset + headLimit)
  let out = page.join('\n')
  if (offset > 0 || page.length < lines.length) {
    out += `\n[Showing results with pagination = limit: ${headLimit}, offset: ${offset}]`
  }
  return out
}

export async function grepWithRipgrep(
  parsed: ParsedGrepInput,
  bin: string,
  signal?: AbortSignal
): Promise<FileToolResult | { fallback: true; reason: string }> {
  void signal
  const {
    searchCwd,
    pattern,
    userGlob,
    caseInsensitive,
    mode,
    headLimit,
    offset,
    contextBefore,
    contextAfter,
    type,
    multiline
  } = parsed

  if (type && !GREP_TYPE_SUFFIXES[type.toLowerCase()]) {
    return {
      ok: false,
      output: `Unknown type "${type}". Supported: ${Object.keys(GREP_TYPE_SUFFIXES).join(', ')}`
    }
  }

  const target = '.'
  const args: string[] = [
    '--line-number',
    '--color=never',
    '--no-heading',
    ...rgGlobArgs(userGlob)
  ]
  if (caseInsensitive) args.push('-i')
  if (multiline) args.push('-U', '--multiline-dotall')
  if (type) args.push('--type', type.toLowerCase())

  if (mode === 'files_with_matches') {
    args.push('-l', pattern, target)
  } else if (mode === 'count') {
    args.push('--count-matches', pattern, target)
  } else {
    if (contextBefore > 0) args.push('-B', String(contextBefore))
    if (contextAfter > 0) args.push('-A', String(contextAfter))
    args.push(pattern, target)
  }

  const { stdout, code, stderr } = await runRgOnce(bin, args, searchCwd)
  if (code === 2 || (code !== 0 && code !== 1)) {
    return { fallback: true, reason: stderr.trim() || `rg exit ${code}` }
  }

  const trimmed = stdout.trim()
  if (!trimmed) {
    const empty =
      mode === 'files_with_matches' ? 'No files found' : 'No matches found'
    return { ok: true, output: appendNoMatchGlobHint(empty, userGlob) }
  }

  if (mode === 'files_with_matches') {
    const files = trimmed.split(/\r?\n/).filter(Boolean)
    const page = files.slice(offset, offset + headLimit)
    if (!page.length) {
      return { ok: true, output: appendNoMatchGlobHint('No files found', userGlob) }
    }
    let out = `Found ${files.length} file(s)\n` + page.join('\n')
    if (offset > 0 || page.length < files.length) {
      out += `\n[Showing results with pagination = limit: ${headLimit}, offset: ${offset}]`
    }
    return { ok: true, output: out }
  }

  if (mode === 'count') {
    const entries = trimmed.split(/\r?\n/).filter(Boolean)
    const page = entries.slice(offset, offset + headLimit)
    if (!page.length) {
      return { ok: true, output: appendNoMatchGlobHint('No matches found', userGlob) }
    }
    let total = 0
    for (const line of entries) {
      const m = line.match(/:(\d+)$/)
      if (m) total += Number(m[1])
    }
    let out =
      page.join('\n') +
      `\nFound ${total} occurrences across ${entries.length} files`
    if (offset > 0 || page.length < entries.length) {
      out += `\n[Showing results with pagination = limit: ${headLimit}, offset: ${offset}]`
    }
    return { ok: true, output: out }
  }

  const lines = trimmed.split(/\r?\n/).filter(Boolean)
  const relPrefix = path.relative(parsed.cwd, searchCwd).replace(/\\/g, '/')
  const normalized = lines.map((line) => {
    if (relPrefix && relPrefix !== '.' && !line.includes(':')) return line
    return line
  })
  return {
    ok: true,
    output: paginateLines(normalized, offset, headLimit)
  }
}

export async function grepToolDispatch(
  parsed: ParsedGrepInput,
  signal?: AbortSignal
): Promise<FileToolResult> {
  const bin = await resolveRipgrepBin()
  if (bin) {
    try {
      await execFileAsync(bin, ['--version'], {
        encoding: 'utf8',
        windowsHide: true
      })
      const rgResult = await grepWithRipgrep(parsed, bin, signal)
      if ('fallback' in rgResult) {
        void rgResult.reason
        return appendRgHint(await grepNodeScan(parsed, signal))
      }
      return rgResult
    } catch {
      return appendRgHint(await grepNodeScan(parsed, signal))
    }
  }
  return appendRgHint(await grepNodeScan(parsed, signal))
}

function appendRgHint(result: FileToolResult): FileToolResult {
  if (!result.ok) return result
  if (result.output.includes('install ripgrep')) return result
  return {
    ok: true,
    output: clampToolHint(`${result.output}\n${RG_INSTALL_HINT}`)
  }
}
