import { getMcpToolAnnotations, isMcpToolName } from '../mcp/types.js'
import { isShellCommandReadOnly } from './shellReadOnly.js'

/**
 * Per-tool concurrency / read-only policy (Claude Code Tool.isConcurrencySafe /
 * isReadOnly — **input-aware**, default false).
 */

export type ToolPolicyInput = Record<string, unknown>

function asRecord(input: unknown): ToolPolicyInput {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as ToolPolicyInput
  }
  return {}
}

function alwaysTrue(_input?: unknown): boolean {
  return true
}
function alwaysFalse(_input?: unknown): boolean {
  return false
}

type Policy = {
  isReadOnly: (input: unknown) => boolean
  isConcurrencySafe: (input: unknown) => boolean
}

const ALWAYS_SAFE: Policy = {
  isReadOnly: alwaysTrue,
  isConcurrencySafe: alwaysTrue
}

const ALWAYS_UNSAFE: Policy = {
  isReadOnly: alwaysFalse,
  isConcurrencySafe: alwaysFalse
}

function shellPolicy(shell: 'bash' | 'powershell'): Policy {
  return {
    isReadOnly: (input) => {
      const cmd = String(asRecord(input).command ?? '')
      return isShellCommandReadOnly(cmd, shell)
    },
    isConcurrencySafe: (input) => {
      const cmd = String(asRecord(input).command ?? '')
      return isShellCommandReadOnly(cmd, shell)
    }
  }
}

const POLICIES: Record<string, Policy> = {
  read_file: ALWAYS_SAFE,
  glob: ALWAYS_SAFE,
  grep: ALWAYS_SAFE,
  list_dir: ALWAYS_SAFE,
  git_snapshot: ALWAYS_SAFE,
  // Serialize network tools — parallel calls + permission UI caused hung turns
  web_fetch: { isReadOnly: alwaysTrue, isConcurrencySafe: alwaysFalse },
  web_search: { isReadOnly: alwaysTrue, isConcurrencySafe: alwaysFalse },
  open_path: ALWAYS_SAFE,
  open_url: ALWAYS_SAFE,
  document_edit: ALWAYS_UNSAFE,
  document_convert: ALWAYS_UNSAFE,
  list_mcp_resources: ALWAYS_SAFE,
  read_mcp_resource: ALWAYS_SAFE,
  invoke_skill: ALWAYS_SAFE,
  manage_mcp: ALWAYS_UNSAFE,
  // Interactive / mode — not concurrency-safe (serialize)
  ask_user: { isReadOnly: alwaysTrue, isConcurrencySafe: alwaysFalse },
  enter_plan_mode: { isReadOnly: alwaysTrue, isConcurrencySafe: alwaysFalse },
  exit_plan_mode: { isReadOnly: alwaysTrue, isConcurrencySafe: alwaysFalse },
  write_file: ALWAYS_UNSAFE,
  search_replace: ALWAYS_UNSAFE,
  notebook_edit: ALWAYS_UNSAFE,
  install_skill: ALWAYS_UNSAFE,
  uninstall_skill: ALWAYS_UNSAFE,
  list_skills: ALWAYS_SAFE,
  todo_write: ALWAYS_UNSAFE,
  task_create: ALWAYS_UNSAFE,
  task_update: ALWAYS_UNSAFE,
  task_get: ALWAYS_SAFE,
  task_list: ALWAYS_SAFE,
  /**
   * AgentTool: Explore/verification are read-only → concurrency-safe (CC AgentTool
   * isConcurrencySafe). Fork / GP / resume / custom stay serial.
   */
  agent: {
    isReadOnly: (input) => isReadOnlyAgentSpawn(input),
    isConcurrencySafe: (input) => isReadOnlyAgentSpawn(input)
  },
  verify_delivery: ALWAYS_UNSAFE,
  verify_plan_execution: ALWAYS_UNSAFE,
  enter_worktree: ALWAYS_UNSAFE,
  exit_worktree: ALWAYS_UNSAFE,
  cron_create: ALWAYS_UNSAFE,
  cron_delete: ALWAYS_UNSAFE,
  cron_list: ALWAYS_SAFE,
  lsp: ALWAYS_SAFE,
  tool_search: ALWAYS_SAFE,
  bash: shellPolicy('bash'),
  powershell: shellPolicy('powershell')
}

const DEFAULT_POLICY: Policy = ALWAYS_UNSAFE

/** Plan multi-view / Explore parallel: only read-only agent spawns batch together. */
export function isReadOnlyAgentSpawn(input: unknown): boolean {
  const r = asRecord(input)
  if (r.agentId != null && String(r.agentId).trim()) {
    // Resume mutates a sidechain — serialize
    return false
  }
  const raw =
    r.subagent_type != null ? String(r.subagent_type).trim() : ''
  if (!raw) return false // omit → fork
  const lower = raw.toLowerCase()
  if (lower === 'fork') return false
  if (lower === 'explore') return true
  if (lower === 'plan') return true
  if (lower === 'verification') return true
  return false
}

export function getToolPolicy(toolName: string): Policy {
  if (isMcpToolName(toolName)) {
    // CC: isConcurrencySafe/isReadOnly ≡ annotations.readOnlyHint ?? false
    const ann = getMcpToolAnnotations(toolName)
    if (ann?.readOnlyHint) return ALWAYS_SAFE
    return ALWAYS_UNSAFE
  }
  return POLICIES[toolName] ?? DEFAULT_POLICY
}

/** CC: parse fail / throw → not concurrency-safe */
export function isConcurrencySafe(toolName: string, input?: unknown): boolean {
  try {
    return Boolean(getToolPolicy(toolName).isConcurrencySafe(input))
  } catch {
    return false
  }
}

export function isReadOnlyTool(toolName: string, input?: unknown): boolean {
  try {
    return Boolean(getToolPolicy(toolName).isReadOnly(input))
  } catch {
    return false
  }
}

/**
 * Max parallel tool uses in a concurrency-safe batch.
 * Env: ACKEMCODE_MAX_TOOL_USE_CONCURRENCY (preferred) or
 * CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY (CC alias) or legacy ACKEMCODE_MAX_TOOL_CONCURRENCY.
 */
export function getMaxToolConcurrency(): number {
  const raw =
    process.env.ACKEMCODE_MAX_TOOL_USE_CONCURRENCY ||
    process.env.CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY ||
    process.env.ACKEMCODE_MAX_TOOL_CONCURRENCY ||
    ''
  const n = parseInt(raw, 10)
  if (!Number.isNaN(n) && n > 0) return Math.min(n, 32)
  return 10
}

export type ToolMeta = {
  name: string
  isReadOnly: boolean
  isConcurrencySafe: boolean
}

export function getToolMeta(toolName: string, input?: unknown): ToolMeta {
  return {
    name: toolName,
    isReadOnly: isReadOnlyTool(toolName, input),
    isConcurrencySafe: isConcurrencySafe(toolName, input)
  }
}
