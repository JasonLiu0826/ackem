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
  const kind = st.isDirectory() ? '鐩綍' : '鏂囦欢'
  return `${kind} 路 ${st.size} 瀛楄妭 路 淇敼浜?${st.mtime.toISOString()}`
}

function listFolder(path: string): ExecuteResult {
  if (!existsSync(path)) {
    return { ok: false, content: '璺緞涓嶅瓨鍦?, summary: `鐩綍涓嶅瓨鍦細${path}` }
  }
  const entries = readdirSync(path, { withFileTypes: true })
    .slice(0, LIST_LIMIT)
    .map((e) => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`)
  const suffix = entries.length >= LIST_LIMIT ? `\n鈥︼紙浠呮樉绀哄墠 ${LIST_LIMIT} 椤癸級` : ''
  return {
    ok: true,
    content: entries.join('\n') + suffix,
    summary: `宸插垪鍑?${basename(path)}锛?{entries.length} 椤癸級`
  }
}

function readTextFile(path: string, maxBytes = TEXT_READ_LIMIT): ExecuteResult {
  if (!existsSync(path)) {
    return { ok: false, content: '鏂囦欢涓嶅瓨鍦?, summary: `璇诲彇澶辫触锛?{path}` }
  }
  const st = statSync(path)
  if (st.isDirectory()) {
    return { ok: false, content: '璺緞鏄洰褰?, summary: '鏃犳硶浠ユ枃鏈鍙栫洰褰? }
  }
  const buf = readFileSync(path)
  const slice = buf.subarray(0, maxBytes)
  const truncated = buf.length > maxBytes
  const text = slice.toString('utf-8')
  return {
    ok: true,
    content: text + (truncated ? `\n鈥︼紙浠呮樉绀哄墠 ${maxBytes} 瀛楄妭锛塦 : ''),
    summary: `宸茶鍙?${basename(path)}${truncated ? '锛堟埅鏂級' : ''}`
  }
}

function searchFiles(root: string, query: string): ExecuteResult {
  if (!existsSync(root)) {
    return { ok: false, content: '璺緞涓嶅瓨鍦?, summary: '鎼滅储澶辫触' }
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
    content: hits.length ? hits.join('\n') : '锛堟湭鎵惧埌鍖归厤鏂囦欢锛?,
    summary: `鎼滅储銆?{query}銆嶆壘鍒?${hits.length} 椤筦
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
    content: hits.length ? hits.join('\n') : '锛堟湭鎵惧埌鍖呭惈璇ユ枃鏈殑鏂囦欢锛?,
    summary: `grep銆?{query}銆?{hits.length} 涓枃浠禶
  }
}

async function shellOpen(path: string): Promise<ExecuteResult> {
  const err = await shell.openPath(path)
  if (err) {
    return { ok: false, content: err, summary: `鎵撳紑澶辫触锛?{path}` }
  }
  return { ok: true, content: `宸叉墦寮€ ${path}`, summary: `宸叉墦寮€ ${basename(path)}` }
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
    return { ok: false, content: '绯荤粺鍏抽敭杩涚▼涓嶅彲鍏抽棴', summary: '鍏抽棴琚嫆缁? }
  }
  const name = target.replace(/\.exe$/i, '')
  const ps = `$p = Get-Process -Name '${name.replace(/'/g, "''")}' -ErrorAction SilentlyContinue; if (-not $p) { exit 2 }; $p | ForEach-Object { $_.CloseMainWindow() | Out-Null }; exit 0`
  const r = await runPowerShell(ps)
  if (!r.ok) {
    return {
      ok: false,
      content: r.output || '鏈壘鍒板彲鍏抽棴鐨勭獥鍙?,
      summary: `鏈兘鍏抽棴 ${target}`
    }
  }
  return { ok: true, content: `宸茶姹傚叧闂?${target}`, summary: `宸插叧闂?${target}` }
}

async function openAppTarget(target: string): Promise<ExecuteResult> {
  const ps = `Start-Process '${target.replace(/'/g, "''")}'`
  const r = await runPowerShell(ps)
  if (!r.ok) {
    return { ok: false, content: r.output || '鍚姩澶辫触', summary: `鏈兘鎵撳紑 ${target}` }
  }
  return { ok: true, content: `宸插惎鍔?${target}`, summary: `宸叉墦寮€ ${target}` }
}

async function downloadHttps(url: string, destPath: string): Promise<ExecuteResult> {
  if (!url.startsWith('https://')) {
    return { ok: false, content: '浠呮敮鎸?HTTPS 涓嬭浇', summary: '涓嬭浇琚嫆缁? }
  }
  mkdirSync(dirname(destPath), { recursive: true })
  const res = await fetch(url)
  if (!res.ok) {
    return { ok: false, content: `HTTP ${res.status}`, summary: '涓嬭浇澶辫触' }
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 200 * 1024 * 1024) {
    return { ok: false, content: '鏂囦欢瓒呰繃 200MB 涓婇檺', summary: '涓嬭浇琚嫆缁? }
  }
  writeFileSync(destPath, buf)
  return {
    ok: true,
    content: `宸蹭笅杞藉埌 ${destPath}锛?{buf.length} 瀛楄妭锛塦,
    summary: `宸蹭笅杞?${basename(destPath)}`
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
        return { ok: false, content: '璺緞涓嶅瓨鍦?, summary: `stat 澶辫触锛?{path}` }
      }
      return { ok: true, content: statLine(path), summary: `宸叉煡鐪?${basename(path)} 淇℃伅` }
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
          'V1 鏆備笉鏀寔瑙ｆ瀽璇ユ枃妗ｆ牸寮忓叏鏂囷紱鑻ヤ负绾枃鏈彲鏀圭敤 read_text锛屾垨鍏堝皢鏂囦欢瀵煎叆 Ackem銆?,
        summary: `鏂囨。鏍煎紡 ${ext || '鏈煡'} 鏆傛湭瑙ｆ瀽`
      }
    }
    case 'read_image':
      return {
        ok: true,
        content: existsSync(path) ? statLine(path) : '鏂囦欢涓嶅瓨鍦?,
        summary: existsSync(path) ? `宸插畾浣嶅浘鐗?${basename(path)}锛圤CR/Vision 鍚庣画鐗堟湰锛塦 : '鍥剧墖涓嶅瓨鍦?
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
      return { ok: true, content: `宸插鍒跺埌 ${pathTo}`, summary: `宸插鍒?${basename(path)}` }
    case 'move_path':
      mkdirSync(dirname(pathTo), { recursive: true })
      renameSync(path, pathTo)
      return { ok: true, content: `宸茬Щ鍔ㄥ埌 ${pathTo}`, summary: `宸茬Щ鍔?${basename(path)}` }
    case 'mkdir':
      mkdirSync(path, { recursive: true })
      return { ok: true, content: `宸插垱寤?${path}`, summary: `宸插垱寤虹洰褰?${basename(path)}` }
    case 'write_text': {
      const content = typeof args.options?.content === 'string' ? args.options.content : ''
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content, 'utf-8')
      return { ok: true, content: `宸插啓鍏?${path}`, summary: `宸插啓鍏?${basename(path)}` }
    }
    case 'delete_path': {
      await shell.trashItem(path)
      return { ok: true, content: `宸茬Щ鍏ュ洖鏀剁珯锛?{path}`, summary: `宸插垹闄?${basename(path)}` }
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
        summary: `宸蹭笅杞藉苟寮€濮嬪畨瑁?${fileName}`
      }
    }
    case 'import_to_Ackem': {
      const importsDir = join(ctx.dataRoot, 'imports')
      mkdirSync(importsDir, { recursive: true })
      const dest = join(importsDir, basename(path))
      copyFileSync(path, dest)
      return {
        ok: true,
        content: `宸插鍒跺埌 ${dest}`,
        summary: `宸插鍏?${basename(path)} 鍒?Ackem`
      }
    }
    default:
      return { ok: false, content: `鏈煡 action: ${action}`, summary: '鎵ц澶辫触' }
  }
}
