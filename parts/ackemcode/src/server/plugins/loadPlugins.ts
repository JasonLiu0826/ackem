/**
 * Local plugin manifest loader (F-07). No marketplace.
 * ~/.ackemcode/plugins/<id>/plugin.json
 * {cwd}/.ackemcode/plugins/<id>/plugin.json
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { getAckemHome } from '../memdir/paths.js'

export type LoadedPlugin = {
  id: string
  name: string
  version: string
  root: string
  scope: 'user' | 'project'
  extraSkillDirs: string[]
  extraCommandDirs: string[]
  extraHookFiles: string[]
  mcpPath?: string
  error?: string
}

type PluginJson = {
  name?: string
  version?: string
  commands?: string
  hooks?: string
  skills?: string
  mcp?: string
}

async function scanRoot(root: string, scope: 'user' | 'project'): Promise<LoadedPlugin[]> {
  let names: string[]
  try {
    names = await fs.readdir(root)
  } catch {
    return []
  }
  const out: LoadedPlugin[] = []
  for (const id of names) {
    const dir = path.join(root, id)
    const manifest = path.join(dir, 'plugin.json')
    try {
      const st = await fs.stat(dir)
      if (!st.isDirectory()) continue
      const raw = await fs.readFile(manifest, 'utf8')
      const json = JSON.parse(raw) as PluginJson
      const extraSkillDirs: string[] = []
      const extraCommandDirs: string[] = []
      const extraHookFiles: string[] = []
      const skillsRel = json.skills || 'skills'
      const commandsRel = json.commands || 'commands'
      const hooksRel = json.hooks || 'hooks'
      extraSkillDirs.push(path.join(dir, skillsRel))
      extraCommandDirs.push(path.join(dir, commandsRel))
      extraHookFiles.push(path.join(dir, hooksRel))
      out.push({
        id,
        name: json.name || id,
        version: json.version || '0.0.0',
        root: dir,
        scope,
        extraSkillDirs,
        extraCommandDirs,
        extraHookFiles,
        mcpPath: json.mcp ? path.join(dir, json.mcp) : path.join(dir, '.mcp.json')
      })
    } catch (e) {
      out.push({
        id,
        name: id,
        version: '0',
        root: dir,
        scope,
        extraSkillDirs: [],
        extraCommandDirs: [],
        extraHookFiles: [],
        error: e instanceof Error ? e.message : String(e)
      })
    }
  }
  return out
}

export async function loadLocalPlugins(cwd: string): Promise<LoadedPlugin[]> {
  const userRoot = path.join(getAckemHome(), 'plugins')
  const projectRoot = path.join(cwd, '.ackemcode', 'plugins')
  const [user, project] = await Promise.all([
    scanRoot(userRoot, 'user'),
    scanRoot(projectRoot, 'project')
  ])
  return [...user, ...project]
}

export function pluginSkillDirs(plugins: LoadedPlugin[]): string[] {
  return plugins.filter((p) => !p.error).flatMap((p) => p.extraSkillDirs)
}

export function formatPluginListing(
  plugins: LoadedPlugin[],
  aug?: {
    slashCommands: Array<{ name: string; pluginId: string }>
    mcpServers: Record<string, unknown>
    hooks: Record<string, unknown[] | undefined>
  }
): string {
  if (!plugins.length) return '(no local plugins)'
  return plugins
    .map((p) => {
      if (p.error) return `${p.scope}/${p.id}  ERROR ${p.error}`
      const cmds =
        aug?.slashCommands.filter((c) => c.pluginId === p.id).length ?? 0
      const mcps = aug
        ? Object.keys(aug.mcpServers).filter((k) => k.startsWith(`${p.id}__`))
            .length
        : 0
      const hookEvents = aug
        ? Object.values(aug.hooks).filter((g) => g?.length).length
        : 0
      const extra =
        aug && (cmds || mcps || hookEvents)
          ? `  hooks:${hookEvents} mcp:${mcps} cmd:${cmds}`
          : ''
      return `${p.scope}/${p.id}  ${p.name}@${p.version}${extra}`
    })
    .join('\n')
}
