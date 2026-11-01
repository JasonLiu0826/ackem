import { expandPath } from './files/pathUtils.js'
import {
  openBrowser,
  openPath,
  resolveFileUrl
} from '../../shared/openExternal.js'

export async function openPathTool(
  cwd: string,
  input: Record<string, unknown>
): Promise<{ ok: boolean; output: string }> {
  const raw = String(input.path ?? '').trim()
  if (!raw) return { ok: false, output: 'path is required' }
  const target = raw.toLowerCase().startsWith('file:')
    ? resolveFileUrl(raw)
    : expandPath(cwd, raw)
  const result = await openPath(target)
  return { ok: result.ok, output: result.message }
}

export async function openUrlTool(
  input: Record<string, unknown>
): Promise<{ ok: boolean; output: string }> {
  const url = String(input.url ?? '').trim()
  if (!url) return { ok: false, output: 'url is required' }
  const result = await openBrowser(url)
  return { ok: result.ok, output: result.message }
}
