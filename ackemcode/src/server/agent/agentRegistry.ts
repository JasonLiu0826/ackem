/**
 * In-session sidechain registry — Claude Code resumeAgent / agentId spirit.
 *
 * Persistence (CC sidechain transcript spirit, Ackem layout):
 *   ~/.ackemcode/agents/{sessionId}/agent-{id}.json
 * Resume: AgentRegistry.open(sessionId) reloads so agent({ agentId }) works after restart.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ChatMessage } from '../../shared/types.js'

export type RegisteredAgent = {
  agentId: string
  name: string
  description: string
  subagentType: string
  /** 0 = main session; 1 = first-level child; ≥2 rejected for nesting */
  depth: number
  /** True if this agent was created via fork (shared parent prefix) */
  isFork: boolean
  createdAt: number
  updatedAt: number
  /** Sidechain messages (system + turns), excluding ephemeral parent-only noise */
  transcript: ChatMessage[]
  lastSummary?: string
  /** K4: spawn-time isolation tree (resume re-enters if still on disk). */
  isolationWorktreePath?: string
  isolationWorktreeBranch?: string
  isolationOriginalCwd?: string
  isolationOriginalHeadCommit?: string
  isolationWorktreeName?: string
}

const AGENTS_STATE_VERSION = 1

export function getAgentsRoot(sessionId: string): string {
  if (process.env.ACKEM_AGENTS_DIR?.trim()) {
    return path.join(path.resolve(process.env.ACKEM_AGENTS_DIR.trim()), sessionId)
  }
  return path.join(os.homedir(), '.ackemcode', 'agents', sessionId)
}

function agentFilePath(sessionId: string, agentId: string): string {
  const safe = agentId.replace(/[^A-Za-z0-9_-]/g, '_')
  return path.join(getAgentsRoot(sessionId), `agent-${safe}.json`)
}

export function serializeRegisteredAgent(a: RegisteredAgent): RegisteredAgent {
  return {
    agentId: a.agentId,
    name: a.name,
    description: a.description,
    subagentType: a.subagentType,
    depth: a.depth,
    isFork: a.isFork,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    transcript: [...a.transcript],
    lastSummary: a.lastSummary,
    isolationWorktreePath: a.isolationWorktreePath,
    isolationWorktreeBranch: a.isolationWorktreeBranch,
    isolationOriginalCwd: a.isolationOriginalCwd,
    isolationOriginalHeadCommit: a.isolationOriginalHeadCommit,
    isolationWorktreeName: a.isolationWorktreeName
  }
}

export function parseRegisteredAgent(raw: unknown): RegisteredAgent | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<RegisteredAgent> & { version?: number }
  if (typeof o.agentId !== 'string' || !o.agentId) return null
  if (!Array.isArray(o.transcript)) return null
  return {
    agentId: o.agentId,
    name: typeof o.name === 'string' ? o.name : o.agentId,
    description: typeof o.description === 'string' ? o.description : '',
    subagentType: typeof o.subagentType === 'string' ? o.subagentType : 'general-purpose',
    depth: typeof o.depth === 'number' ? o.depth : 1,
    isFork: Boolean(o.isFork),
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
    transcript: o.transcript as ChatMessage[],
    lastSummary: typeof o.lastSummary === 'string' ? o.lastSummary : undefined,
    isolationWorktreePath:
      typeof o.isolationWorktreePath === 'string' ? o.isolationWorktreePath : undefined,
    isolationWorktreeBranch:
      typeof o.isolationWorktreeBranch === 'string'
        ? o.isolationWorktreeBranch
        : undefined,
    isolationOriginalCwd:
      typeof o.isolationOriginalCwd === 'string' ? o.isolationOriginalCwd : undefined,
    isolationOriginalHeadCommit:
      typeof o.isolationOriginalHeadCommit === 'string'
        ? o.isolationOriginalHeadCommit
        : undefined,
    isolationWorktreeName:
      typeof o.isolationWorktreeName === 'string' ? o.isolationWorktreeName : undefined
  }
}

export async function clearAgentPersistence(sessionId: string): Promise<void> {
  try {
    await fs.rm(getAgentsRoot(sessionId), { recursive: true, force: true })
  } catch (e) {
    console.error('agentRegistry clear failed', sessionId, e)
  }
}

export class AgentRegistry {
  private agents = new Map<string, RegisteredAgent>()
  readonly sessionId?: string
  private persistChain: Promise<void> = Promise.resolve()

  constructor(sessionId?: string) {
    this.sessionId = sessionId
  }

  /** Resume after process restart — load agent-*.json under session dir. */
  static async open(sessionId: string): Promise<AgentRegistry> {
    const reg = new AgentRegistry(sessionId)
    await reg.loadFromDisk()
    return reg
  }

  async flush(): Promise<void> {
    await this.persistChain
  }

  private queuePersistAgent(agentId: string): void {
    if (!this.sessionId) return
    const sid = this.sessionId
    this.persistChain = this.persistChain
      .then(async () => {
        const cur = this.agents.get(agentId)
        if (!cur) return
        const dir = getAgentsRoot(sid)
        await fs.mkdir(dir, { recursive: true })
        const file = agentFilePath(sid, agentId)
        const tmp = `${file}.${process.pid}.tmp`
        const payload = {
          version: AGENTS_STATE_VERSION,
          ...serializeRegisteredAgent(cur)
        }
        await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8')
        await fs.rename(tmp, file)
      })
      .catch((e) => {
        console.error('agentRegistry persist failed', sid, agentId, e)
      })
  }

  private async loadFromDisk(): Promise<void> {
    if (!this.sessionId) return
    const dir = getAgentsRoot(this.sessionId)
    let names: string[]
    try {
      names = await fs.readdir(dir)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return
      throw e
    }
    for (const name of names) {
      if (!name.startsWith('agent-') || !name.endsWith('.json')) continue
      try {
        const raw = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'))
        const parsed = parseRegisteredAgent(raw)
        if (parsed) this.agents.set(parsed.agentId, parsed)
      } catch {
        /* skip corrupt */
      }
    }
  }

  list(): RegisteredAgent[] {
    return [...this.agents.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  get(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId)
  }

  /** Snapshot for session JSON / tests. */
  exportAll(): RegisteredAgent[] {
    return this.list().map(serializeRegisteredAgent)
  }

  /** Replace in-memory map (tests / optional session embed). */
  importAll(agents: RegisteredAgent[]): void {
    this.agents.clear()
    for (const a of agents) {
      const parsed = parseRegisteredAgent(a)
      if (parsed) this.agents.set(parsed.agentId, parsed)
    }
  }

  register(entry: Omit<RegisteredAgent, 'createdAt' | 'updatedAt'> & {
    createdAt?: number
    updatedAt?: number
  }): RegisteredAgent {
    const now = Date.now()
    const full: RegisteredAgent = {
      ...entry,
      createdAt: entry.createdAt ?? now,
      updatedAt: entry.updatedAt ?? now,
      transcript: [...entry.transcript]
    }
    this.agents.set(full.agentId, full)
    this.queuePersistAgent(full.agentId)
    return full
  }

  /** Replace transcript after a run (resume continues from this). */
  updateTranscript(
    agentId: string,
    transcript: ChatMessage[],
    lastSummary?: string
  ): void {
    const cur = this.agents.get(agentId)
    if (!cur) return
    cur.transcript = [...transcript]
    cur.updatedAt = Date.now()
    if (lastSummary !== undefined) cur.lastSummary = lastSummary
    this.queuePersistAgent(agentId)
  }

  updateIsolation(
    agentId: string,
    fields: Pick<
      RegisteredAgent,
      | 'isolationWorktreePath'
      | 'isolationWorktreeBranch'
      | 'isolationOriginalCwd'
      | 'isolationOriginalHeadCommit'
      | 'isolationWorktreeName'
    >
  ): void {
    const cur = this.agents.get(agentId)
    if (!cur) return
    cur.isolationWorktreePath = fields.isolationWorktreePath
    cur.isolationWorktreeBranch = fields.isolationWorktreeBranch
    cur.isolationOriginalCwd = fields.isolationOriginalCwd
    cur.isolationOriginalHeadCommit = fields.isolationOriginalHeadCommit
    cur.isolationWorktreeName = fields.isolationWorktreeName
    cur.updatedAt = Date.now()
    this.queuePersistAgent(agentId)
  }

  clear(): void {
    this.agents.clear()
  }
}
