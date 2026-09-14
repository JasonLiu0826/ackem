import type {
  PermissionDecisionKind,
  PermissionDecisionPayload,
  PermissionMode
} from '../../shared/types.js'
import { isMcpToolName, parseMcpToolName } from '../mcp/types.js'
import { PLAYWRIGHT_EDGE_SERVER } from '../mcp/seedPresets.js'
import { isReadOnlyTool } from '../tools/registry.js'
import {
  classifyToolRisk,
  riskBlocksAutoAllow,
  type RiskClassification
} from './dangerousPatterns.js'
import {
  isAutoAllowBashIfSandboxedEnabled,
  shouldSandboxCommand
} from '../sandbox/index.js'
import {
  findMatchingRule,
  normalizeToolName,
  permissionRuleValueFromString,
  ruleMatches,
  type PermissionRulesConfig,
  type ParsedPermissionRule
} from './permissionRules.js'
import {
  applyClassifierDenialOutcome,
  createDenialTrackingState,
  shouldFallbackToPrompting,
  type DenialTrackingState
} from './denialTracking.js'
import { validateToolPathForMode } from './pathValidation.js'
import { filePathOutsideWorkingDirs } from './filePermissions.js'
import { evaluateShellPathPermission } from './shellPathPermissions.js'
import path from 'node:path'
import {
  isDeleteOperation,
  permissionClass,
  permissionClassKey
} from '../../shared/permissionClass.js'

export type PermissionEvalBehavior = 'allow' | 'deny' | 'ask'

export type PermissionEvalResult = {
  behavior: PermissionEvalBehavior
  reason: string
  matchedRule?: ParsedPermissionRule
  /** Plan-mode hard block (mutating) */
  planDenied?: boolean
  /**
   * Auto mode: gray-zone ask that may be resolved by the LLM classifier
   * (CC classifyYoloAction candidate). High/critical risk never sets this.
   */
  classifierCandidate?: boolean
}

/** Window allow marker: this CLI process; delete-shaped ops still ask. */
export const ALWAYS_ALLOW_REGULAR_TOOLS_RULE = '*'

const WRITE_TOOLS = new Set([
  'write_file',
  'search_replace',
  'notebook_edit',
  'document_edit',
  'document_convert',
  'install_skill',
  'uninstall_skill'
])
const EXEC_TOOLS = new Set(['bash', 'powershell', 'verify_delivery'])
const NETWORK_TOOLS = new Set(['web_fetch', 'web_search'])
const MCP_META = new Set(['list_mcp_resources', 'read_mcp_resource'])
const WORKTREE_TOOLS = new Set(['enter_worktree', 'exit_worktree'])
const CRON_MUTATE = new Set(['cron_create', 'cron_delete'])
/** Auto-mode must not silently allow MCP/skill surface expansion. */
const SKILL_MCP_ADMIN = new Set(['invoke_skill', 'manage_mcp'])

const DONT_ASK_REJECT =
  "Don't Ask mode is active: this action would require approval, so it was denied. Switch to default or acceptEdits to allow prompts."

const PLAN_DENY =
  'Plan mode is active: mutating/exec tools are blocked. Finish exploring, then call exit_plan_mode with your plan.'

const PLAN_FILE_ONLY_DENY =
  'Plan mode: only the session plan file may be edited. Update the plan file, then call exit_plan_mode.'

/**
 * Would this tool ask the user in **default** mode (ignoring rules/session)?
 * Used after rule checks for mode transformations.
 */
export function isPlanFileMutation(
  toolName: string,
  input: unknown,
  planFilePath: string | null | undefined,
  cwd: string
): boolean {
  if (!planFilePath?.trim()) return false
  const name = normalizeToolName(toolName)
  if (!WRITE_TOOLS.has(name)) return false
  const obj =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {}
  const p = String(obj.path ?? obj.file_path ?? '').trim()
  if (!p) return false
  try {
    const abs = path.isAbsolute(p) ? p : path.resolve(cwd, p)
    return path.resolve(abs) === path.resolve(planFilePath)
  } catch {
    return false
  }
}

export function isPlaywrightEdgeTool(toolName: string): boolean {
  const parsed = parseMcpToolName(toolName)
  return parsed?.server === PLAYWRIGHT_EDGE_SERVER
}

export function isPlaywrightUnsafeScriptTool(toolName: string): boolean {
  if (!isMcpToolName(toolName)) return false
  return /run_code_unsafe|evaluate/i.test(toolName)
}

export function isSensitiveTool(toolName: string, input?: unknown): boolean {
  const name = normalizeToolName(toolName)
  const isMcp = isMcpToolName(name) || MCP_META.has(name)
  if (EXEC_TOOLS.has(name) && isReadOnlyTool(name, input)) return false
  return (
    WRITE_TOOLS.has(name) ||
    EXEC_TOOLS.has(name) ||
    NETWORK_TOOLS.has(name) ||
    WORKTREE_TOOLS.has(name) ||
    CRON_MUTATE.has(name) ||
    SKILL_MCP_ADMIN.has(name) ||
    isMcp ||
    name === 'agent'
  )
}

function askOrDontAsk(mode: PermissionMode, reason: string): PermissionEvalResult {
  if (mode === 'dontAsk') {
    return { behavior: 'deny', reason: DONT_ASK_REJECT }
  }
  return { behavior: 'ask', reason }
}

/**
 * Core decision — Claude Code hasPermissionsToUseToolInner spirit (simplified):
 * 1) deny rules
 * 2) S13 risk gate (critical deny; high blocks auto-allow; classifier throw → fail-closed)
 * 2w) window allow (`*`) — skip all prompts except delete-shaped ops
 * 2b) session tool-class allow (allow_session) — skips even high risk / playwright
 * 3) allow rules / session *  4) ask rules
 * 5) mode: bypass→allow · plan→deny non-readonly · dontAsk→deny if would ask
 * 6) acceptEdits / auto: in-project writes auto-allow; auto gray-zone → classifierCandidate
 * 7) else sensitive→ask / safe→allow
 */
export function evaluatePermission(opts: {
  toolName: string
  input?: unknown
  mode: PermissionMode
  rules: PermissionRulesConfig
  sessionAllows: (toolName: string, input?: unknown) => boolean
  /**
   * allow_session: this tool class is trusted for the rest of the session
   * (including high-risk). Critical is still denied above.
   */
  sessionToolClassAllows?: (toolName: string) => boolean
  /** Working directory for path-scoped acceptEdits (S13). */
  cwd?: string
  /** Session-granted dirs outside cwd (CC additionalWorkingDirectories). */
  additionalWorkingDirectories?: readonly string[]
  /** Absolute plan file path — interview phase allows write/edit to this file only. */
  planFilePath?: string | null
  planModeInterviewPhase?: boolean
  /** User configured web search (/web-set or env) — skip ask for web_search. */
  webSearchConfigured?: boolean
  /** Test/injectable classifier; defaults to classifyToolRisk. */
  riskClassify?: (args: {
    toolName: string
    input?: unknown
    cwd?: string
    additionalWorkingDirectories?: readonly string[]
  }) => RiskClassification
}): PermissionEvalResult {
  const toolName = normalizeToolName(opts.toolName)
  const { input, mode, rules } = opts
  const classify = opts.riskClassify ?? classifyToolRisk

  // 1) Deny rules win
  const denied = findMatchingRule(rules.deny, toolName, input)
  if (denied) {
    return {
      behavior: 'deny',
      reason: `Denied by rule: ${denied.raw}`,
      matchedRule: denied
    }
  }

  // 1b) Configured web tools — user opted in via /web-set; do not block on permission UI
  if (
    (toolName === 'web_search' || toolName === 'web_fetch') &&
    opts.webSearchConfigured &&
    mode !== 'dontAsk'
  ) {
    return {
      behavior: 'allow',
      reason: 'Web search/fetch configured — no confirmation needed'
    }
  }

  // 2) Risk gate — before allow/session (CC pathSafety before working-dir allow)
  let risk: RiskClassification
  try {
    risk = classify({
      toolName,
      input,
      cwd: opts.cwd,
      additionalWorkingDirectories: opts.additionalWorkingDirectories
    })
  } catch (e) {
    // Fail-closed: never default-allow when classifier breaks
    return askOrDontAsk(
      mode,
      `Permission classifier failed (fail-closed): ${
        e instanceof Error ? e.message : String(e)
      }`
    )
  }

  if (risk.level === 'critical' && mode !== 'bypassPermissions') {
    return { behavior: 'deny', reason: risk.reason }
  }

  // Plan hard-block before high-risk ask / allow shortcuts
  if (mode === 'plan' && !isReadOnlyTool(toolName, input)) {
    const interview = opts.planModeInterviewPhase !== false
    if (
      interview &&
      isPlanFileMutation(toolName, input, opts.planFilePath, opts.cwd ?? '')
    ) {
      // CC interview: plan file is the only writable target
    } else {
      return {
        behavior: 'deny',
        reason: interview && opts.planFilePath ? PLAN_FILE_ONLY_DENY : PLAN_DENY,
        planDenied: true
      }
    }
  }

  // 2w) This CLI window — skip prompts except delete-shaped ops
  if (opts.sessionAllows('*', input) && !isDeleteOperation(toolName, input)) {
    return { behavior: 'allow', reason: 'Allowed for this window (except deletes)' }
  }

  // 2b) Session type allow — same operation class (docs / web / browser / …)
  if (opts.sessionToolClassAllows?.(toolName)) {
    return { behavior: 'allow', reason: 'Allowed for this session (tool class)' }
  }

  if (
    (isPlaywrightEdgeTool(toolName) || isPlaywrightUnsafeScriptTool(toolName)) &&
    mode !== 'bypassPermissions'
  ) {
    return askOrDontAsk(
      mode,
      isPlaywrightUnsafeScriptTool(toolName)
        ? `${toolName} runs arbitrary script — always confirm`
        : `${toolName} drives the user's signed-in Edge — always confirm`
    )
  }

  const blocksAuto = riskBlocksAutoAllow(risk.level)

  // 3) Allow rules / session * / granular session (blocked for high/critical)
  if (!blocksAuto) {
    if (opts.sessionAllows(toolName, input) || opts.sessionAllows('*', input)) {
      return { behavior: 'allow', reason: 'Allowed for this session' }
    }
    const allowed = findMatchingRule(rules.allow, toolName, input)
    if (allowed) {
      return {
        behavior: 'allow',
        reason: `Allowed by rule: ${allowed.raw}`,
        matchedRule: allowed
      }
    }
  } else if (mode !== 'bypassPermissions') {
    if (
      mode === 'plan' &&
      isPlanFileMutation(toolName, input, opts.planFilePath, opts.cwd ?? '')
    ) {
      return {
        behavior: 'allow',
        reason: 'Plan interview file (home plans dir is outside cwd)'
      }
    }
    // High risk: still ask (or deny under dontAsk) even if allow rules exist
    return askOrDontAsk(mode, risk.reason)
  }

  // 4) Explicit ask rules
  const askRule = findMatchingRule(rules.ask, toolName, input)
  if (askRule) {
    if (mode === 'bypassPermissions') {
      return { behavior: 'allow', reason: 'bypassPermissions mode', matchedRule: askRule }
    }
    if (mode === 'dontAsk') {
      return {
        behavior: 'deny',
        reason: DONT_ASK_REJECT,
        matchedRule: askRule
      }
    }
    return {
      behavior: 'ask',
      reason: `Ask required by rule: ${askRule.raw}`,
      matchedRule: askRule
    }
  }

  // 5) Mode transforms
  if (mode === 'bypassPermissions') {
    return { behavior: 'allow', reason: 'bypassPermissions mode' }
  }

  if (mode === 'plan') {
    // readonly in plan: network still asks (unless allow rule already hit)
    if (NETWORK_TOOLS.has(toolName)) {
      return {
        behavior: 'ask',
        reason: `${toolName} requires approval in plan mode`
      }
    }
    return { behavior: 'allow', reason: 'Plan mode read-only tool' }
  }

  // Base sensitivity
  let wouldAsk = isSensitiveTool(toolName, input)

  if (mode === 'acceptEdits' || mode === 'auto') {
    if (WRITE_TOOLS.has(toolName)) {
      // GM-PERM: path-scoped auto-allow (inside cwd only; expansion → ask)
      const pathCheck = validateToolPathForMode({
        toolName,
        input,
        cwd: opts.cwd,
        op: 'write',
        additionalWorkingDirectories: opts.additionalWorkingDirectories
      })
      if (!pathCheck.ok) {
        return askOrDontAsk(mode, pathCheck.reason)
      }
      return {
        behavior: 'allow',
        reason:
          mode === 'auto'
            ? 'auto mode (file edits auto-allowed)'
            : 'acceptEdits mode (file edits auto-allowed)'
      }
    }
    if (EXEC_TOOLS.has(toolName) && isReadOnlyTool(toolName, input)) {
      return {
        behavior: 'allow',
        reason:
          mode === 'auto'
            ? 'auto mode + read-only shell'
            : 'acceptEdits + read-only shell'
      }
    }
    // exec write / network / mcp / skill admin still ask (auto may LLM-resolve)
    wouldAsk =
      wouldAsk ||
      (EXEC_TOOLS.has(toolName) && !isReadOnlyTool(toolName, input)) ||
      NETWORK_TOOLS.has(toolName) ||
      isMcpToolName(toolName) ||
      MCP_META.has(toolName) ||
      SKILL_MCP_ADMIN.has(toolName) ||
      toolName === 'install_skill' ||
      toolName === 'uninstall_skill' ||
      toolName === 'agent'
  }

  // CC autoAllowBashIfSandboxed: sandboxed shell can skip the ask prompt
  // (still blocked above for high/critical risk).
  // GM-BASH: only when sandbox runtime is actually active — never treat
  // "enabled in settings but not ready" as isolated.
  if (
    wouldAsk &&
    (toolName === 'bash' || toolName === 'powershell') &&
    isAutoAllowBashIfSandboxedEnabled() &&
    shouldSandboxCommand({
      command:
        input && typeof input === 'object'
          ? String((input as Record<string, unknown>).command ?? '')
          : '',
      dangerouslyDisableSandbox:
        input && typeof input === 'object'
          ? Boolean(
              (input as Record<string, unknown>).dangerouslyDisableSandbox
            )
          : false
    })
  ) {
    return {
      behavior: 'allow',
      reason: 'Auto-allowed with OS sandbox (autoAllowBashIfSandboxed)'
    }
  }

  if (toolName === 'bash' || toolName === 'powershell') {
    const command =
      input && typeof input === 'object'
        ? String((input as Record<string, unknown>).command ?? '')
        : ''
    const shellPath = evaluateShellPathPermission({
      toolName,
      command,
      cwd: opts.cwd ?? process.cwd(),
      additionalWorkingDirectories: opts.additionalWorkingDirectories
    })
    if (!shellPath.allowed) {
      if (shellPath.behavior === 'deny') {
        return { behavior: 'deny', reason: shellPath.reason }
      }
      return askOrDontAsk(mode, shellPath.reason)
    }
  }

  const pathGate = filePathOutsideWorkingDirs({
    toolName,
    input,
    cwd: opts.cwd,
    additionalWorkingDirectories: opts.additionalWorkingDirectories ?? []
  })
  if (pathGate.outside) {
    return askOrDontAsk(mode, pathGate.reason)
  }

  if (!wouldAsk) {
    return { behavior: 'allow', reason: 'Tool is not permission-sensitive' }
  }

  // 6) dontAsk: convert ask → deny (CC)
  if (mode === 'dontAsk') {
    return { behavior: 'deny', reason: DONT_ASK_REJECT }
  }

  const askReason = blocksAuto
    ? risk.reason
    : `${toolName} requires approval in ${mode} mode`

  // Auto mode: gray-zone asks are classifier candidates (CC classifyYoloAction)
  if (mode === 'auto' && !blocksAuto) {
    return {
      behavior: 'ask',
      reason: askReason,
      classifierCandidate: true
    }
  }

  return {
    behavior: 'ask',
    reason: askReason
  }
}

/** @deprecated use evaluatePermission — kept for call sites during transition */
export function toolNeedsPermission(
  toolName: string,
  mode: PermissionMode,
  input?: unknown,
  rules?: PermissionRulesConfig,
  sessionAllows?: (t: string) => boolean
): boolean {
  const r = evaluatePermission({
    toolName,
    input,
    mode,
    rules: rules ?? { allow: [], deny: [], ask: [] },
    sessionAllows: sessionAllows ?? (() => false)
  })
  return r.behavior === 'ask'
}

export function planModeDenied(
  toolName: string,
  mode: PermissionMode,
  input?: unknown
): boolean {
  if (mode !== 'plan') return false
  return !isReadOnlyTool(toolName, input)
}

/** @deprecated use PermissionDecisionKind from shared/types */
export type PermissionDecision = PermissionDecisionKind

type PermissionWaiter = {
  resolve: (d: PermissionDecisionPayload) => void
  reject: (e: Error) => void
  toolName: string
  input?: unknown
}

export class PermissionBroker {
  private waiters = new Map<string, PermissionWaiter>()
  /** Tool-name session allow (allow_session — entire tool class). `*` = regular tools. */
  private sessionAllow = new Set<string>()
  /** Granular session allow (legacy / exact-command memory). */
  private sessionRules: ParsedPermissionRule[] = []
  /** CC additionalWorkingDirectories — paths approved outside session cwd. */
  private additionalWorkingDirs = new Set<string>()
  /** Auto-classifier denial streak (CC denialTracking). */
  private denialTracking: DenialTrackingState = createDenialTrackingState()

  sessionAllows(toolName: string, input?: unknown): boolean {
    const n = normalizeToolName(toolName)
    if (this.sessionAllow.has(n) || this.sessionAllow.has('*')) return true
    if (n && n !== '*' && this.sessionAllow.has(permissionClassKey(n))) return true
    for (const r of this.sessionRules) {
      if (ruleMatches(r, n, input)) return true
    }
    return false
  }

  rememberSession(toolName: string): void {
    const n = normalizeToolName(toolName)
    this.sessionAllow.add(n)
    if (n && n !== '*') this.sessionAllow.add(permissionClassKey(n))
  }

  /** True when allow_session was chosen for this tool or its operation class. */
  sessionAllowsToolClass(toolName: string): boolean {
    const n = normalizeToolName(toolName)
    if (!n || n === '*') return false
    return this.sessionAllow.has(n) || this.sessionAllow.has(permissionClassKey(n))
  }

  rememberSessionRule(rule: string): void {
    const parsed = permissionRuleValueFromString(rule)
    this.sessionRules.push(parsed)
  }

  getAdditionalWorkingDirectories(): string[] {
    return [...this.additionalWorkingDirs]
  }

  addAdditionalWorkingDirectory(dir: string): void {
    const d = String(dir ?? '').trim()
    if (!d) return
    this.additionalWorkingDirs.add(path.resolve(d))
  }

  /** Snapshot for session persistence (M06). */
  exportSessionMemory(): {
    tools: string[]
    rules: string[]
    directories: string[]
  } {
    return {
      tools: [...this.sessionAllow],
      rules: this.sessionRules.map((r) => r.raw),
      directories: [...this.additionalWorkingDirs]
    }
  }

  hydrateSessionMemory(snap?: {
    tools?: string[]
    rules?: string[]
    directories?: string[]
  }): void {
    this.sessionAllow.clear()
    this.sessionRules = []
    this.additionalWorkingDirs.clear()
    if (!snap) return
    for (const t of snap.tools || []) this.sessionAllow.add(normalizeToolName(t))
    for (const r of snap.rules || []) {
      if (typeof r === 'string' && r.trim()) {
        this.sessionRules.push(permissionRuleValueFromString(r))
      }
    }
    for (const d of snap.directories || []) {
      this.addAdditionalWorkingDirectory(d)
    }
  }

  getDenialTracking(): DenialTrackingState {
    return { ...this.denialTracking }
  }

  /**
   * Record auto-classifier outcome. When denial limits hit, returns
   * `fallbackToAsk: true` so the loop upgrades deny → ask.
   */
  noteClassifierOutcome(
    outcome: 'deny' | 'allow' | 'ask'
  ): { fallbackToAsk: boolean; state: DenialTrackingState } {
    const r = applyClassifierDenialOutcome(this.denialTracking, outcome)
    this.denialTracking = r.state
    return { fallbackToAsk: r.fallbackToAsk, state: this.getDenialTracking() }
  }

  shouldFallbackClassifierToPrompt(): boolean {
    return shouldFallbackToPrompting(this.denialTracking)
  }

  resetDenialTracking(): void {
    this.denialTracking = createDenialTrackingState()
  }

  wait(
    requestId: string,
    meta?: { timeoutMs?: number; toolName?: string; input?: unknown }
  ): Promise<PermissionDecisionPayload> {
    const timeoutMs = meta?.timeoutMs ?? 120_000
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.waiters.has(requestId)) return
        this.waiters.delete(requestId)
        resolve({
          decision: 'deny',
          message:
            'Permission prompt timed out after 120s. Confirm the tool when prompted, or allow it in permission rules.'
        })
      }, timeoutMs)
      this.waiters.set(requestId, {
        toolName: meta?.toolName ?? '',
        input: meta?.input,
        resolve: (payload) => {
          clearTimeout(timer)
          resolve(payload)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        }
      })
    })
  }

  /**
   * After 允许本类型 / 允许本窗口, release other queued prompts that
   * are now covered so the same type does not ask again.
   */
  resolveCoveredPending(
    exceptRequestId: string,
    kind: 'type' | 'window',
    toolName: string
  ): string[] {
    const cls = permissionClass(toolName)
    const released: string[] = []
    for (const [id, w] of [...this.waiters]) {
      if (id === exceptRequestId) continue
      if (kind === 'type' && permissionClass(w.toolName) !== cls) continue
      if (kind === 'window' && isDeleteOperation(w.toolName, w.input)) continue
      this.waiters.delete(id)
      w.resolve({ decision: 'allow' })
      released.push(id)
    }
    return released
  }

  resolve(
    requestId: string,
    decision: PermissionDecisionKind | PermissionDecisionPayload
  ): boolean {
    const w = this.waiters.get(requestId)
    if (!w) return false
    this.waiters.delete(requestId)
    const payload: PermissionDecisionPayload =
      typeof decision === 'string' ? { decision } : decision
    w.resolve(payload)
    return true
  }

  /** Pending waiter count (abort_ack). */
  pendingCount(): number {
    return this.waiters.size
  }

  /**
   * R7: turn-end orphan sweep (CC orphaned-permission spirit). Any request
   * still pending when the turn closes gets a synthesized deny so no waiter
   * dangles across turns. Returns the number of orphans resolved.
   */
  denyAllPending(
    message = 'Turn ended before this permission request was answered (auto-denied).'
  ): number {
    const n = this.waiters.size
    for (const [id, w] of this.waiters) {
      w.resolve({ decision: 'deny', message })
      this.waiters.delete(id)
    }
    return n
  }

  cancelAll(reason = 'cancelled'): number {
    const n = this.waiters.size
    for (const [id, w] of this.waiters) {
      w.reject(new Error(reason))
      this.waiters.delete(id)
    }
    return n
  }
}
