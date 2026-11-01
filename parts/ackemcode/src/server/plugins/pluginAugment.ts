/**
 * F-07 — merge plugin hooks / MCP / slash commands into runtime.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { McpServerConfigJson } from '../../shared/types.js'
import type { HooksConfig } from '../hooks/types.js'
import { loadLocalPlugins, type LoadedPlugin } from './loadPlugins.js'

export type PluginSlashCommand = {
  name: string
  description: string
  body: string
  pluginId: string
}

export type PluginAugmentation = {
  hooks: HooksConfig
  mcpServers: Record<string, McpServerConfigJson>
  slashCommands: PluginSlashCommand[]
}

export function mergeHooksConfigs(...parts: HooksConfig[]): HooksConfig {
  const out: HooksConfig = {}
  for (const cfg of parts) {
    if (!cfg) continue
    for (const [event, groups] of Object.entries(cfg)) {
      if (!groups?.length) continue
      const key = event as keyof HooksConfig
      out[key] = [...(out[key] ?? []), ...groups]
    }
  }
  return out
}

function parseSimpleFrontmatter(raw: string): {
  meta: Record<string, string>
  body: string
} {
  if (!raw.startsWith('---')) return { meta: {}, body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end < 0) return { meta: {}, body: raw }
  const fm = raw.slice(3, end).trim()
  const body = raw.slice(end + 4).replace(/^\n/, '')
  const meta: Record<string, string> = {}
  for (const line of fm.split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.*)$/)
    if (m) meta[m[1]!] = m[2]!.trim()
  }
  return { meta, body }
}

async function readJsonFile(abs: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(abs, 'utf8')) as unknown
  } catch {
    return null
  }
}

async function loadHooksFromPlugin(p: LoadedPlugin): Promise<HooksConfig> {
  if (p.error) return {}
  const candidates = [
    path.join(p.root, 'hooks.json'),
    path.join(p.root, 'hooks', 'hooks.json')
  ]
  for (const abs of p.extraHookFiles) {
    candidates.push(abs)
    candidates.push(path.join(abs, 'hooks.json'))
  }
  for (const file of candidates) {
    const json = await readJsonFile(file)
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      return json as HooksConfig
    }
  }
  return {}
}

async function loadMcpFromPlugin(
  p: LoadedPlugin
): Promise<Record<string, McpServerConfigJson>> {
  if (p.error || !p.mcpPath) return {}
  const json = await readJsonFile(p.mcpPath)
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {}
  const obj = json as Record<string, unknown>
  const map =
    obj.mcpServers && typeof obj.mcpServers === 'object' && !Array.isArray(obj.mcpServers)
      ? (obj.mcpServers as Record<string, McpServerConfigJson>)
      : (obj as Record<string, McpServerConfigJson>)
  const out: Record<string, McpServerConfigJson> = {}
  for (const [name, cfg] of Object.entries(map)) {
    if (!cfg || typeof cfg !== 'object') continue
    out[`${p.id}__${name}`] = cfg
  }
  return out
}

async function loadCommandsFromPlugin(p: LoadedPlugin): Promise<PluginSlashCommand[]> {
  if (p.error) return []
  const out: PluginSlashCommand[] = []
  for (const dir of p.extraCommandDirs) {
    let names: string[]
    try {
      names = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const file of names) {
      if (!/\.md$/i.test(file)) continue
      const abs = path.join(dir, file)
      try {
        const st = await fs.stat(abs)
        if (!st.isFile()) continue
        const raw = await fs.readFile(abs, 'utf8')
        const { meta, body } = parseSimpleFrontmatter(raw)
        const stem = file.replace(/\.md$/i, '')
        const name = (meta.name || stem).trim()
        if (!name || !/^[a-zA-Z][\w-]*$/.test(name)) continue
        out.push({
          name,
          description: meta.description || meta.desc || `plugin ${p.id}`,
          body: body.trim(),
          pluginId: p.id
        })
      } catch {
        /* skip bad command file */
      }
    }
  }
  return out
}

export async function buildPluginAugmentation(
  cwd: string
): Promise<PluginAugmentation> {
  const plugins = await loadLocalPlugins(cwd)
  let hooks: HooksConfig = {}
  const mcpServers: Record<string, McpServerConfigJson> = {}
  const slashCommands: PluginSlashCommand[] = []
  for (const p of plugins) {
    hooks = mergeHooksConfigs(hooks, await loadHooksFromPlugin(p))
    Object.assign(mcpServers, await loadMcpFromPlugin(p))
    slashCommands.push(...(await loadCommandsFromPlugin(p)))
  }
  return { hooks, mcpServers, slashCommands }
}

export function mergeMcpWithPlugins(
  base: Record<string, McpServerConfigJson>,
  plugin: Record<string, McpServerConfigJson>
): Record<string, McpServerConfigJson> {
  return { ...base, ...plugin }
}

export function formatPluginCommandFollowUp(
  cmd: PluginSlashCommand,
  args: string
): string {
  return [
    `[SYSTEM PLUGIN COMMAND — slash /${cmd.name} from ${cmd.pluginId}]`,
    'Follow the command body below. Do not ask whether to run it.',
    args ? `Arguments: ${args}` : '',
    '',
    cmd.body
  ]
    .filter(Boolean)
    .join('\n')
}

const augCache = new Map<string, PluginAugmentation>()

export async function refreshPluginAugmentation(cwd: string): Promise<PluginAugmentation> {
  const aug = await buildPluginAugmentation(cwd)
  augCache.set(path.resolve(cwd), aug)
  return aug
}

export function getCachedPluginAugmentation(cwd: string): PluginAugmentation {
  return (
    augCache.get(path.resolve(cwd)) ?? {
      hooks: {},
      mcpServers: {},
      slashCommands: []
    }
  )
}

export function findPluginSlashCommand(
  cwd: string,
  name: string
): PluginSlashCommand | undefined {
  return getCachedPluginAugmentation(cwd).slashCommands.find((c) => c.name === name)
}

export function getEffectiveHooks(base: HooksConfig, cwd: string): HooksConfig {
  return mergeHooksConfigs(base, getCachedPluginAugmentation(cwd).hooks)
}

export function getEffectiveMcpServers(
  base: Record<string, McpServerConfigJson>,
  cwd: string
): Record<string, McpServerConfigJson> {
  return mergeMcpWithPlugins(base, getCachedPluginAugmentation(cwd).mcpServers)
}
