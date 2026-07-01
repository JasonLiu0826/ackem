import { spawn } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { homedir } from 'node:os'
import { shell } from 'electron'
import type { DesktopAgentAction, UseComputerArgs } from '../../../../shared/desktopAgent'
import { isBlockedCloseTarget } from '../../policy'

const TEXT_READ_LIMIT = 512_000
const LIST_LIMIT = 200
const SEARCH_LIMIT = 100

export type ExecuteResult = {
  ok: boolean
  content: string
  summary: string
}

function statLine(path: string): string {
  const st = statSync(path)
  const kind = st.isDirectory() ? '目录' : '文件'
  return `${kind} · ${st.size} 字节 · 修改于 ${st.mtime.toISOString()}`
}

function listFolder(path: string): ExecuteResult {
  if (!existsSync(path)) {
    return { ok: false, content: '路径不存在', summary: `目录不存在：${path}` }
  }
  const entries = readdirSync(path, { withFileTypes: true })
    .slice(0, LIST_LIMIT)
    .map((e) => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`)
  const suffix = entries.length >= LIST_LIMIT ? `\n…（仅显示前 ${LIST_LIMIT} 项）` : ''
  return {
    ok: true,
    content: entries.join('\n') + suffix,
    summary: `已列出 ${basename(path)}（${entries.length} 项）`
  }
}

function readTextFile(path: string, maxBytes = TEXT_READ_LIMIT): ExecuteResult {
  if (!existsSync(path)) {
    return { ok: false, content: '文件不存在', summary: `读取失败：${path}` }
  }
  const st = statSync(path)
  if (st.isDirectory()) {
    return { ok: false, content: '路径是目录', summary: '无法以文本读取目录' }
  }
  const buf = readFileSync(path)
  const slice = buf.subarray(0, maxBytes)
  const truncated = buf.length > maxBytes
  const text = slice.toString('utf-8')
  return {
    ok: true,
    content: text + (truncated ? `\n…（仅显示前 ${maxBytes} 字节）` : ''),
    summary: `已读取 ${basename(path)}${truncated ? '（截断）' : ''}`
  }
}

function searchFiles(root: string, query: string): ExecuteResult {
  if (!existsSync(root)) {
    return { ok: false, content: '路径不存在', summary: '搜索失败' }
  }
  const q = query.toLowerCase()
  const hits: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (hits.length >= SEARCH_LIMIT || depth > 6) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (hits.length >= SEARCH_LIMIT) break
      const full = join(dir, e.name)
      if (e.name.toLowerCase().includes(q)) hits.push(full)
      if (e.isDirectory()) walk(full, depth + 1)
    }
  }
  walk(root, 0)
  return {
    ok: true,
    content: hits.length ? hits.join('\n') : '（未找到匹配文件）',
    summary: `搜索「${query}」找到 ${hits.length} 项`
  }
}

function grepText(root: string, query: string): ExecuteResult {
  const q = query.toLowerCase()
  const hits: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (hits.length >= 50 || depth > 3) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (hits.length >= 50) break
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      const ext = extname(e.name).toLowerCase()
      if (!['.txt', '.md', '.json', '.csv', '.log', '.js', '.ts', '.tsx', '.py'].includes(ext)) continue
      try {
        const text = readFileSync(full, 'utf-8').slice(0, 64_000)
        if (text.toLowerCase().includes(q)) hits.push(full)
      } catch {
        /* skip binary */
      }
    }
  }
  if (existsSync(root) && statSync(root).isFile()) {
    const one = readTextFile(root)
    if (one.ok && one.content.toLowerCase().includes(q)) hits.push(root)
  } else if (existsSync(root)) {
    walk(root, 0)
  }
  return {
    ok: true,
    content: hits.length ? hits.join('\n') : '（未找到包含该文本的文件）',
    summary: `grep「${query}」${hits.length} 个文件`
  }
}

async function shellOpen(path: string): Promise<ExecuteResult> {
  const err = await shell.openPath(path)
  if (err) {
    return { ok: false, content: err, summary: `打开失败：${path}` }
  }
  return { ok: true, content: `已打开 ${path}`, summary: `已打开 ${basename(path)}` }
}

function runPowerShell(script: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true }
    )
    let out = ''
    child.stdout.on('data', (d) => {
      out += String(d)
    })
    child.stderr.on('data', (d) => {
      out += String(d)
    })
    child.on('close', (code) => {
      resolve({ ok: code === 0, output: out.trim() })
    })
    child.on('error', (e) => {
      resolve({ ok: false, output: e.message })
    })
  })
}

async function closeAppTarget(target: string): Promise<ExecuteResult> {
  if (isBlockedCloseTarget(target)) {
    return { ok: false, content: '系统关键进程不可关闭', summary: '关闭被拒绝' }
  }
  const name = target.replace(/\.exe$/i, '')
  const ps = `$p = Get-Process -Name '${name.replace(/'/g, "''")}' -ErrorAction SilentlyContinue; if (-not $p) { exit 2 }; $p | ForEach-Object { $_.CloseMainWindow() | Out-Null }; exit 0`
  const r = await runPowerShell(ps)
  if (!r.ok) {
    return {
      ok: false,
      content: r.output || '未找到可关闭的窗口',
      summary: `未能关闭 ${target}`
    }
  }
  return { ok: true, content: `已请求关闭 ${target}`, summary: `已关闭 ${target}` }
}

async function openAppTarget(target: string): Promise<ExecuteResult> {
  const ps = `Start-Process '${target.replace(/'/g, "''")}'`
  const r = await runPowerShell(ps)
  if (!r.ok) {
    return { ok: false, content: r.output || '启动失败', summary: `未能打开 ${target}` }
  }
  return { ok: true, content: `已启动 ${target}`, summary: `已打开 ${target}` }
}

async function downloadHttps(url: string, destPath: string): Promise<ExecuteResult> {
  if (!url.startsWith('https://')) {
    return { ok: false, content: '仅支持 HTTPS 下载', summary: '下载被拒绝' }
  }
  mkdirSync(dirname(destPath), { recursive: true })
  const res = await fetch(url)
  if (!res.ok) {
    return { ok: false, content: `HTTP ${res.status}`, summary: '下载失败' }
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 200 * 1024 * 1024) {
    return { ok: false, content: '文件超过 200MB 上限', summary: '下载被拒绝' }
  }
  writeFileSync(destPath, buf)
  return {
    ok: true,
    content: `已下载到 ${destPath}（${buf.length} 字节）`,
    summary: `已下载 ${basename(destPath)}`
  }
}

function defaultDownloadDir(settingsDir?: string): string {
  if (settingsDir?.trim()) return settingsDir.trim()
  return join(homedir(), 'Downloads', 'AckemDownloads')
}

export async function executeDesktopAgentAction(
  action: DesktopAgentAction,
  args: UseComputerArgs,
  ctx: { dataRoot: string; downloadDir?: string; cwd: string }
): Promise<ExecuteResult> {
  const path = args.path ?? ''
  const pathTo = args.path_to ?? ''
  const target = args.target ?? ''
  const query = args.query ?? ''
  const url = args.url ?? ''

  switch (action) {
    case 'list_folder':
      return listFolder(path)
    case 'stat_file':
      if (!existsSync(path)) {
        return { ok: false, content: '路径不存在', summary: `stat 失败：${path}` }
      }
      return { ok: true, content: statLine(path), summary: `已查看 ${basename(path)} 信息` }
    case 'read_text':
      return readTextFile(path)
    case 'read_document': {
      const ext = extname(path).toLowerCase()
      if (['.txt', '.md', '.csv', '.json', '.log'].includes(ext)) {
        return readTextFile(path)
      }
      return {
        ok: false,
        content:
          'V1 暂不支持解析该文档格式全文；若为纯文本可改用 read_text，或先将文件导入 Ackem。',
        summary: `文档格式 ${ext || '未知'} 暂未解析`
      }
    }
    case 'read_image':
      return {
        ok: true,
        content: existsSync(path) ? statLine(path) : '文件不存在',
        summary: existsSync(path) ? `已定位图片 ${basename(path)}（OCR/Vision 后续版本）` : '图片不存在'
      }
    case 'search_files':
      return searchFiles(path || ctx.cwd, query || basename(path))
    case 'grep_text':
      return grepText(path || ctx.cwd, query || '')
    case 'open_folder':
    case 'open_file':
      return shellOpen(path)
    case 'open_app':
      return openAppTarget(target || path)
    case 'focus_app':
      return openAppTarget(target || path)
    case 'close_app':
      return closeAppTarget(target || basename(path))
    case 'close_file':
      return closeAppTarget(target || basename(path))
    case 'copy_path':
      mkdirSync(dirname(pathTo), { recursive: true })
      copyFileSync(path, pathTo)
      return { ok: true, content: `已复制到 ${pathTo}`, summary: `已复制 ${basename(path)}` }
    case 'move_path':
      mkdirSync(dirname(pathTo), { recursive: true })
      renameSync(path, pathTo)
      return { ok: true, content: `已移动到 ${pathTo}`, summary: `已移动 ${basename(path)}` }
    case 'mkdir':
      mkdirSync(path, { recursive: true })
      return { ok: true, content: `已创建 ${path}`, summary: `已创建目录 ${basename(path)}` }
    case 'write_text': {
      const content = typeof args.options?.content === 'string' ? args.options.content : ''
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content, 'utf-8')
      return { ok: true, content: `已写入 ${path}`, summary: `已写入 ${basename(path)}` }
    }
    case 'delete_path': {
      await shell.trashItem(path)
      return { ok: true, content: `已移入回收站：${path}`, summary: `已删除 ${basename(path)}` }
    }
    case 'download_file': {
      const dest = path || join(defaultDownloadDir(ctx.downloadDir), basename(new URL(url).pathname) || 'download.bin')
      return downloadHttps(url, dest)
    }
    case 'run_installer':
      return shellOpen(path)
    case 'download_and_install': {
      const dir = defaultDownloadDir(ctx.downloadDir)
      mkdirSync(dir, { recursive: true })
      const fileName = basename(new URL(url).pathname) || 'installer.exe'
      const dest = join(dir, fileName)
      const dl = await downloadHttps(url, dest)
      if (!dl.ok) return dl
      await shell.openPath(dirname(dest))
      const run = await shellOpen(dest)
      return {
        ok: run.ok,
        content: `${dl.content}\n${run.content}`,
        summary: `已下载并开始安装 ${fileName}`
      }
    }
    case 'import_to_ackem': {
      const importsDir = join(ctx.dataRoot, 'imports')
      mkdirSync(importsDir, { recursive: true })
      const dest = join(importsDir, basename(path))
      copyFileSync(path, dest)
      return {
        ok: true,
        content: `已复制到 ${dest}`,
        summary: `已导入 ${basename(path)} 到 Ackem`
      }
    }
    default:
      return { ok: false, content: `未知 action: ${action}`, summary: '执行失败' }
  }
}
