import type {
  ChatMessage,
  PermissionMode,
  AgentTier,
  EffortLevel
} from '../../../shared/types.js'
import type { HooksConfig } from '../../hooks/types.js'

export type SlashHandleResult = {
  handled: boolean
  /** Side-effect summary for status/SSE */
  message: string
  /** If set, start an agent turn with this user text */
  followUpUserText?: string
  /** Optional structured payload (status/doctor/diff) for hosts */
  data?: unknown
}

/**
 * Session/host capabilities the slash router may use.
 * Keep optional so unit smokes can pass a minimal stub.
 */
export type SlashContext = {
  clearHistory: () => void
  setMode?: (mode: string) => void
  getMode?: () => PermissionMode | string
  getCwd?: () => string
  getSessionId?: () => string
  getHistory?: () => ChatMessage[]
  setHistory?: (history: ChatMessage[]) => void
  getHooksConfig?: () => HooksConfig | Record<string, unknown> | undefined
  hooksDisabled?: () => boolean
  /** Permission rule counts (effective). */
  getPermissionRuleCounts?: () => {
    allow: number
    deny: number
    ask: number
  }
  /** Optional richer doctor probes (MCP/LSP). */
  getMcpStatus?: () => Array<{ name: string; state: string }>
  getLspSummary?: () => {
    toolEnabled: boolean
    configuredServers: number
  }
  getVerifySummary?: () => {
    verdict?: string
    verified?: boolean
  } | null
  /** Optional plan preview (/plan). */
  readPlan?: () => Promise<{ path: string; content: string }>
  getAgentTier?: () => AgentTier
  setAgentTier?: (tier: AgentTier) => void | Promise<void>
  getEffort?: () => EffortLevel
  setEffort?: (effort: EffortLevel) => void | Promise<void>
  getModel?: () => string
  setModel?: (model: string, persist: boolean) => void | Promise<void>
  getRegisteredModels?: () => Promise<Array<{ model: string; apiBaseUrl: string; contextWindow?: number }>>
  getContextWindow?: () => number | undefined
  getStandaloneConfigured?: () => boolean | Promise<boolean>
  manageMcp?: (arg: string) => Promise<{ ok: boolean; output: string }>
  setSandboxEnabled?: (enabled: boolean) => void | Promise<void>
  getSandboxEnabled?: () => boolean
  listMemory?: () => Promise<string>
  writeMemory?: (rel: string, content: string) => Promise<string>
  listPlugins?: () => Promise<string>
  invokePluginCommand?: (name: string, args: string) => Promise<string | null>
  invokeSkillFollowUp?: (name: string, args: string) => Promise<string | null>
  doctorExtras?: () => Promise<string[]>
}

export const SLASH_PERMISSION_MODES: PermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
  'dontAsk',
  'auto'
]

export const BUILTIN_SLASH_COMMANDS = [
  'clear',
  'mode',
  'agents',
  'plan',
  'help',
  'compact',
  'status',
  'cost',
  'diff',
  'doctor',
  'hooks',
  'skills',
  'effort',
  'model',
  'context',
  'mcp',
  'setup',
  'web-set',
  'sandbox',
  'memory',
  'plugins',
  'pr',
  'commit'
] as const

export type BuiltinSlashName = (typeof BUILTIN_SLASH_COMMANDS)[number]
