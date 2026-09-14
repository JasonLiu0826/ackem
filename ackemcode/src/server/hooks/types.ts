/**
 * Hook contracts — Claude Code schemas/hooks + types/hooks spirit.
 * S03 MVP + S03.1 high-frequency + D1 FileChanged / remaining HOOK_EVENTS.
 */

/** Full HOOK_EVENTS set (CC entrypoints/sdk/coreTypes spirit). */
export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'PermissionRequest',
  'PermissionDenied',
  'Setup',
  'TeammateIdle',
  'TaskCreated',
  'TaskCompleted',
  'Elicitation',
  'ElicitationResult',
  'ConfigChange',
  'WorktreeCreate',
  'WorktreeRemove',
  'InstructionsLoaded',
  'CwdChanged',
  'FileChanged'
] as const

/** @deprecated alias — prefer HOOK_EVENTS */
export const HOOK_EVENTS_MVP = HOOK_EVENTS

export type HookEventName = (typeof HOOK_EVENTS)[number]

export type HookPermissionDecision = 'allow' | 'deny' | 'ask'

export type CommandHookConfig = {
  type: 'command'
  command: string
  /** bash (default) | powershell */
  shell?: 'bash' | 'powershell'
  /** seconds */
  timeout?: number
  /** Permission-rule style filter, e.g. bash(rm *) */
  if?: string
  once?: boolean
}

export type HttpHookConfig = {
  type: 'http'
  url: string
  headers?: Record<string, string>
  /** Env vars allowed for $VAR interpolation in headers */
  allowedEnvVars?: string[]
  timeout?: number
  if?: string
  once?: boolean
}

export type HookConfig = CommandHookConfig | HttpHookConfig

export type HookMatcherGroup = {
  /**
   * Match query depends on event:
   * - tool events → tool name (regex or pipe-list)
   * - FileChanged → basename (e.g. ".env|.envrc")
   * - ConfigChange → source
   * - InstructionsLoaded → load_reason
   * Empty / missing = match all.
   */
  matcher?: string
  hooks: HookConfig[]
}

/** settings.hooks — CC shape */
export type HooksConfig = Partial<Record<HookEventName, HookMatcherGroup[]>>

export type HookBaseInput = {
  session_id: string
  cwd: string
  permission_mode?: string
  transcript_path?: string
  agent_id?: string
  agent_type?: string
}

export type PreToolUseInput = HookBaseInput & {
  hook_event_name: 'PreToolUse'
  tool_name: string
  tool_input: unknown
  tool_use_id: string
}

export type PostToolUseInput = HookBaseInput & {
  hook_event_name: 'PostToolUse'
  tool_name: string
  tool_input: unknown
  tool_use_id: string
  tool_response: string
}

export type PostToolUseFailureInput = HookBaseInput & {
  hook_event_name: 'PostToolUseFailure'
  tool_name: string
  tool_input: unknown
  tool_use_id: string
  error: string
}

export type StopHookInput = HookBaseInput & {
  hook_event_name: 'Stop' | 'StopFailure' | 'SubagentStop'
  stop_hook_active?: boolean
  last_assistant_message?: string
  agent_id?: string
  agent_type?: string
  agent_transcript_path?: string
}

export type PermissionRequestHookInput = HookBaseInput & {
  hook_event_name: 'PermissionRequest'
  tool_name: string
  tool_input: unknown
  tool_use_id?: string
}

export type PermissionDeniedHookInput = HookBaseInput & {
  hook_event_name: 'PermissionDenied'
  tool_name: string
  tool_input: unknown
  tool_use_id?: string
  reason: string
}

export type UserPromptSubmitInput = HookBaseInput & {
  hook_event_name: 'UserPromptSubmit'
  prompt: string
}

export type SessionStartInput = HookBaseInput & {
  hook_event_name: 'SessionStart'
  source: 'startup' | 'resume' | 'clear' | 'compact' | 'prompt'
  model?: string
}

export type SessionEndInput = HookBaseInput & {
  hook_event_name: 'SessionEnd'
  reason: 'clear' | 'resume' | 'logout' | 'other'
}

export type SubagentStartInput = HookBaseInput & {
  hook_event_name: 'SubagentStart'
  agent_id: string
  agent_type: string
}

export type PreCompactInput = HookBaseInput & {
  hook_event_name: 'PreCompact'
  trigger: 'manual' | 'auto'
  custom_instructions?: string | null
}

export type PostCompactInput = HookBaseInput & {
  hook_event_name: 'PostCompact'
  trigger: 'manual' | 'auto'
  compact_summary?: string
}

export type NotificationHookInput = HookBaseInput & {
  hook_event_name: 'Notification'
  message: string
  notification_type?: string
}

export type SetupHookInput = HookBaseInput & {
  hook_event_name: 'Setup'
  trigger: 'init' | 'maintenance'
}

export type TaskCreatedHookInput = HookBaseInput & {
  hook_event_name: 'TaskCreated'
  task_id: string
  task_subject: string
  task_description?: string
}

export type TaskCompletedHookInput = HookBaseInput & {
  hook_event_name: 'TaskCompleted'
  task_id: string
  task_subject: string
  task_description?: string
}

export type ConfigChangeHookInput = HookBaseInput & {
  hook_event_name: 'ConfigChange'
  source:
    | 'user_settings'
    | 'project_settings'
    | 'local_settings'
    | 'policy_settings'
    | 'skills'
    | 'host_settings'
  file_path?: string
}

export type WorktreeCreateHookInput = HookBaseInput & {
  hook_event_name: 'WorktreeCreate'
  name: string
}

export type WorktreeRemoveHookInput = HookBaseInput & {
  hook_event_name: 'WorktreeRemove'
  worktree_path: string
}

export type CwdChangedHookInput = HookBaseInput & {
  hook_event_name: 'CwdChanged'
  old_cwd: string
  new_cwd: string
}

export type FileChangedHookInput = HookBaseInput & {
  hook_event_name: 'FileChanged'
  file_path: string
  event: 'change' | 'add' | 'unlink'
}

export type InstructionsLoadedHookInput = HookBaseInput & {
  hook_event_name: 'InstructionsLoaded'
  file_path: string
  memory_type: 'User' | 'Project' | 'Local' | 'Managed'
  load_reason:
    | 'session_start'
    | 'nested_traversal'
    | 'path_glob_match'
    | 'include'
    | 'compact'
  globs?: string[]
  trigger_file_path?: string
  parent_file_path?: string
}

export type ElicitationHookInput = HookBaseInput & {
  hook_event_name: 'Elicitation' | 'ElicitationResult'
  mcp_server_name?: string
  message?: string
  action?: 'accept' | 'decline' | 'cancel'
}

export type TeammateIdleHookInput = HookBaseInput & {
  hook_event_name: 'TeammateIdle'
  teammate_name?: string
  team_name?: string
}

export type HookInput =
  | PreToolUseInput
  | PostToolUseInput
  | PostToolUseFailureInput
  | StopHookInput
  | PermissionRequestHookInput
  | PermissionDeniedHookInput
  | UserPromptSubmitInput
  | SessionStartInput
  | SessionEndInput
  | SubagentStartInput
  | PreCompactInput
  | PostCompactInput
  | NotificationHookInput
  | SetupHookInput
  | TaskCreatedHookInput
  | TaskCompletedHookInput
  | ConfigChangeHookInput
  | WorktreeCreateHookInput
  | WorktreeRemoveHookInput
  | CwdChangedHookInput
  | FileChangedHookInput
  | InstructionsLoadedHookInput
  | ElicitationHookInput
  | TeammateIdleHookInput

export type HookSpecificPreToolUse = {
  hookEventName: 'PreToolUse'
  permissionDecision?: HookPermissionDecision
  permissionDecisionReason?: string
  updatedInput?: Record<string, unknown>
  additionalContext?: string
}

export type HookSpecificPermissionRequest = {
  hookEventName: 'PermissionRequest'
  decision?:
    | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
    | { behavior: 'deny'; message?: string; interrupt?: boolean }
}

export type HookSpecificPost = {
  hookEventName: 'PostToolUse' | 'PostToolUseFailure'
  additionalContext?: string
}

export type HookSpecificPermissionDenied = {
  hookEventName: 'PermissionDenied'
  retry?: boolean
}

export type HookSpecificWatchPaths = {
  hookEventName?: 'SessionStart' | 'CwdChanged' | 'FileChanged' | string
  watchPaths?: string[]
  additionalContext?: string
}

export type SyncHookJson = {
  continue?: boolean
  stopReason?: string
  decision?: 'approve' | 'block'
  reason?: string
  systemMessage?: string
  /** SessionStart: seed first user message */
  initialUserMessage?: string
  hookSpecificOutput?:
    | HookSpecificPreToolUse
    | HookSpecificPermissionRequest
    | HookSpecificPost
    | HookSpecificPermissionDenied
    | HookSpecificWatchPaths
    | Record<string, unknown>
}

export type SingleHookResult = {
  exitCode: number
  stdout: string
  stderr: string
  json?: SyncHookJson
  /** Hard block (exit 2 or decision block / deny) */
  blocking: boolean
  blockMessage: string
  timedOut?: boolean
  error?: string
}

export type AggregatedHookResult = {
  blocking: boolean
  blockMessage: string
  /** Merged PreToolUse / PermissionRequest */
  permissionDecision?: HookPermissionDecision
  permissionDecisionReason?: string
  updatedInput?: Record<string, unknown>
  additionalContext: string[]
  /** Stop / Post: continue:false */
  preventContinuation: boolean
  stopReason?: string
  /** SessionStart seed */
  initialUserMessage?: string
  /** PermissionRequest auto-resolve */
  permissionAuto?:
    | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
    | { behavior: 'deny'; message?: string; interrupt?: boolean }
  /** PermissionDenied: tell model it may retry */
  permissionDeniedRetry?: boolean
  /** SessionStart / CwdChanged / FileChanged dynamic watch list */
  watchPaths: string[]
  /** WorktreeCreate: absolute path from stdout / hookSpecificOutput */
  worktreePath?: string
  results: SingleHookResult[]
}
