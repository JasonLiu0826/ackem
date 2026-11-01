import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type PlaywrightPreflight = {
  ok: boolean
  nodeVersion?: string
  npx?: boolean
  detail: string
}

function parseMajor(v: string): number {
  const m = v.trim().replace(/^v/i, '').split('.')[0]
  const n = Number(m)
  return Number.isFinite(n) ? n : 0
}

export async function runPlaywrightPreflight(): Promise<PlaywrightPreflight> {
  try {
    const { stdout } = await execFileAsync('node', ['-v'], {
      timeout: 8000,
      windowsHide: true,
      encoding: 'utf8'
    })
    const nodeVersion = stdout.trim()
    const major = parseMajor(nodeVersion)
    if (major < 20) {
      return {
        ok: false,
        nodeVersion,
        npx: false,
        detail: `Node ${nodeVersion} 过旧。Playwright MCP 需要 Node 20+。请升级 Node 后重启 AckemCode daemon。`
      }
    }
  } catch {
    return {
      ok: false,
      npx: false,
      detail:
        '找不到 node。请安装 Node 20+ 并加入系统 PATH，然后重启 AckemCode daemon。'
    }
  }

  try {
    await execFileAsync('npx', ['--version'], {
      timeout: 8000,
      windowsHide: true,
      encoding: 'utf8',
      shell: process.platform === 'win32'
    })
    return {
      ok: true,
      nodeVersion: process.version,
      npx: true,
      detail: `node ${process.version} · npx ok`
    }
  } catch {
    return {
      ok: false,
      nodeVersion: process.version,
      npx: false,
      detail:
        '找不到 npx。请确认 Node 安装完整（含 npm/npx），并重启 AckemCode daemon。'
    }
  }
}

export function playwrightStdioTimeoutMs(
  env: NodeJS.ProcessEnv = process.env
): number {
  const n = Number(env.ACKEM_PLAYWRIGHT_MCP_TIMEOUT_MS)
  if (Number.isFinite(n) && n >= 10_000) return Math.floor(n)
  return 180_000
}
