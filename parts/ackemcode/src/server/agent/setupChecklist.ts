/**
 * U1 — read-only onboarding checks (no secrets in output).
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadSettings, loadStandaloneSettings } from '../settingsStore.js'
import { isWebSearchEnabled } from '../tools/webSearch/index.js'
import { resolveRipgrepBin } from '../tools/files/ripgrep.js'

const execFileAsync = promisify(execFile)

export type SetupCheck = { name: string; ok: boolean; detail: string }

async function rgOnPath(): Promise<boolean> {
  const bin = await resolveRipgrepBin()
  if (!bin) return false
  try {
    await execFileAsync(bin, ['--version'], { encoding: 'utf8', windowsHide: true })
    return true
  } catch {
    return false
  }
}

export async function runSetupChecklist(): Promise<SetupCheck[]> {
  const checks: SetupCheck[] = []
  let standalone: Awaited<ReturnType<typeof loadStandaloneSettings>> | null = null
  try {
    standalone = await loadStandaloneSettings()
  } catch {
    standalone = null
  }
  const settings = await loadSettings()

  checks.push({
    name: 'apiKey',
    ok: Boolean(standalone?.apiKey?.trim()),
    detail: standalone?.apiKey?.trim()
      ? 'standalone apiKey present'
      : 'missing — Ink /setup or PUT /api/settings/standalone'
  })
  checks.push({
    name: 'model',
    ok: Boolean(standalone?.model?.trim()),
    detail: standalone?.model?.trim() || '(unset)'
  })
  checks.push({
    name: 'contextWindow',
    ok: true,
    detail:
      typeof standalone?.contextWindow === 'number'
        ? String(standalone.contextWindow)
        : 'auto (prefix table / settings.contextWindow)'
  })

  const webKey = settings.webSearch?.apiKey?.trim()
  checks.push({
    name: 'web_search',
    ok: !isWebSearchEnabled() || Boolean(webKey && !webKey.includes('••••')),
    detail: isWebSearchEnabled()
      ? webKey
        ? 'webSearch.apiKey configured'
        : 'enabled but no key — /web-set'
      : 'disabled (OK)'
  })

  const rg = await rgOnPath()
  checks.push({
    name: 'ripgrep',
    ok: rg,
    detail: rg
      ? 'rg on PATH (or ACKEM_RG)'
      : 'not found — grep uses Node scan (slower); scoop install ripgrep'
  })

  const edge = settings.mcpServers?.['playwright-edge']
  const isolated = settings.mcpServers?.['playwright']
  checks.push({
    name: 'playwright-edge',
    ok: true,
    detail: edge
      ? edge.disabled
        ? 'optional off — 贾维斯上网请 enable playwright-edge（Edge 扩展引导）'
        : 'present in settings (not a setup failure if disconnected)'
      : 'preset missing — seed playwright-edge'
  })
  checks.push({
    name: 'playwright',
    ok: true,
    detail: isolated
      ? isolated.disabled
        ? 'optional isolated window (no login)'
        : 'isolated window enabled in settings'
      : 'preset missing — seed playwright'
  })

  const lspCount = settings.lspServers
    ? Object.keys(settings.lspServers).length
    : 0
  checks.push({
    name: 'lsp',
    ok: true,
    detail:
      settings.lspEnabled === false
        ? 'lspEnabled=false'
        : lspCount
          ? `${lspCount} server(s) in settings.lspServers`
          : 'optional — configure lspServers for passive diagnostics'
  })

  return checks
}

export function formatSetupChecklist(checks: SetupCheck[]): string {
  const lines = ['=== Setup checklist ===']
  for (const c of checks) {
    lines.push(`${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`)
  }
  lines.push('')
  lines.push('Next: /web-set (search) · install rg · POST /api/llm/test · /doctor')
  return lines.join('\n')
}
