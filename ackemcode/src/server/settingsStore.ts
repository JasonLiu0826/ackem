import fs from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AckemCodeSettings } from '../shared/types.js'
import { DEFAULT_SETTINGS } from '../shared/types.js'
import { normalizePermissionRules } from './agent/permissionRules.js'
import { normalizeSandboxSettings } from './sandbox/types.js'
import { parseContextWindow } from './agent/compact/contextWindow.js'
import { mergeMcpPresets } from './mcp/seedPresets.js'
import {
  migrateLegacyStandalone,
  normalizeRegisteredModels,
  type RegisteredModelEntry,
  upsertRegisteredModel
} from './llm/modelRegistry.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = path.resolve(__dirname, '../../data')
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json')
const STANDALONE_PATH = path.join(DATA_DIR, 'settings.standalone.json')
const INLINE_PATH = path.join(DATA_DIR, 'settings.inline.json')

export type StandaloneLlmSettings = {
  apiBaseUrl: string
  apiKey: string
  model: string
  contextWindow?: number
  llmVendorId?: string
  llmSetupComplete?: boolean
  registeredModels?: RegisteredModelEntry[]
}

export const DEFAULT_STANDALONE: StandaloneLlmSettings = {
  apiBaseUrl: DEFAULT_SETTINGS.apiBaseUrl,
  apiKey: '',
  model: DEFAULT_SETTINGS.model,
  llmVendorId: 'custom',
  llmSetupComplete: false
}

export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

export async function loadSettings(): Promise<AckemCodeSettings> {
  await ensureDataDir()
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AckemCodeSettings>
    const base: AckemCodeSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      cwd: parsed.cwd || process.cwd(),
      useClaudeSkills:
        typeof parsed.useClaudeSkills === 'boolean'
          ? parsed.useClaudeSkills
          : DEFAULT_SETTINGS.useClaudeSkills,
      extraSkillDirs: Array.isArray(parsed.extraSkillDirs)
        ? parsed.extraSkillDirs.filter((d): d is string => typeof d === 'string')
        : DEFAULT_SETTINGS.extraSkillDirs,
      mcpServers: mergeMcpPresets(
        parsed.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)
          ? (parsed.mcpServers as AckemCodeSettings['mcpServers'])
          : DEFAULT_SETTINGS.mcpServers
      ),
      lspServers:
        parsed.lspServers && typeof parsed.lspServers === 'object' && !Array.isArray(parsed.lspServers)
          ? (parsed.lspServers as AckemCodeSettings['lspServers'])
          : DEFAULT_SETTINGS.lspServers,
      lspEnabled:
        typeof parsed.lspEnabled === 'boolean'
          ? parsed.lspEnabled
          : DEFAULT_SETTINGS.lspEnabled,
      autoMemoryEnabled:
        typeof parsed.autoMemoryEnabled === 'boolean'
          ? parsed.autoMemoryEnabled
          : DEFAULT_SETTINGS.autoMemoryEnabled,
      webSearch:
        parsed.webSearch && typeof parsed.webSearch === 'object' && !Array.isArray(parsed.webSearch)
          ? {
              ...DEFAULT_SETTINGS.webSearch,
              ...(parsed.webSearch as AckemCodeSettings['webSearch'])
            }
          : DEFAULT_SETTINGS.webSearch,
      hooks:
        parsed.hooks && typeof parsed.hooks === 'object' && !Array.isArray(parsed.hooks)
          ? (parsed.hooks as AckemCodeSettings['hooks'])
          : DEFAULT_SETTINGS.hooks,
      disableAllHooks:
        typeof parsed.disableAllHooks === 'boolean'
          ? parsed.disableAllHooks
          : DEFAULT_SETTINGS.disableAllHooks,
      verifyCommand:
        typeof parsed.verifyCommand === 'string'
          ? parsed.verifyCommand
          : DEFAULT_SETTINGS.verifyCommand,
      planExploreAgents: (() => {
        const n = parsed.planExploreAgents
        if (typeof n !== 'number' || !Number.isFinite(n)) {
          return DEFAULT_SETTINGS.planExploreAgents
        }
        return Math.max(1, Math.min(10, Math.floor(n)))
      })(),
      agentTier: (() => {
        const t = parsed.agentTier
        return t === 'solo' || t === 'auto' || t === 'team'
          ? t
          : DEFAULT_SETTINGS.agentTier
      })(),
      autoMode: (() => {
        const am = parsed.autoMode
        if (!am || typeof am !== 'object' || Array.isArray(am)) {
          return DEFAULT_SETTINGS.autoMode
        }
        const arr = (v: unknown) =>
          Array.isArray(v)
            ? v.filter((x): x is string => typeof x === 'string')
            : []
        return {
          allow: arr(am.allow),
          softDeny: arr(am.softDeny),
          environment: arr(am.environment),
          model: typeof am.model === 'string' ? am.model : undefined
        }
      })(),
      sandbox: normalizeSandboxSettings(
        parsed.sandbox as Parameters<typeof normalizeSandboxSettings>[0]
      ),
      permissionRules: normalizePermissionRules(parsed.permissionRules),
      contextWindow: parseContextWindow(parsed.contextWindow),
      multimodal: (() => {
        const m = parsed.multimodal
        return m === 'off' || m === 'vision' || m === 'auto' ? m : 'auto'
      })(),
      browserOnboarding: (() => {
        const b = parsed.browserOnboarding
        if (!b || typeof b !== 'object' || Array.isArray(b)) {
          return DEFAULT_SETTINGS.browserOnboarding
        }
        return {
          skipPrompt: b.skipPrompt === true,
          lastShownAt: typeof b.lastShownAt === 'string' ? b.lastShownAt : undefined,
          lastChoice:
            b.lastChoice === 'open_store' ||
            b.lastChoice === 'installed' ||
            b.lastChoice === 'isolated' ||
            b.lastChoice === 'later' ||
            b.lastChoice === 'never'
              ? b.lastChoice
              : undefined
        }
      })()
    }
    return overlayStandaloneLlm(base)
  } catch {
    const fallback = {
      ...DEFAULT_SETTINGS,
      cwd: process.cwd(),
      mcpServers: mergeMcpPresets({})
    }
    return overlayStandaloneLlm(fallback)
  }
}

function overlayStandaloneLlm(settings: AckemCodeSettings): AckemCodeSettings {
  try {
    const raw = requireStandaloneSync()
    if (!raw) return settings
    const overlay: Partial<AckemCodeSettings> = {}
    if (raw.apiBaseUrl) overlay.apiBaseUrl = raw.apiBaseUrl
    if (raw.apiKey) overlay.apiKey = raw.apiKey
    if (raw.model) overlay.model = raw.model
    if (raw.contextWindow != null) overlay.contextWindow = raw.contextWindow
    return { ...settings, ...overlay }
  } catch {
    return settings
  }
}

function requireStandaloneSync(): StandaloneLlmSettings | null {
  try {
    if (!existsSync(STANDALONE_PATH)) return null
    const raw = readFileSync(STANDALONE_PATH, 'utf8')
    return normalizeStandalone(JSON.parse(raw))
  } catch {
    return null
  }
}

export function normalizeStandalone(raw: unknown): StandaloneLlmSettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const base: StandaloneLlmSettings = {
    apiBaseUrl:
      typeof o.apiBaseUrl === 'string' && o.apiBaseUrl.trim()
        ? o.apiBaseUrl.trim()
        : DEFAULT_STANDALONE.apiBaseUrl,
    apiKey: typeof o.apiKey === 'string' ? o.apiKey : '',
    model:
      typeof o.model === 'string' && o.model.trim()
        ? o.model.trim()
        : DEFAULT_STANDALONE.model,
    contextWindow: parseContextWindow(o.contextWindow),
    llmVendorId: typeof o.llmVendorId === 'string' ? o.llmVendorId : 'custom',
    llmSetupComplete: o.llmSetupComplete === true,
    registeredModels: normalizeRegisteredModels(o.registeredModels)
  }
  base.registeredModels = migrateLegacyStandalone(base)
  return base
}

export async function loadStandaloneSettings(): Promise<StandaloneLlmSettings> {
  await ensureDataDir()
  try {
    const raw = await fs.readFile(STANDALONE_PATH, 'utf8')
    return normalizeStandalone(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_STANDALONE }
  }
}

export async function saveStandaloneSettings(
  patch: Partial<StandaloneLlmSettings>
): Promise<StandaloneLlmSettings> {
  const current = await loadStandaloneSettings()
  const next = normalizeStandalone({ ...current, ...patch })
  if (next.apiKey && next.model && next.apiBaseUrl) {
    next.llmSetupComplete = patch.llmSetupComplete === false ? false : true
  }
  if (
    patch.llmSetupComplete === true &&
    next.apiKey.trim() &&
    next.model.trim() &&
    next.apiBaseUrl.trim()
  ) {
    next.registeredModels = upsertRegisteredModel(next.registeredModels, {
      model: next.model,
      apiBaseUrl: next.apiBaseUrl,
      apiKey: next.apiKey,
      contextWindow: next.contextWindow
    })
  }
  await ensureDataDir()
  await fs.writeFile(STANDALONE_PATH, JSON.stringify(next, null, 2), 'utf8')
  return next
}

export async function standaloneConfigured(): Promise<boolean> {
  const s = await loadStandaloneSettings()
  if (s.apiKey.trim()) return true
  const legacy = await loadSettings()
  return Boolean(legacy.apiKey?.trim())
}

export function standalonePath(): string {
  return STANDALONE_PATH
}

export function publicSettingsView<T extends { apiKey?: string; webSearch?: AckemCodeSettings['webSearch'] }>(
  s: T
): T & { hasApiKey: boolean } {
  const ws = s.webSearch
  return {
    ...s,
    apiKey: s.apiKey ? '••••' + s.apiKey.slice(-4) : '',
    hasApiKey: Boolean(s.apiKey),
    webSearch: ws
      ? {
          ...ws,
          apiKey: ws.apiKey ? '••••' + ws.apiKey.slice(-4) : ''
        }
      : ws
  }
}

export async function saveSettings(patch: Partial<AckemCodeSettings>): Promise<AckemCodeSettings> {
  const current = await loadSettings()
  const next: AckemCodeSettings = { ...current, ...patch }
  if (patch.webSearch !== undefined) {
    const ws = { ...current.webSearch, ...patch.webSearch }
    if (!ws.apiKey?.trim() || ws.apiKey.includes('••••')) {
      ws.apiKey = current.webSearch?.apiKey
    }
    next.webSearch = ws
  }
  if (patch.contextWindow !== undefined) {
    next.contextWindow = parseContextWindow(patch.contextWindow)
  }
  if (patch.permissionRules !== undefined) {
    next.permissionRules = normalizePermissionRules(patch.permissionRules)
  }
  if (patch.sandbox !== undefined) {
    next.sandbox = normalizeSandboxSettings(patch.sandbox)
  }
  if (patch.browserOnboarding !== undefined) {
    next.browserOnboarding = {
      ...current.browserOnboarding,
      ...patch.browserOnboarding
    }
  }
  await ensureDataDir()
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf8')
  return next
}

/** Append an allow rule if not already present (always-allow from UI). */
export async function appendAllowRule(
  rule: string,
  opts?: { explicit?: boolean }
): Promise<AckemCodeSettings> {
  const { isDangerousAllowRuleString } = await import('./agent/dangerousAllowRules.js')
  const hit = isDangerousAllowRuleString(rule)
  if (hit && !opts?.explicit) {
    throw new Error(
      `Refusing to persist dangerous allow rule: ${hit.raw} (${hit.reason})`
    )
  }
  const current = await loadSettings()
  const allow = [...current.permissionRules.allow]
  if (!allow.includes(rule)) allow.push(rule)
  return saveSettings({
    permissionRules: {
      ...current.permissionRules,
      allow
    }
  })
}
