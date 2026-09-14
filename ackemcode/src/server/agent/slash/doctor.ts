/**
 * /doctor — readiness snapshot (permissions / hooks / sandbox / mcp / lsp).
 * Read-only; Ackem-owned (CC /doctor spirit, not a UI port).
 */
import { HOOK_EVENTS, type HooksConfig } from '../../hooks/types.js'
import { getSandboxStatus, checkSandboxDependencies } from '../../sandbox/index.js'
import { dangerousPatternStats } from '../dangerousPatterns.js'
import type { SlashContext } from './types.js'
import { loadStandaloneSettings } from '../../settingsStore.js'

function configuredHookEvents(
  config: HooksConfig | Record<string, unknown> | undefined
): string[] {
  if (!config || typeof config !== 'object') return []
  const out: string[] = []
  for (const ev of HOOK_EVENTS) {
    const groups = (config as Record<string, unknown>)[ev]
    if (Array.isArray(groups) && groups.length > 0) out.push(ev)
  }
  return out
}

export async function buildDoctorReport(ctx: SlashContext): Promise<{
  text: string
  data: Record<string, unknown>
}> {
  const cwd = ctx.getCwd?.() || process.cwd()
  const mode = ctx.getMode?.() || 'default'
  const hooksDisabled = ctx.hooksDisabled?.() === true
  const hookEvents = configuredHookEvents(ctx.getHooksConfig?.())
  const sandbox = getSandboxStatus()
  const patterns = dangerousPatternStats()
  const rules = ctx.getPermissionRuleCounts?.() ?? {
    allow: 0,
    deny: 0,
    ask: 0
  }
  const mcp = ctx.getMcpStatus?.() ?? []
  const lsp = ctx.getLspSummary?.() ?? {
    toolEnabled: false,
    configuredServers: 0
  }
  const verify = ctx.getVerifySummary?.() ?? null

  const checks: { name: string; ok: boolean; detail: string }[] = [
    {
      name: 'cwd',
      ok: Boolean(cwd),
      detail: cwd
    },
    {
      name: 'permission_mode',
      ok: true,
      detail: String(mode)
    },
    {
      name: 'permission_rules',
      ok: true,
      detail: `allow=${rules.allow} deny=${rules.deny} ask=${rules.ask}`
    },
    {
      name: 'dangerous_patterns',
      ok: patterns.criticalShell > 0,
      detail: `critical=${patterns.criticalShell} high=${patterns.highShell} paths=${patterns.sensitivePaths}`
    },
    {
      name: 'hooks',
      ok: !hooksDisabled,
      detail: hooksDisabled
        ? 'disabled (disableAllHooks)'
        : hookEvents.length
          ? `configured: ${hookEvents.join(', ')}`
          : 'no hook events configured'
    },
    {
      name: 'sandbox',
      ok: !sandbox.enabledInSettings || sandbox.active,
      detail: sandbox.enabledInSettings
        ? sandbox.active
          ? 'enabled + active'
          : `enabled but NOT active: ${sandbox.unavailableReason || 'runtime not ready'}`
        : 'opt-in off (not required)'
    },
    {
      name: 'mcp',
      ok: true,
      detail: mcp.length
        ? mcp.map((s) => `${s.name}:${s.state}`).join(', ')
        : 'no MCP servers in session probe'
    },
    {
      name: 'lsp',
      ok: true,
      detail: `toolEnabled=${lsp.toolEnabled} configuredServers=${lsp.configuredServers}`
    },
    {
      name: 'verify_evidence',
      ok: !verify || verify.verified !== false || verify.verdict === 'PASS',
      detail: verify
        ? `verdict=${verify.verdict ?? '?'} verified=${Boolean(verify.verified)}`
        : 'none yet'
    }
  ]

  try {
    const standalone = await loadStandaloneSettings()
    checks.push({
      name: 'standalone_llm',
      ok: Boolean(standalone.apiKey),
      detail: standalone.apiKey
        ? `model=${standalone.model} vendor=${standalone.llmVendorId ?? 'custom'}`
        : 'no apiKey — run /setup'
    })
  } catch {
    checks.push({
      name: 'standalone_llm',
      ok: false,
      detail: 'could not read settings.standalone.json'
    })
  }

  const deps = checkSandboxDependencies()
  checks.push({
    name: 'asrt',
    ok: deps.errors.length === 0,
    detail:
      deps.errors.length === 0
        ? 'sandbox-runtime deps ok'
        : deps.errors.join('; ') || 'ASRT missing — npx sandbox-runtime windows-install'
  })

  const extras = await ctx.doctorExtras?.()
  if (extras?.length) {
    for (const line of extras) {
      checks.push({ name: 'extra', ok: true, detail: line })
    }
  }

  const data = {
    cwd,
    mode,
    hooksDisabled,
    hookEvents,
    sandbox: {
      enabledInSettings: sandbox.enabledInSettings,
      active: sandbox.active,
      supported: sandbox.supported,
      unavailableReason: sandbox.unavailableReason
    },
    permissionRules: rules,
    dangerousPatterns: patterns,
    mcp,
    lsp,
    verify,
    checks
  }

  const lines = [
    '=== /doctor ===',
    ...checks.map(
      (c) => `${c.ok ? 'OK' : '!!'}  ${c.name}: ${c.detail}`
    ),
    '',
    'Note: doctor is read-only. Sandbox/MCP/LSP quality depends on host settings.'
  ]

  return { text: lines.join('\n'), data }
}
