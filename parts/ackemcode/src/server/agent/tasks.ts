/**
 * Session task list (Task v2) — Claude Code utils/tasks.ts + Task* tools spirit.
 * Stable ids; incremental update; NOT cleared when all completed (unlike TodoWrite).
 *
 * Persistence (CC ~/.claude/tasks/<listId>/ spirit):
 *   ~/.ackemcode/tasks/{sessionId}/{id}.json + .highwatermark
 * Resume: TaskStore.open(sessionId) after process restart.
 * Reimplementation only; no Anthropic source paste.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type Task = {
  id: string
  subject: string
  description: string
  activeForm?: string
  owner?: string
  status: TaskStatus
  /** Task IDs this task blocks */
  blocks: string[]
  /** Task IDs that block this task */
  blockedBy: string[]
  metadata?: Record<string, unknown>
}

export type TaskCreateInput = {
  subject: string
  description: string
  activeForm?: string
  metadata?: Record<string, unknown>
}

export type TaskUpdateInput = {
  subject?: string
  description?: string
  activeForm?: string
  status?: TaskStatus | 'deleted'
  owner?: string
  addBlocks?: string[]
  addBlockedBy?: string[]
  metadata?: Record<string, unknown>
}

export function getTasksRoot(sessionId: string): string {
  if (process.env.ACKEM_TASKS_DIR?.trim()) {
    return path.join(path.resolve(process.env.ACKEM_TASKS_DIR.trim()), sessionId)
  }
  return path.join(os.homedir(), '.ackemcode', 'tasks', sessionId)
}

function taskFilePath(sessionId: string, taskId: string): string {
  return path.join(getTasksRoot(sessionId), `${taskId}.json`)
}

function highwatermarkPath(sessionId: string): string {
  return path.join(getTasksRoot(sessionId), '.highwatermark')
}

export async function clearTaskPersistence(sessionId: string): Promise<void> {
  try {
    await fs.rm(getTasksRoot(sessionId), { recursive: true, force: true })
  } catch (e) {
    console.error('taskStore clear failed', sessionId, e)
  }
}

export function clampPlanExploreAgents(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 2
  return Math.max(1, Math.min(10, Math.floor(v)))
}

/**
 * Soft gate before exit_plan_mode (PlanV2).
 * Trivial plans may pass force=true; otherwise require explore launches.
 * When required>1 and distinctFocusCount is provided, also require distinct foci.
 */
export function evaluatePlanExitGate(opts: {
  exploreCount: number
  required: number
  force?: boolean
  planChars?: number
  /** Distinct focus/perspective strings recorded this plan session. */
  distinctFocusCount?: number
}): { ok: true } | { ok: false; reason: string } {
  const required = clampPlanExploreAgents(opts.required)
  if (opts.force) return { ok: true }
  if ((opts.planChars ?? 0) > 0 && (opts.planChars ?? 0) < 120) {
    return { ok: true }
  }
  if (opts.exploreCount < required) {
    const fociHint =
      required > 1
        ? ` Give each Explore a distinct focus (e.g. ${suggestExplorePerspectives(required)
            .map((p) => `"${p}"`)
            .join(', ')}). Prefer a single turn with multiple agent(subagent_type=Explore) calls so they run in parallel.`
        : ''
    return {
      ok: false,
      reason: `PlanV2: launch at least ${required} read-only Explore agent(s) before exit_plan_mode (now ${opts.exploreCount}/${required}).${fociHint} Or pass force=true for a truly trivial plan.`
    }
  }
  // Harden multi-view: when caller supplies distinctFocusCount and required>1,
  // require at least min(required, 2) distinct foci (CC parallel perspectives spirit).
  if (
    required > 1 &&
    opts.distinctFocusCount !== undefined &&
    opts.distinctFocusCount < Math.min(required, 2)
  ) {
    const need = Math.min(required, 2)
    return {
      ok: false,
      reason: `PlanV2: multi-view needs ≥${need} distinct Explore focus values (now ${opts.distinctFocusCount}/${need}). Pass distinct \`focus\` on each agent(subagent_type=Explore), e.g. ${suggestExplorePerspectives(need)
        .map((p) => `"${p}"`)
        .join(' vs ')}. Or pass force=true for a truly trivial plan.`
    }
  }
  return { ok: true }
}

/** Suggested Explore lenses for Plan multi-view (CC Phase 1 focus spirit). */
export const DEFAULT_EXPLORE_PERSPECTIVES = [
  'existing implementations and call sites',
  'related modules, types, and data flow',
  'tests, fixtures, and edge cases',
  'config, permissions, and failure modes',
  'recent patterns and adjacent features'
] as const

export function suggestExplorePerspectives(count: number): string[] {
  const n = clampPlanExploreAgents(count)
  return DEFAULT_EXPLORE_PERSPECTIVES.slice(0, n).map(String)
}

/** Optional Phase-2 design lenses when synthesizing multiple Explores. */
export const DEFAULT_PLAN_DESIGN_PERSPECTIVES = [
  'simplicity / minimal diff',
  'correctness & edge cases',
  'maintainability / clean boundaries'
] as const

export function suggestDesignPerspectives(count: number): string[] {
  const n = Math.max(1, Math.min(DEFAULT_PLAN_DESIGN_PERSPECTIVES.length, Math.floor(count) || 1))
  return DEFAULT_PLAN_DESIGN_PERSPECTIVES.slice(0, n).map(String)
}

/** Count Explore sub-agent finishes recorded in tool transcripts (for smoke / gates). */
export function countExploreAgentResults(
  toolOutputs: Array<{ name: string; content: string }>
): number {
  let n = 0
  for (const t of toolOutputs) {
    if (t.name !== 'agent') continue
    const c = t.content
    if (
      /Sub-agent \[Explore\]/i.test(c) ||
      /subagentType=Explore/i.test(c) ||
      /\[Explore\]/.test(c)
    ) {
      n += 1
    }
  }
  return n
}

/** Count Plan sub-agent finishes (GM-PLAN). */
export function countPlanAgentResults(
  toolOutputs: Array<{ name: string; content: string }>
): number {
  let n = 0
  for (const t of toolOutputs) {
    if (t.name !== 'agent') continue
    const c = t.content
    if (
      /Sub-agent \[Plan\]/i.test(c) ||
      /subagentType=Plan/i.test(c) ||
      /\[Plan\]/.test(c)
    ) {
      n += 1
    }
  }
  return n
}

function cloneTask(t: Task): Task {
  return {
    ...t,
    blocks: [...t.blocks],
    blockedBy: [...t.blockedBy],
    metadata: t.metadata ? { ...t.metadata } : undefined
  }
}

/** Unresolved blocker ids (status !== completed). claimTask `blocked` spirit. */
export function openBlockersOf(
  tasks: ReadonlyMap<string, Task> | Iterable<Task>,
  task: Pick<Task, 'blockedBy'>
): string[] {
  const byId =
    tasks instanceof Map
      ? tasks
      : new Map(Array.from(tasks as Iterable<Task>, (t) => [t.id, t] as const))
  return task.blockedBy.filter((id) => {
    const b = byId.get(id)
    return Boolean(b && b.status !== 'completed')
  })
}

/**
 * True if adding edge from→to (from.blocks+=to) would create a cycle.
 */
export function wouldCreateBlockCycle(
  tasks: ReadonlyMap<string, Task>,
  fromTaskId: string,
  toTaskId: string
): boolean {
  const from = String(fromTaskId)
  const to = String(toTaskId)
  if (from === to) return true
  const visited = new Set<string>()
  const stack = [to]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === from) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    const node = tasks.get(cur)
    if (node) {
      for (const next of node.blocks) stack.push(next)
    }
  }
  return false
}

/**
 * CC TaskUpdate verification nudge spirit (no GrowthBook): all tasks completed,
 * list length ≥ 3, none of the subjects look like verification.
 */
export function shouldNudgeVerification(tasks: readonly Task[]): boolean {
  if (process.env.ACKEM_TASK_VERIFY_NUDGE === '0') return false
  if (tasks.length < 3) return false
  if (!tasks.every((t) => t.status === 'completed')) return false
  return !tasks.some((t) => /verif/i.test(t.subject))
}

/** Tasks that listed `completedId` as a blocker and are still open. */
export function tasksUnblockedBy(
  tasks: readonly Task[],
  completedId: string
): Task[] {
  const id = String(completedId)
  return tasks.filter(
    (t) =>
      t.id !== id &&
      t.status !== 'completed' &&
      t.blockedBy.includes(id)
  )
}

function parseTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<Task>
  if (typeof o.id !== 'string' || !o.id) return null
  if (typeof o.subject !== 'string' || typeof o.description !== 'string') return null
  const status = o.status
  if (status !== 'pending' && status !== 'in_progress' && status !== 'completed') {
    return null
  }
  return {
    id: o.id,
    subject: o.subject,
    description: o.description,
    activeForm: typeof o.activeForm === 'string' ? o.activeForm : undefined,
    owner: typeof o.owner === 'string' ? o.owner : undefined,
    status,
    blocks: Array.isArray(o.blocks)
      ? o.blocks.filter((x): x is string => typeof x === 'string')
      : [],
    blockedBy: Array.isArray(o.blockedBy)
      ? o.blockedBy.filter((x): x is string => typeof x === 'string')
      : [],
    metadata:
      o.metadata && typeof o.metadata === 'object' && !Array.isArray(o.metadata)
        ? { ...(o.metadata as Record<string, unknown>) }
        : undefined
  }
}

export class TaskStore {
  private tasks = new Map<string, Task>()
  private nextId = 1
  readonly sessionId?: string
  private persistChain: Promise<void> = Promise.resolve()

  constructor(sessionId?: string) {
    this.sessionId = sessionId
  }

  static async open(sessionId: string): Promise<TaskStore> {
    const store = new TaskStore(sessionId)
    await store.loadFromDisk()
    return store
  }

  async flush(): Promise<void> {
    await this.persistChain
  }

  private queuePersist(): void {
    if (!this.sessionId) return
    const sid = this.sessionId
    this.persistChain = this.persistChain
      .then(() => this.writeAllToDisk(sid))
      .catch((e) => {
        console.error('taskStore persist failed', sid, e)
      })
  }

  private async writeAllToDisk(sid: string): Promise<void> {
    const dir = getTasksRoot(sid)
    await fs.mkdir(dir, { recursive: true })
    let existing: string[] = []
    try {
      existing = await fs.readdir(dir)
    } catch {
      existing = []
    }
    for (const name of existing) {
      if (!name.endsWith('.json')) continue
      const id = name.replace(/\.json$/, '')
      if (!this.tasks.has(id)) {
        await fs.unlink(path.join(dir, name)).catch(() => {})
      }
    }
    for (const task of this.tasks.values()) {
      const file = taskFilePath(sid, task.id)
      const tmp = `${file}.${process.pid}.tmp`
      await fs.writeFile(tmp, JSON.stringify(cloneTask(task), null, 2), 'utf8')
      await fs.rename(tmp, file)
    }
    const hw = highwatermarkPath(sid)
    const hwTmp = `${hw}.${process.pid}.tmp`
    await fs.writeFile(hwTmp, String(Math.max(0, this.nextId - 1)), 'utf8')
    await fs.rename(hwTmp, hw)
  }

  private async loadFromDisk(): Promise<void> {
    if (!this.sessionId) return
    const dir = getTasksRoot(this.sessionId)
    let names: string[]
    try {
      names = await fs.readdir(dir)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return
      throw e
    }
    let maxId = 0
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      try {
        const raw = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'))
        const task = parseTask(raw)
        if (!task) continue
        this.tasks.set(task.id, task)
        const n = Number(task.id)
        if (Number.isFinite(n)) maxId = Math.max(maxId, n)
      } catch {
        /* skip */
      }
    }
    try {
      const hw = Number(
        (await fs.readFile(highwatermarkPath(this.sessionId), 'utf8')).trim()
      )
      if (Number.isFinite(hw)) maxId = Math.max(maxId, hw)
    } catch {
      /* no watermark */
    }
    this.nextId = maxId + 1
  }

  clear(): void {
    this.tasks.clear()
    this.nextId = 1
    this.queuePersist()
  }

  exportState(): { nextId: number; tasks: Task[] } {
    return {
      nextId: this.nextId,
      tasks: this.list(true).map(cloneTask)
    }
  }

  importState(state: { nextId?: number; tasks?: Task[] }): void {
    this.tasks.clear()
    for (const t of state.tasks ?? []) {
      const parsed = parseTask(t)
      if (parsed) this.tasks.set(parsed.id, parsed)
    }
    if (typeof state.nextId === 'number' && state.nextId >= 1) {
      this.nextId = Math.floor(state.nextId)
    } else {
      let maxId = 0
      for (const id of this.tasks.keys()) {
        const n = Number(id)
        if (Number.isFinite(n)) maxId = Math.max(maxId, n)
      }
      this.nextId = maxId + 1
    }
  }

  list(includeInternal = false): Task[] {
    const all = [...this.tasks.values()].sort(
      (a, b) => Number(a.id) - Number(b.id)
    )
    if (includeInternal) return all
    return all.filter((t) => !t.metadata?._internal)
  }

  get(taskId: string): Task | undefined {
    return this.tasks.get(String(taskId))
  }

  create(input: TaskCreateInput): Task {
    const subject = String(input.subject ?? '').trim()
    const description = String(input.description ?? '').trim()
    if (!subject) throw new Error('subject required')
    if (!description) throw new Error('description required')
    const id = String(this.nextId++)
    const task: Task = {
      id,
      subject,
      description,
      activeForm: input.activeForm?.trim() || undefined,
      status: 'pending',
      blocks: [],
      blockedBy: [],
      metadata: input.metadata ? { ...input.metadata } : undefined
    }
    this.tasks.set(id, task)
    this.queuePersist()
    return cloneTask(task)
  }

  update(
    taskId: string,
    patch: TaskUpdateInput
  ): {
    success: boolean
    task?: Task
    updatedFields: string[]
    error?: string
    statusChange?: { from: string; to: string }
  } {
    const existing = this.tasks.get(String(taskId))
    if (!existing) {
      return { success: false, updatedFields: [], error: 'Task not found' }
    }

    if (patch.status === 'deleted') {
      this.tasks.delete(existing.id)
      for (const t of this.tasks.values()) {
        t.blocks = t.blocks.filter((id) => id !== existing.id)
        t.blockedBy = t.blockedBy.filter((id) => id !== existing.id)
      }
      this.queuePersist()
      return {
        success: true,
        updatedFields: ['deleted'],
        statusChange: { from: existing.status, to: 'deleted' }
      }
    }

    const updatedFields: string[] = []
    const statusChange =
      patch.status !== undefined && patch.status !== existing.status
        ? { from: existing.status, to: patch.status }
        : undefined

    if (patch.subject !== undefined && patch.subject !== existing.subject) {
      existing.subject = String(patch.subject).trim()
      updatedFields.push('subject')
    }
    if (
      patch.description !== undefined &&
      patch.description !== existing.description
    ) {
      existing.description = String(patch.description).trim()
      updatedFields.push('description')
    }
    if (
      patch.activeForm !== undefined &&
      patch.activeForm !== existing.activeForm
    ) {
      existing.activeForm = String(patch.activeForm).trim() || undefined
      updatedFields.push('activeForm')
    }
    if (patch.owner !== undefined && patch.owner !== existing.owner) {
      existing.owner = String(patch.owner).trim() || undefined
      updatedFields.push('owner')
    }
    if (patch.status !== undefined && patch.status !== existing.status) {
      if (
        patch.status !== 'pending' &&
        patch.status !== 'in_progress' &&
        patch.status !== 'completed'
      ) {
        return {
          success: false,
          updatedFields: [],
          error: `Invalid status: ${patch.status}`
        }
      }
      // Refuse start/complete while open blockers remain (claimTask blocked spirit).
      if (patch.status === 'in_progress' || patch.status === 'completed') {
        const open = openBlockersOf(this.tasks, existing)
        if (open.length > 0) {
          return {
            success: false,
            updatedFields: [],
            error: `Task #${existing.id} is blocked by unresolved tasks: ${open.join(', ')}. Complete blockers first (or remove the dependency).`
          }
        }
      }
      existing.status = patch.status
      updatedFields.push('status')
    }
    if (patch.metadata !== undefined) {
      const merged = { ...(existing.metadata ?? {}) }
      for (const [k, v] of Object.entries(patch.metadata)) {
        if (v === null) delete merged[k]
        else merged[k] = v
      }
      existing.metadata = Object.keys(merged).length ? merged : undefined
      updatedFields.push('metadata')
    }

    if (patch.addBlocks?.length) {
      for (const toId of patch.addBlocks) {
        const br = this.block(existing.id, String(toId), false)
        if (!br.ok) {
          return { success: false, updatedFields: [], error: br.error }
        }
      }
      updatedFields.push('blocks')
    }
    if (patch.addBlockedBy?.length) {
      for (const fromId of patch.addBlockedBy) {
        const br = this.block(String(fromId), existing.id, false)
        if (!br.ok) {
          return { success: false, updatedFields: [], error: br.error }
        }
      }
      updatedFields.push('blockedBy')
    }

    this.queuePersist()
    return {
      success: true,
      task: cloneTask(existing),
      updatedFields,
      statusChange
    }
  }

  /**
   * A blocks B → A.blocks+=B, B.blockedBy+=A.
   * Rejects missing ids, self-edges, and cycles.
   */
  block(
    fromTaskId: string,
    toTaskId: string,
    persist = true
  ): { ok: true } | { ok: false; error: string } {
    const from = this.tasks.get(String(fromTaskId))
    const to = this.tasks.get(String(toTaskId))
    if (!from || !to) {
      return { ok: false, error: 'Both tasks must exist to add a dependency' }
    }
    if (from.id === to.id) {
      return { ok: false, error: 'A task cannot block itself' }
    }
    if (wouldCreateBlockCycle(this.tasks, from.id, to.id)) {
      return {
        ok: false,
        error: `Adding #${from.id}→#${to.id} would create a dependency cycle`
      }
    }
    if (!from.blocks.includes(to.id)) from.blocks.push(to.id)
    if (!to.blockedBy.includes(from.id)) to.blockedBy.push(from.id)
    if (persist) this.queuePersist()
    return { ok: true }
  }

  listForTool(): Array<{
    id: string
    subject: string
    status: TaskStatus
    owner?: string
    blockedBy: string[]
  }> {
    const all = this.list()
    const resolved = new Set(
      all.filter((t) => t.status === 'completed').map((t) => t.id)
    )
    return all.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      owner: t.owner,
      blockedBy: t.blockedBy.filter((id) => !resolved.has(id))
    }))
  }
}

export function formatTaskList(tasks: Task[]): string {
  if (!tasks.length) return '(no tasks)'
  return tasks
    .map((t) => {
      const mark =
        t.status === 'completed'
          ? '[x]'
          : t.status === 'in_progress'
            ? '[~]'
            : '[ ]'
      const deps =
        t.blockedBy.length > 0 ? ` blockedBy=[${t.blockedBy.join(',')}]` : ''
      return `#${t.id} ${mark} ${t.subject} (${t.status})${deps}`
    })
    .join('\n')
}

/** Plan-mode workflow blurb (CC getPlanModeV2Instructions Phase 1–2 spirit). */
export function buildPlanModeV2Guidance(
  exploreAgentCount: number,
  opts?: { planFilePath?: string; interviewPhase?: boolean }
): string {
  const n = clampPlanExploreAgents(exploreAgentCount)
  const fp = opts?.planFilePath?.trim()
  const interview = opts?.interviewPhase !== false
  const planFileBlock = fp
    ? interview
      ? `\n## Plan file (only editable file in plan mode)\nPath: \`${fp}\`\nUpdate incrementally with write_file / search_replace.\n`
      : `\n## Plan file\nPath: \`${fp}\` (optional draft; exit_plan_mode reads disk if plan arg omitted)\n`
    : ''
  const perspectives = suggestExplorePerspectives(n)
  const focusLines = perspectives
    .map((p, i) => `  ${i + 1}. focus="${p}"`)
    .join('\n')
  const designLenses = suggestDesignPerspectives(
    DEFAULT_PLAN_DESIGN_PERSPECTIVES.length
  )
    .map((p, i) => `  ${i + 1}. focus="${p}"`)
    .join('\n')
  return `Plan mode is active (PlanV2 · multi-view). Do NOT edit project files or run mutating tools until exit_plan_mode is approved.
${planFileBlock}
## Plan workflow
### Phase 1 — Multi-view Explore (parallel)
Launch up to ${n} Explore agents IN PARALLEL in a **single assistant turn** (multiple agent tool_use blocks). They are concurrency-safe and will run together.
- Use 1 Explore when the task is isolated to known files.
- Use multiple (up to ${n}) when scope is uncertain or spans several areas.
- Prefer agent with subagent_type=Explore (read-only). Pass distinct \`focus\` (required for multi-view exit gate when ${n}>1).
Suggested foci for this session:
${focusLines}
Example (same turn):
  agent({ subagent_type: "Explore", focus: "...", prompt: "..." })
  agent({ subagent_type: "Explore", focus: "...", prompt: "..." })

### Phase 2 — Design (Plan agents + synthesize)
Launch read-only Plan agents (subagent_type=Plan) with distinct design lenses, then merge into one concrete markdown plan (files, steps, risks, tests).
Plan agents are concurrency-safe like Explore. Suggested lenses:
${designLenses}
Example:
  agent({ subagent_type: "Plan", focus: "simplicity / minimal diff", prompt: "Design approach given Explore findings…" })
Do not dump raw tool logs — relay essentials. End each Plan report with Critical Files.

### Phase 3 — Exit
Call exit_plan_mode with the plan. Soft gate: ≥${n} Explore launches` +
    (n > 1
      ? ` with ≥${Math.min(n, 2)} distinct focus values`
      : '') +
    ` unless the plan is trivial (then force=true).`
}
