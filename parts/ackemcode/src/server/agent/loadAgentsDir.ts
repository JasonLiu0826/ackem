/**
 * Custom agents from .claude/agents/*.md (CC loadAgentsDir spirit, simplified).
 * Frontmatter: name, description, tools, disallowedTools, maxTurns
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter } from '../skills/frontmatter.js'

export type CustomAgentDef = {
  name: string
  description: string
  /** Allowed tool names; empty = use general-purpose defaults */
  tools: string[]
  disallowedTools: string[]
  maxTurns?: number
  systemPrompt: string
  sourcePath: string
}

async function findGitRoot(start: string): Promise<string | null> {
  let dir = path.resolve(start)
  for (let i = 0; i < 40; i++) {
    try {
      await fs.access(path.join(dir, '.git'))
      return dir
    } catch {
      /* */
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function parseToolsList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,|\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

async function loadAgentsFromDir(dir: string): Promise<CustomAgentDef[]> {
  const out: CustomAgentDef[] = []
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    if (!e.endsWith('.md')) continue
    const abs = path.join(dir, e)
    let raw: string
    try {
      raw = await fs.readFile(abs, 'utf8')
    } catch {
      continue
    }
    const { frontmatter, body } = parseFrontmatter(raw)
    const name =
      (typeof frontmatter.name === 'string' && frontmatter.name.trim()) ||
      e.replace(/\.md$/i, '')
    const description =
      (typeof frontmatter.description === 'string' && frontmatter.description) ||
      `Custom agent ${name}`
    const tools = parseToolsList(frontmatter.tools)
    const disallowedTools = parseToolsList(frontmatter.disallowedTools)
    const maxTurns = frontmatter.maxTurns
      ? parseInt(frontmatter.maxTurns, 10)
      : undefined
    out.push({
      name,
      description,
      tools,
      disallowedTools,
      maxTurns: Number.isFinite(maxTurns) ? maxTurns : undefined,
      systemPrompt: body.trim() || `You are custom agent ${name}. Complete the task.`,
      sourcePath: abs
    })
  }
  return out
}

/** Load from cwd→gitRoot `.claude/agents` + `~/.claude/agents`. Later overrides earlier by name. */
export async function loadCustomAgents(cwd: string): Promise<CustomAgentDef[]> {
  const map = new Map<string, CustomAgentDef>()
  const home = process.env.HOME || process.env.USERPROFILE
  if (home) {
    for (const a of await loadAgentsFromDir(path.join(home, '.claude', 'agents'))) {
      map.set(a.name.toLowerCase(), a)
    }
  }
  const gitRoot = await findGitRoot(cwd)
  const dirs = [path.resolve(cwd)]
  if (gitRoot && path.resolve(gitRoot) !== path.resolve(cwd)) {
    dirs.unshift(path.resolve(gitRoot))
  }
  for (const d of dirs) {
    for (const a of await loadAgentsFromDir(path.join(d, '.claude', 'agents'))) {
      map.set(a.name.toLowerCase(), a)
    }
  }
  return [...map.values()]
}
