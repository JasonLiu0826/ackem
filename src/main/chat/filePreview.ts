import { readdir, realpath, stat, open } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'

export type FilePreviewResult = { ok: true; path: string; name: string; content: string; bytes: number } | { ok: false; error: string; candidates?: string[] }
const textExtensions = new Set(['.txt', '.md', '.log', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.yaml', '.yml', '.xml', '.py', '.rs', '.go', '.sql', '.sh', '.bat', '.ps1', '.toml', '.ini', '.env', '.c', '.cpp', '.h'])
function inside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../') && !isAbsolute(rel)
}

/** Read-only previews are confined to the product data directory, including real symlink targets. */
export async function previewChatFile(dataRoot: string, rawPath: string): Promise<FilePreviewResult> {
  if (typeof rawPath !== 'string' || rawPath.length > 2000 || !rawPath.trim()) return { ok: false, error: '文件路径无效' }
  const clean = rawPath.trim().replace(/^["']|["']$/g, '')
  try {
    const root = await realpath(dataRoot)
    const candidates = isAbsolute(clean) ? [clean] : [resolve(root, 'workspace', clean), resolve(root, clean)]
    const matches = new Set<string>()
    const consider = async (path: string) => {
      try {
        const canonical = await realpath(path)
        if (inside(root, canonical) && (await stat(canonical)).isFile()) matches.add(canonical)
      } catch { /* missing candidate */ }
    }
    for (const path of candidates) await consider(path)
    // A bare name may refer to a task output in a subfolder. Never silently choose among duplicates.
    if (basename(clean) === clean) {
      let visited = 0
      const scan = async (dir: string, depth: number): Promise<void> => {
        if (depth > 6 || visited > 5000) return
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
        for (const entry of entries) {
          if (++visited > 5000) break
          if (entry.isFile() && entry.name.toLowerCase() === clean.toLowerCase()) await consider(join(dir, entry.name))
          if (entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)) await scan(join(dir, entry.name), depth + 1)
        }
      }
      await scan(join(root, 'workspace'), 0)
      await scan(join(root, 'staging'), 0)
    }
    if (!matches.size) return { ok: false, error: '未找到文件，或文件不在 Ackem 数据目录内。请使用完整的产出文件路径。' }
    if (matches.size > 1) return { ok: false, error: '找到多个同名文件，请选择要预览的文件。', candidates: [...matches].sort() }
    const path = [...matches][0]
    if (!textExtensions.has(extname(path).toLowerCase())) return { ok: false, error: '该文件类型暂不支持文本预览，请在资源管理器中打开。', candidates: [path] }
    const handle = await open(path, 'r')
    try {
      const info = await handle.stat()
      if (info.size > 1024 * 1024) return { ok: false, error: '文件超过 1 MB，暂不加载全文。请在资源管理器中打开。', candidates: [path] }
      const buffer = Buffer.alloc(1024 * 1024 + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      if (bytesRead > 1024 * 1024) return { ok: false, error: '文件超过 1 MB，暂不加载全文。' }
      const data = buffer.subarray(0, bytesRead)
      const encoding = data[0] === 0xff && data[1] === 0xfe ? 'utf-16le' : data[0] === 0xfe && data[1] === 0xff ? 'utf-16be' : 'utf-8'
      let content: string
      try { content = new TextDecoder(encoding, { fatal: true }).decode(data) }
      catch { return { ok: false, error: '无法解码此文本，请使用 UTF-8 或 UTF-16 编码保存。', candidates: [path] } }
      if (content.includes('\0')) return { ok: false, error: '文件包含二进制内容，不能作为文本预览。', candidates: [path] }
      return { ok: true, path, name: basename(path), content, bytes: bytesRead }
    } finally { await handle.close() }
  } catch { return { ok: false, error: '无法读取文件，请检查文件是否存在及访问权限。' } }
}
