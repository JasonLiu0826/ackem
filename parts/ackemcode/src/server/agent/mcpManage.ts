/**
 * manage_mcp — list / enable / disable / add / remove / reconnect / auth.
 * Writes settings.mcpServers then syncs the live manager.
 */
import type { McpServerConfigJson } from '../../shared/types.js'
import { loadSettings, saveSettings } from '../settingsStore.js'
import { mcpManager } from '../mcp/index.js'
import { sanitizeMcpName } from '../mcp/types.js'
import {
  mergeMcpPresets,
  PLAYWRIGHT_EDGE_SERVER,
  PLAYWRIGHT_ISOLATED_SERVER
} from '../mcp/seedPresets.js'
import {
  getBrowserOnboardingInfo,
  shouldShowBrowserOnboarding,
  ISOLATED_WINDOW_NOTE_ZH,
  BROWSER_ONBOARDING_FAIL_ZH,
  type BrowserOnboardingInfo,
  type BrowserOnboardingOptionId
} from '../mcp/browserOnboarding.js'
import { runPlaywrightPreflight } from '../mcp/playwrightPreflight.js'

export type ManageMcpAction =
  | 'list'
  | 'enable'
  | 'disable'
  | 'add'
  | 'remove'
  | 'reconnect'
  | 'auth'

export type ManageMcpInput = {
  action: ManageMcpAction
  name?: string
  command?: string
  args?: string[]
  url?: string
  type?: 'stdio' | 'http' | 'sse'
}

export type ManageMcpResult = {
  ok: boolean
  output: string
  needsPermission?: boolean
  permissionRule?: string
  onboarding?: BrowserOnboardingInfo
}

function statusLine(): string {
  const rows = mcpManager.status()
  if (!rows.length) return '(no MCP servers)'
  return rows
    .map((s) => {
      const extra =
        s.name === PLAYWRIGHT_EDGE_SERVER
          ? ' · 用户 Edge · 扩展 · 选标签'
          : s.name === PLAYWRIGHT_ISOLATED_SERVER
            ? ' · 独立窗口（无登录）'
            : ''
      return `${s.name}: ${s.state}${s.error ? ` (${s.error})` : ''}${extra}`
    })
    .join('\n')
}

function isConnected(name: string): boolean {
  return mcpManager.status().some((s) => s.name === name && s.state === 'connected')
}

function toolCount(name: string): number {
  const prefix = `mcp__${sanitizeMcpName(name)}__`
  return mcpManager.toolDefinitions().filter((t) => t.function.name.startsWith(prefix))
    .length
}

export async function applyBrowserOnboardingChoice(
  choice: BrowserOnboardingOptionId
): Promise<ManageMcpResult> {
  const settings = await loadSettings()
  const servers = mergeMcpPresets({ ...settings.mcpServers })

  if (choice === 'later') {
    await saveSettings({
      mcpServers: servers,
      browserOnboarding: {
        ...settings.browserOnboarding,
        lastChoice: 'later',
        lastShownAt: new Date().toISOString()
      }
    })
    return {
      ok: true,
      output:
        '已取消本次连接。playwright-edge 仍关闭。不要声称已经能操作用户的浏览器。'
    }
  }

  if (choice === 'never') {
    if (servers[PLAYWRIGHT_EDGE_SERVER]) {
      servers[PLAYWRIGHT_EDGE_SERVER] = {
        ...servers[PLAYWRIGHT_EDGE_SERVER],
        disabled: true
      }
    }
    await saveSettings({
      mcpServers: servers,
      browserOnboarding: {
        skipPrompt: true,
        lastChoice: 'never',
        lastShownAt: new Date().toISOString()
      }
    })
    await mcpManager.syncFromSettings(servers)
    return {
      ok: true,
      output:
        '已关闭「用我的浏览器」，且不再提醒。不要再自动 enable playwright-edge。'
    }
  }

  if (choice === 'isolated') {
    const cur = servers[PLAYWRIGHT_ISOLATED_SERVER]
    if (!cur) {
      return { ok: false, output: `unknown MCP server "${PLAYWRIGHT_ISOLATED_SERVER}"` }
    }
    servers[PLAYWRIGHT_ISOLATED_SERVER] = { ...cur, disabled: false }
    await saveSettings({
      mcpServers: servers,
      browserOnboarding: {
        ...settings.browserOnboarding,
        lastChoice: 'isolated',
        lastShownAt: new Date().toISOString()
      }
    })
    await mcpManager.syncFromSettings(servers)
    const ok = isConnected(PLAYWRIGHT_ISOLATED_SERVER)
    return {
      ok,
      output: [
        ok
          ? `MCP ${PLAYWRIGHT_ISOLATED_SERVER} enabled · connected · ${toolCount(PLAYWRIGHT_ISOLATED_SERVER)} tools`
          : `MCP ${PLAYWRIGHT_ISOLATED_SERVER} enabled but not connected\n${statusLine()}`,
        ISOLATED_WINDOW_NOTE_ZH
      ].join('\n')
    }
  }

  // installed
  const cur = servers[PLAYWRIGHT_EDGE_SERVER]
  if (!cur) {
    return { ok: false, output: `unknown MCP server "${PLAYWRIGHT_EDGE_SERVER}"` }
  }
  servers[PLAYWRIGHT_EDGE_SERVER] = { ...cur, disabled: false }
  await saveSettings({
    mcpServers: servers,
    browserOnboarding: {
      ...settings.browserOnboarding,
      lastChoice: 'installed',
      lastShownAt: new Date().toISOString()
    }
  })
  await mcpManager.syncFromSettings(servers)
  if (!isConnected(PLAYWRIGHT_EDGE_SERVER)) {
    await mcpManager.reconnectServer(PLAYWRIGHT_EDGE_SERVER)
  }
  if (!isConnected(PLAYWRIGHT_EDGE_SERVER)) {
    return {
      ok: false,
      output: BROWSER_ONBOARDING_FAIL_ZH
    }
  }
  return {
    ok: true,
    output: [
      `已挂到你的 Edge（扩展模式）。只会操作你选中的标签。有登录态。每步会确认。`,
      `connected · ${toolCount(PLAYWRIGHT_EDGE_SERVER)} tools`,
      statusLine()
    ].join('\n')
  }
}

export async function manageMcp(input: ManageMcpInput): Promise<ManageMcpResult> {
  const action = input.action
  const settings = await loadSettings()
  const servers = mergeMcpPresets({ ...settings.mcpServers })
  const name = input.name ? sanitizeMcpName(input.name) : ''

  if (action === 'list') {
    const lines = Object.entries(servers).map(([n, cfg]) => {
      const disabled = cfg.disabled ? ' disabled' : ''
      const dest = 'url' in cfg ? cfg.url : cfg.command
      const hint =
        n === PLAYWRIGHT_EDGE_SERVER
          ? '  [用户 Edge · 扩展 · 选标签]'
          : n === PLAYWRIGHT_ISOLATED_SERVER
            ? '  [独立窗口 · 无登录]'
            : ''
      return `${n}${disabled}  ${dest}${hint}`
    })
    return {
      ok: true,
      output: ['=== MCP ===', lines.join('\n') || '(none configured)', '', 'Live:', statusLine()].join(
        '\n'
      )
    }
  }

  if (!name) {
    return { ok: false, output: 'manage_mcp — name required' }
  }

  if (action === 'enable') {
    const cur = servers[name]
    if (!cur) return { ok: false, output: `unknown MCP server "${name}"` }

    if (name === PLAYWRIGHT_EDGE_SERVER || name === PLAYWRIGHT_ISOLATED_SERVER) {
      const pre = await runPlaywrightPreflight()
      if (!pre.ok) return { ok: false, output: pre.detail }
    }

    if (
      name === PLAYWRIGHT_EDGE_SERVER &&
      shouldShowBrowserOnboarding({
        skipPrompt: settings.browserOnboarding?.skipPrompt,
        connected: isConnected(name)
      })
    ) {
      const card = getBrowserOnboardingInfo()
      return {
        ok: true,
        output: [
          card.titleZh,
          '',
          card.bodyZh,
          '',
          ...card.stepsZh.map((s, i) => `${i + 1}. ${s}`),
          '',
          card.noteZh,
          '',
          `商店：${card.storeUrl}`,
          '已弹出引导对话框。未 connected 前不要声称已经点过网页。'
        ].join('\n'),
        onboarding: card
      }
    }

    servers[name] = { ...cur, disabled: false }
    await saveSettings({ mcpServers: servers })
    await mcpManager.syncFromSettings(servers)

    if (name === PLAYWRIGHT_EDGE_SERVER && isConnected(name)) {
      return {
        ok: true,
        output: [
          `已挂到你的 Edge（扩展模式）。只会操作你选中的标签。有登录态。每步会确认。`,
          `connected · ${toolCount(name)} tools`,
          statusLine()
        ].join('\n')
      }
    }
    if (name === PLAYWRIGHT_ISOLATED_SERVER) {
      return {
        ok: isConnected(name),
        output: [
          `MCP ${name} enabled\n${statusLine()}`,
          ISOLATED_WINDOW_NOTE_ZH
        ].join('\n')
      }
    }
    return { ok: true, output: `MCP ${name} enabled\n${statusLine()}` }
  }

  if (action === 'disable') {
    const cur = servers[name]
    if (!cur) return { ok: false, output: `unknown MCP server "${name}"` }
    servers[name] = { ...cur, disabled: true }
    await saveSettings({ mcpServers: servers })
    await mcpManager.syncFromSettings(servers)
    return { ok: true, output: `MCP ${name} disabled\n${statusLine()}` }
  }

  if (action === 'remove') {
    if (!servers[name]) return { ok: false, output: `unknown MCP server "${name}"` }
    delete servers[name]
    await saveSettings({ mcpServers: servers })
    await mcpManager.syncFromSettings(servers)
    return { ok: true, output: `MCP ${name} removed` }
  }

  if (action === 'add') {
    let cfg: McpServerConfigJson
    if (input.url) {
      cfg = {
        type: input.type === 'sse' ? 'sse' : 'http',
        url: input.url,
        disabled: false
      }
    } else if (input.command) {
      cfg = {
        type: 'stdio',
        command: input.command,
        args: input.args ?? [],
        disabled: false
      }
    } else {
      return { ok: false, output: 'manage_mcp add — need command or url' }
    }
    servers[name] = cfg
    await saveSettings({ mcpServers: servers })
    await mcpManager.syncFromSettings(servers)
    return { ok: true, output: `MCP ${name} added\n${statusLine()}` }
  }

  if (action === 'reconnect') {
    const st = await mcpManager.reconnectServer(name)
    if (name === PLAYWRIGHT_EDGE_SERVER && (!st || st.state !== 'connected')) {
      return { ok: false, output: BROWSER_ONBOARDING_FAIL_ZH }
    }
    return {
      ok: Boolean(st),
      output: st ? `reconnect ${name}: ${st.state}` : `cannot reconnect ${name}`
    }
  }

  if (action === 'auth') {
    return {
      ok: true,
      output: `Start OAuth: POST /api/mcp/${name}/auth/start (or /mcp auth ${name})`
    }
  }

  return { ok: false, output: `unknown action ${String(action)}` }
}

export function parseMcpSlashArg(arg: string): ManageMcpInput {
  const parts = arg.trim().split(/\s+/).filter(Boolean)
  const action = (parts[0] || 'list') as ManageMcpAction
  const name = parts[1]
  if (action === 'add') {
    const rest = parts.slice(2)
    if (rest[0]?.startsWith('http')) {
      return { action: 'add', name, url: rest[0], type: 'http' }
    }
    return { action: 'add', name, command: rest[0], args: rest.slice(1) }
  }
  if (
    action === 'list' ||
    action === 'enable' ||
    action === 'disable' ||
    action === 'remove' ||
    action === 'reconnect' ||
    action === 'auth'
  ) {
    return { action, name }
  }
  return { action: 'list' }
}
