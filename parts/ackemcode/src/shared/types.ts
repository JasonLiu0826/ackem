/**
 * AckemCode shared contracts — Claude Code message/SDK event vocabulary (logic-level).
 * Additive evolution only: new optional fields OK; do not rename/remove existing ones.
 *
 * Full AgentEvent catalog: see doc/编码智能体开发/AgentEvent-契约.md
 */

export type EffortLevel = 'low' | 'medium' | 'high' | 'max'

/** Agents bar tier — parallel sub-agent policy (CLI §4; not CC Swarm). */
export type AgentTier = 'solo' | 'auto' | 'team'

export type PermissionMode =
  | 'default'
  | 'plan'
  | 'acceptEdits'
  | 'auto'
  | 'bypassPermissions'
  | 'dontAsk'

/** Host (Ackem) task envelope on POST /api/session. */
export type AckemTaskKind = 'work.job' | 'openforu.create' | 'openforu.update'

export type AckemTask = {
  kind: AckemTaskKind
  summary: string
  tag: string | null
}

/** CC-style session chrome state for the host UI. */
export type SessionUiState = 'idle' | 'running' | 'requires_action'

/** Persisted allow/deny/ask rules — CC permissionsLoader spirit (`Tool` / `Tool(content)`). */
export type PermissionRulesConfig = {
  allow: string[]
  deny: string[]
  ask: string[]
}

export interface AckemCodeSettings {
  apiBaseUrl: string
  apiKey: string
  model: string
  effort: EffortLevel
  /**
   * R1-RETRY: optional fallback model tried after the primary model's API
   * retries exhaust (capacity/5xx). Env ACKEM_LLM_FALLBACK_MODEL also works.
   */
  fallbackModel?: string
  /**
   * R7: optional session token budget (CC maxBudgetUsd spirit). When the
   * conversation estimate exceeds it, the turn closes with budget_exceeded.
   * Default off; env ACKEM_MAX_BUDGET_TOKENS also works.
   */
  maxBudgetTokens?: number
  permissionMode: PermissionMode
  /**
   * Agentic loop budget (model rounds per user turn).
   * `0` = unlimited, matching Claude Code interactive (maxTurns omitted).
   * Browser MCP turns can extend this by up to 40 (see turnControl).
   */
  maxTurns: number
  cwd: string
  /**
   * Optional: also import skills already on disk under ~/.claude/skills.
   * Default false — Ackem downloads/installs into ~/.ackemcode/skills itself.
   */
  useClaudeSkills: boolean
  /** Extra absolute directories that contain skill-name/SKILL.md folders. */
  extraSkillDirs: string[]
  /**
   * MCP servers (Claude Code–style). Keys are server names.
   * stdio: { command, args?, env? } · http/sse: { type: 'http'|'sse', url, headers? }
   */
  mcpServers: Record<string, McpServerConfigJson>
  /** Permanent permission rules (settings.json). */
  permissionRules: PermissionRulesConfig
  /**
   * Optional LSP servers (M18/M21). Used when ACKEM_ENABLE_LSP=1.
   * Keys are server names; extensions select which server opens a file.
   */
  lspServers: Record<
    string,
    {
      command: string
      args?: string[]
      extensions: string[]
      disabled?: boolean
      maxRestarts?: number
      requestTimeoutMs?: number
      initTimeoutMs?: number
      env?: Record<string, string>
      initializationOptions?: Record<string, unknown>
    }
  >
  /**
   * S12: master switch for LSP tool. Default undefined = auto-on when
   * lspServers has entries. false forces off; true still needs servers (or env).
   */
  lspEnabled?: boolean
  /**
   * Auto-memory (memdir). Default true. Env ACKEM_DISABLE_AUTO_MEMORY / CLAUDE_CODE_DISABLE_AUTO_MEMORY wins.
   */
  autoMemoryEnabled: boolean
  /**
   * Web search (S02). Local SERP — Tavily / SerpAPI / Brave / custom.
   * Not Anthropic hosted web_search. Env: TAVILY_API_KEY, SERPAPI_API_KEY,
   * BRAVE_API_KEY, ACKEM_WEB_SEARCH_PROVIDER.
   */
  webSearch: {
    provider?: 'tavily' | 'serpapi' | 'brave' | 'custom' | 'mock' | 'auto'
    apiKey?: string
    customUrl?: string
    maxResults?: number
    blockedDomains?: string[]
  }
  /**
   * How to feed images/PDF pages to the model.
   * auto = detect from model name + API host (text extract always runs).
   * off = never attach images/PDF bytes (text-only extract).
   * vision = always attach page/image parts (OpenAI image_url).
   */
  multimodal?: 'auto' | 'off' | 'vision'
  /**
   * Hooks (S03) — Claude Code settings.hooks shape.
   * Typed at runtime via `src/server/hooks`.
   */
  hooks?: Record<string, unknown>
  /** Master off switch (also ACKEM_DISABLE_ALL_HOOKS=1). */
  disableAllHooks?: boolean
  /**
   * S08: default shell command for verify_delivery (e.g. `npm test`, `pnpm test`).
   * Empty → tool returns PARTIAL unless an override command is passed.
   */
  verifyCommand?: string
  /**
   * Agents collaboration tier (CLI §4). solo hides agent tool; team raises
   * effective planExploreAgents floor. Not CC Swarm/Team mailbox.
   */
  agentTier?: AgentTier
  /**
   * S10 PlanV2: max parallel Explore agents while in plan mode (CC planModeV2
   * explore count spirit). Clamped 1–10; default 2. Not subscription-tiered.
   * team tier applies max(this, TEAM_PLAN_EXPLORE_FLOOR) at runtime.
   */
  planExploreAgents?: number
  /**
   * CC planModeV2 interview phase: iterative plan file + ask_user workflow.
   * Default true. When false, multi-view Explore-only guidance is emphasized.
   */
  planModeInterviewPhase?: boolean
  /**
   * Optional plan files directory relative to cwd (CC plansDirectory).
   * Default: ~/.ackemcode/plans
   */
  plansDirectory?: string
  /**
   * Auto-mode classifier customization (CC settings.autoMode spirit).
   * Used when permissionMode === 'auto'. Allow/softDeny/environment are
   * free-text bullets injected into the side-query rubric — not CC prompt dumps.
   */
  autoMode?: {
    allow?: string[]
    softDeny?: string[]
    environment?: string[]
    /** Override classifier model; default = settings.model */
    model?: string
  }
  /**
   * Custom context window (tokens). When set and valid (4096–20M),
   * overrides prefix-table / env guessing (A-09 / B-08).
   */
  contextWindow?: number
  /** N1 — warn/block when assistant claims done with open diagnostics (default warn). */
  repoPreflight?: 'off' | 'warn' | 'block'
  /**
   * OS sandbox (CC settings.sandbox + @anthropic-ai/sandbox-runtime).
   * When enabled and deps available, bash/powershell run inside ASRT.
   */
    sandbox?: {
    enabled?: boolean
    autoAllowBashIfSandboxed?: boolean
    allowUnsandboxedCommands?: boolean
    excludedCommands?: string[]
    skipInstallPrompt?: boolean
    network?: {
      allowedDomains?: string[]
      deniedDomains?: string[]
      allowUnixSockets?: string[]
      allowAllUnixSockets?: boolean
      allowLocalBinding?: boolean
      httpProxyPort?: number
      socksProxyPort?: number
    }
    filesystem?: {
      allowWrite?: string[]
      denyWrite?: string[]
      denyRead?: string[]
      allowRead?: string[]
    }
    enableWeakerNestedSandbox?: boolean
    enableWeakerNetworkIsolation?: boolean
    ignoreViolations?: Record<string, string[]>
  }
  /**
   * First-run Edge extension onboarding (playwright-edge).
   * See doc/开发文档/浏览器MCP-首次引导.md
   */
  browserOnboarding?: {
    skipPrompt?: boolean
    lastShownAt?: string
    lastChoice?:
      | 'open_store'
      | 'installed'
      | 'isolated'
      | 'later'
      | 'never'
  }
}

/** JSON-serializable MCP server config stored in settings */
export type McpServerConfigJson =
  | {
      type?: 'stdio'
      command: string
      args?: string[]
      env?: Record<string, string>
      disabled?: boolean
    }
  | {
      type: 'http' | 'sse'
      url: string
      headers?: Record<string, string>
      disabled?: boolean
    }

export const DEFAULT_SETTINGS: AckemCodeSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4.1',
  effort: 'medium',
  permissionMode: 'default',
  maxTurns: 40,
  cwd: '',
  useClaudeSkills: false,
  extraSkillDirs: [],
  mcpServers: {},
  permissionRules: { allow: [], deny: [], ask: [] },
  lspServers: {},
  autoMemoryEnabled: true,
  webSearch: { provider: 'auto', maxResults: 8 },
  multimodal: 'auto',
  hooks: {},
  disableAllHooks: false,
  verifyCommand: '',
  agentTier: 'auto',
  planExploreAgents: 2,
  planModeInterviewPhase: true,
  autoMode: { allow: [], softDeny: [], environment: [] },
  sandbox: {
    autoAllowBashIfSandboxed: true,
    allowUnsandboxedCommands: true,
    excludedCommands: [],
    skipInstallPrompt: false,
    network: { allowedDomains: [], deniedDomains: [] },
    filesystem: {}
  },
  browserOnboarding: { skipPrompt: false }
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

/** OpenAI / Anthropic-compat content parts for vision and native PDF. */
export type MessageContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image_url'
      image_url: { url: string; detail?: 'low' | 'high' | 'auto' | 'original' }
    }
  | {
      type: 'document'
      source: { type: 'base64'; media_type: string; data: string }
    }

/**
 * OpenAI-shaped chat message used by the LLM adapter.
 * Optional id/timestamp/parent for host timeline fidelity (CC Message.uuid spirit).
 */
export interface ChatMessage {
  role: ChatRole
  content: string | null | MessageContentPart[]
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
  /** Stable id for host correlation (optional). */
  id?: string
  /** ISO timestamp (optional). */
  timestamp?: string
  /** Sub-agent / parent tool_use correlation (optional). */
  parentToolUseId?: string
  agentId?: string
  /** OpenAI finish_reason of the assistant turn (R1: 'length' → output-truncation recovery). */
  finishReason?: string
  /** History snip boundary metadata (Batch 8). */
  snipMetadata?: { removedIds: string[] }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** Permission dock decisions (CC accept-once / session / dont-ask-again / reject). */
export type PermissionDecisionKind =
  | 'allow'
  | 'deny'
  | 'allow_session'
  | 'allow_always'

export type PermissionDecisionPayload = {
  decision: PermissionDecisionKind
  /** Optional user feedback to inject into tool_result (CC deny/allow message). */
  message?: string
}

/** Semantic bash allow from exit_plan_mode (CC ExitPlanMode allowedPrompts). */
export type PlanAllowedPrompt = {
  tool: 'bash' | 'Bash' | string
  prompt: string
}

/** Exit-plan / enter-plan broker result. */
export type PlanDecisionPayload = {
  decision: 'approve' | 'reject'
  /** After approve exit: which mode to enter (CC Yes variants). Default prePlanMode / default. */
  mode?: PermissionMode
  /**
   * Reject: tell the model what to change (Keep planning input).
   * Approve: CC acceptFeedback — "User feedback on this plan" (Shift+Tab).
   */
  message?: string
  /** Host-edited plan body (CC Ctrl+G / web UI edit). */
  plan?: string
  planWasEdited?: boolean
  /** reject + keep_planning (stay in plan) vs exit_to_default (CC Reject). */
  rejectAction?: 'keep_planning' | 'exit_to_default'
}

export type AskUserAnnotation = {
  preview?: string
  notes?: string
}

export type AskUserAnswerPayload = {
  answers: Record<string, string>
  /** Per-question notes / selected preview (CC AskUserQuestion annotations). */
  annotations?: Record<string, AskUserAnnotation>
  cancelled?: boolean
}

/** Host-side turn receipt. Ackem reconciles by hostRunId + revision. */
export interface HostTurnReceipt {
  hostRunId: string
  state: 'running' | 'requires_action' | 'succeeded' | 'failed' | 'aborted'
  revision: number
  startedAt: string
  updatedAt: string
  completedAt?: string
  errorCode?: string
}

/**
 * SSE event vocabulary for the AckemCode host (M00/M20).
 * Maps CC SDK stream + control_request semantics without Ink.
 */
export type AgentEvent =
  | { type: 'status'; message: string }
  | {
      type: 'session_state'
      state: SessionUiState
      detail?: string
    }
  | { type: 'thinking'; phase: 'start' | 'update' | 'end'; text?: string; elapsedSec?: number }
  | { type: 'assistant_delta'; text: string }
  | { type: 'assistant_message'; text: string; final?: boolean }
  | {
      type: 'tool_start'
      id: string
      name: string
      input: unknown
      agentId?: string
      parentToolUseId?: string
    }
  | {
      type: 'tool_progress'
      id: string
      name: string
      elapsedSec: number
      agentId?: string
      text?: string
    }
  | {
      type: 'tool_result'
      id: string
      name: string
      ok: boolean
      output: string
      agentId?: string
      parentToolUseId?: string
    }
  | {
      type: 'permission_request'
      requestId: string
      toolName: string
      input: unknown
      reason: string
      hostRunId?: string
      hostTurnReceipt?: HostTurnReceipt
      /** Bind to timeline step / tool_use id (CC can_use_tool.tool_use_id). */
      toolUseId?: string
      agentId?: string
      parentToolUseId?: string
    }
  | {
      type: 'agent_started'
      agentId: string
      subagentType: string
      description: string
      thoroughness?: string
      parentToolUseId?: string
    }
  | {
      type: 'agent_progress'
      agentId: string
      turn: number
      maxTurns: number
      text?: string
    }
  | {
      type: 'agent_finished'
      agentId: string
      ok: boolean
      turns: number
      reportPreview: string
    }
  | {
      type: 'ask_user'
      requestId: string
      questions: Array<{
        question: string
        header?: string
        options: Array<{ label: string; description?: string; preview?: string }>
        multiSelect?: boolean
      }>
    }
  | {
      type: 'plan_approval'
      requestId: string
      plan: string
      planFilePath?: string
    }
  | {
      /** Enter plan mode — user must confirm (CC EnterPlanMode permission). */
      type: 'enter_plan_approval'
      requestId: string
      planFilePath?: string
    }
  | {
      type: 'plan_mode_entered'
      planFilePath: string
      planExists: boolean
    }
  | {
      type: 'plan_file_updated'
      planFilePath: string
      chars: number
    }
  | { type: 'mode_changed'; mode: PermissionMode }
  | {
      type: 'cwd_changed'
      cwd: string
      reason?: 'enter_worktree' | 'exit_worktree'
    }
  | {
      /** Due session cron jobs (CC ScheduleCron fire-on-idle spirit). */
      type: 'cron_due'
      jobs: Array<{
        id: string
        cron: string
        prompt: string
        humanSchedule: string
        recurring?: boolean
        fireCount?: number
      }>
    }
  | {
      /** W3 companion-readable summary (Ackem host bridge). */
      type: 'w3_summary'
      summary: {
        version: 1
        sessionId: string
        cwd: string
        task: string
        status: '进行中' | '已交付' | '卡住'
        deliverables: string[]
        diffIntent: string
        openQuestions: string[]
        evidence: { verified: boolean; notes: string }
        updatedAt: string
      }
    }
  | {
      type: 'todos_updated'
      todos: Array<{ content: string; status: string; activeForm: string }>
    }
  | {
      /** S10 Task v2 list changed (CC Task* notify spirit). */
      type: 'tasks_updated'
      tasks: Array<{
        id: string
        subject: string
        status: string
        owner?: string
        blockedBy: string[]
      }>
    }
  | {
      /** S11 MCP elicitation (CC ElicitationDialog spirit). */
      type: 'mcp_elicitation'
      requestId: string
      serverName: string
      message: string
      mode: 'form' | 'url'
      requestedSchema?: unknown
      url?: string
    }
  | {
      /** First-run Edge extension install (playwright-edge). */
      type: 'browser_onboarding'
      requestId: string
      serverName: string
      storeUrl: string
      docUrl: string
      titleZh: string
      titleEn: string
      bodyZh: string
      bodyEn: string
      stepsZh: string[]
      stepsEn: string[]
      noteZh: string
      noteEn: string
      options: Array<{ id: string; labelZh: string; labelEn: string }>
    }
  | {
      type: 'context_compacted'
      kind: 'micro' | 'full'
      beforeTokens: number
      afterTokens: number
      truncatedToolResults?: number
      summaryVia?: 'llm' | 'extractive' | 'session_memory'
      phase?: 'start' | 'end'
    }
  | {
      /** Server context window fill — API usage when available, else session estimate. */
      type: 'token_usage'
      tokens: number
      contextWindow: number
      source: 'api' | 'estimate'
      inputTokens?: number
      outputTokens?: number
    }
  | {
      type: 'abort_ack'
      cancelledPermissions: number
      cancelledInteractions: number
      restoredUserText?: string
      rewound?: boolean
      filesChanged?: string[]
      hostRunId?: string
      hostTurnReceipt?: HostTurnReceipt
    }
  | {
      /** P2: settings PUT succeeded — hosts refresh chrome (no apiKey). */
      type: 'settings_changed'
      changed: string[]
      hasApiKey?: boolean
      settings: {
        model?: string
        effort?: EffortLevel
        agentTier?: AgentTier
        permissionMode?: PermissionMode
        contextWindow?: number
      }
    }
  | {
      /** S06: fileHistoryRewind applied (or dry-run preview). */
      type: 'files_rewound'
      messageId: string
      filesChanged: string[]
      dryRun: boolean
    }
  | {
      /** S07: user message enqueued while a turn is running. */
      type: 'message_queued'
      id: string
      text: string
      queueLength: number
      priority?: 'now' | 'next' | 'later'
      mode?: 'prompt' | 'task-notification' | 'slash'
      /** true when priority=now aborted the active turn (CC interrupt). */
      interrupted?: boolean
    }
  | {
      /** S07: queued message injected into the active turn (CC mid-turn drain). */
      type: 'message_dequeued'
      id: string
      text: string
      remaining: number
      mode?: 'prompt' | 'task-notification' | 'slash'
    }
  | {
      /** S07: queue mutated (remove / reorder / clear / priority). */
      type: 'queue_updated'
      items: Array<{
        id: string
        text: string
        priority: 'now' | 'next' | 'later'
        mode: 'prompt' | 'task-notification' | 'slash'
      }>
    }
  | { type: 'done'; ok: boolean; error?: string; hostRunId?: string; hostTurnReceipt?: HostTurnReceipt }
  | { type: 'error'; message: string }

/** Exhaustive list of AgentEvent.type values (for docs + smoke). */
export const AGENT_EVENT_TYPES = [
  'status',
  'session_state',
  'thinking',
  'assistant_delta',
  'assistant_message',
  'tool_start',
  'tool_progress',
  'tool_result',
  'permission_request',
  'agent_started',
  'agent_progress',
  'agent_finished',
  'ask_user',
  'plan_approval',
  'enter_plan_approval',
  'plan_mode_entered',
  'plan_file_updated',
  'mode_changed',
  'cwd_changed',
  'cron_due',
  'w3_summary',
  'todos_updated',
  'tasks_updated',
  'mcp_elicitation',
  'browser_onboarding',
  'context_compacted',
  'token_usage',
  'abort_ack',
  'settings_changed',
  'files_rewound',
  'message_queued',
  'message_dequeued',
  'queue_updated',
  'done',
  'error'
] as const satisfies ReadonlyArray<AgentEvent['type']>

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number]

/** Cycle permission modes like CC Shift+Tab (dontAsk stays settings-only). */
export function getNextPermissionMode(current: PermissionMode): PermissionMode {
  const cycle: PermissionMode[] = [
    'default',
    'acceptEdits',
    'auto',
    'plan',
    'bypassPermissions'
  ]
  const i = cycle.indexOf(current)
  if (i === -1) return 'default'
  return cycle[(i + 1) % cycle.length]!
}

export function effortToMaxTokens(effort: EffortLevel): number {
  switch (effort) {
    case 'low':
      return 2048
    case 'high':
      return 16384
    case 'max':
      return 32768
    default:
      return 8192
  }
}

export function effortHint(effort: EffortLevel): string {
  switch (effort) {
    case 'low':
      return 'Be concise. Prefer the shortest correct path. Avoid exploratory rabbit holes.'
    case 'high':
      return 'Be thorough. Read enough context before editing. Verify assumptions with tools. Prefer correctness over speed.'
    case 'max':
      return 'Maximum thoroughness. Exhaust relevant files, verify with tools, and do not stop at a plausible first answer.'
    default:
      return 'Balance speed and thoroughness. Read before editing; keep changes focused.'
  }
}

export const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'max']

export function isEffortLevel(v: unknown): v is EffortLevel {
  return v === 'low' || v === 'medium' || v === 'high' || v === 'max'
}
