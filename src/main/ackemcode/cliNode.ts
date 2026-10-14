import { existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { execFileSync } from 'node:child_process'

/** Windows Electron is a GUI executable and does not expose ConPTY stdio in Node mode. */
export function resolveCliNode(): string {
  const bundled = process.resourcesPath && join(process.resourcesPath,'node',process.platform === 'win32' ? 'node.exe' : 'node')
  const candidates = [process.env.ACKEM_NODE_PATH, bundled].filter((path):path is string => !!path)
  try {
    candidates.push(...execFileSync(process.platform === 'win32' ? 'where.exe' : 'which',['node'], { windowsHide:true, timeout:4000, encoding:'utf8' }).trim().split(/\r?\n/))
  } catch { /* standalone Node is optional until CLI is opened */ }
  for (const candidate of candidates) {
    if (!existsSync(candidate) || /^electron(?:\.exe)?$/i.test(basename(candidate))) continue
    try {
      const version=execFileSync(candidate,['--version'],{windowsHide:true,timeout:4000,encoding:'utf8'}).trim()
      if (/^v\d+\.\d+\.\d+$/.test(version) && Number(version.slice(1).split('.')[0]) >= 20) return candidate
    } catch { /* try next installed runtime */ }
  }
  throw Error('AckemCode CLI 需要独立 Node.js 20+；请修复运行时安装或设置 ACKEM_NODE_PATH')
}
