/**
 * Merge personal MCP presets into settings.mcpServers.
 * Only fills missing keys — never overwrites a user-defined server.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { McpServerConfigJson } from '../../shared/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const MCP_PRESETS_FILENAME = 'mcp-presets.personal.json'

export function mcpPresetsPath(): string {
  return path.resolve(__dirname, '../../../data', MCP_PRESETS_FILENAME)
}

export function readMcpPresetServers(
  rawJson?: string
): Record<string, McpServerConfigJson> {
  let raw = rawJson
  if (raw == null) {
    const p = mcpPresetsPath()
    try {
      raw = fs.readFileSync(p, 'utf8')
    } catch {
      // Fallback next to compiled file (tests / odd cwd)
      try {
        raw = fs.readFileSync(
          path.resolve(__dirname, '../../../data', MCP_PRESETS_FILENAME),
          'utf8'
        )
      } catch {
        return {}
      }
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const root = parsed as Record<string, unknown>
  const block =
    root.mcpServers && typeof root.mcpServers === 'object' && !Array.isArray(root.mcpServers)
      ? (root.mcpServers as Record<string, unknown>)
      : root
  const out: Record<string, McpServerConfigJson> = {}
  for (const [name, cfg] of Object.entries(block)) {
    if (name.startsWith('_')) continue
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue
    const c = cfg as Record<string, unknown>
    if (typeof c.url === 'string' && c.url.trim()) {
      out[name] = {
        type: c.type === 'sse' ? 'sse' : 'http',
        url: c.url.trim(),
        headers:
          c.headers && typeof c.headers === 'object' && !Array.isArray(c.headers)
            ? (c.headers as Record<string, string>)
            : undefined,
        disabled: c.disabled !== false
      }
      continue
    }
    if (typeof c.command === 'string' && c.command.trim()) {
      out[name] = {
        type: 'stdio',
        command: c.command.trim(),
        args: Array.isArray(c.args)
          ? c.args.filter((a): a is string => typeof a === 'string')
          : [],
        env:
          c.env && typeof c.env === 'object' && !Array.isArray(c.env)
            ? (c.env as Record<string, string>)
            : undefined,
        disabled: c.disabled !== false
      }
    }
  }
  return out
}

/** Copy missing preset keys into `base`. Existing keys stay as-is. */
export function mergeMcpPresets(
  base: Record<string, McpServerConfigJson> | undefined,
  presets?: Record<string, McpServerConfigJson>
): Record<string, McpServerConfigJson> {
  const src = presets ?? readMcpPresetServers()
  const out: Record<string, McpServerConfigJson> = { ...(base ?? {}) }
  for (const [name, cfg] of Object.entries(src)) {
    if (out[name] == null) out[name] = { ...cfg }
  }
  return out
}

export const PLAYWRIGHT_EDGE_SERVER = 'playwright-edge'
export const PLAYWRIGHT_ISOLATED_SERVER = 'playwright'
