/**
 * Multi-layer permission rules loader (CC permissionsLoader spirit).
 *
 * Layers (later sources append; deny from any layer still wins at eval time):
 *   user   → ~/.ackemcode/settings.json
 *   project→ {cwd}/.ackemcode/settings.json
 *   local  → {cwd}/.ackemcode/settings.local.json
 *   host   → Ackem UI / data/settings.json (passed in)
 *   flag   → ACKEM_FLAG_SETTINGS path (CLI/runtime overlay)
 *   policy → managed-settings.json (enterprise / org) — highest precedence append
 *
 * D3: policy + flag + allowManagedPermissionRulesOnly + layer-aware dangerous strip.
 *
 * File shapes accepted:
 *   { "permissionRules": { "allow"|"deny"|"ask": string[] } }   // Ackem
 *   { "permissions": { "allow"|"deny"|"ask": string[] } }       // CC-compat
 *   policy may also set allowManagedPermissionRulesOnly, permissionsStripDangerous,
 *   disableBypassPermissionsMode
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  EMPTY_PERMISSION_RULES,
  normalizePermissionRules,
  type PermissionRulesConfig
} from './permissionRules.js'
import {
  resolveStripDangerousMode,
  shouldStripDangerousAllows,
  stripDangerousAllowRules,
  type DangerousAllowHit,
  type StripDangerousMode
} from './dangerousAllowRules.js'

/** Editable + runtime + managed sources (CC SettingSource spirit). */
export type PermissionRuleSource =
  | 'user'
  | 'project'
  | 'local'
  | 'host'
  | 'flag'
  | 'policy'

/** Sources whose dangerous allows may be stripped (not org policy). */
export const EDITABLE_PERMISSION_SOURCES: readonly PermissionRuleSource[] = [
  'user',
  'project',
  'local',
  'host',
  'flag'
] as const

export type LayeredRules = {
  source: PermissionRuleSource
  path: string
  rules: PermissionRulesConfig
  /** True when file existed and was read (host always true). */
  present: boolean
  /** Dangerous allows removed from this layer before merge. */
  strippedFromLayer?: DangerousAllowHit[]
}

export type PolicyControls = {
  /** When true, only policy layer rules are used (CC allowManagedPermissionRulesOnly). */
  allowManagedPermissionRulesOnly: boolean
  /** Optional strip mode override from managed-settings.json */
  permissionsStripDangerous?: StripDangerousMode
  /** When true, bypassPermissions mode is refused (CC policy spirit). */
  disableBypassPermissionsMode: boolean
}

export type EffectivePermissionRules = {
  rules: PermissionRulesConfig
  layers: LayeredRules[]
  stripped: DangerousAllowHit[]
  stripMode: StripDangerousMode
  strippedApplied: boolean
  /** True when only policy rules are active. */
  managedOnly: boolean
  policy: PolicyControls
}

export function ackemUserSettingsPath(): string {
  return path.join(os.homedir(), '.ackemcode', 'settings.json')
}

export function ackemProjectSettingsPath(cwd: string): string {
  return path.join(path.resolve(cwd), '.ackemcode', 'settings.json')
}

export function ackemLocalSettingsPath(cwd: string): string {
  return path.join(path.resolve(cwd), '.ackemcode', 'settings.local.json')
}

/** Default managed policy path (CC managed-settings.json spirit). */
export function ackemPolicySettingsPath(): string {
  const env = process.env.ACKEM_POLICY_SETTINGS?.trim()
  if (env) return path.resolve(env)
  return path.join(os.homedir(), '.ackemcode', 'managed-settings.json')
}

/**
 * Extra policy candidates (first existing file wins after ACKEM_POLICY_SETTINGS).
 * Linux-style /etc drop-in; Windows ProgramData optional.
 */
export function ackemPolicySettingsCandidates(): string[] {
  const env = process.env.ACKEM_POLICY_SETTINGS?.trim()
  if (env) return [path.resolve(env)]
  const home = path.join(os.homedir(), '.ackemcode', 'managed-settings.json')
  const candidates = [home]
  if (process.platform === 'win32') {
    const pd = process.env.PROGRAMDATA
    if (pd) {
      candidates.push(path.join(pd, 'AckemCode', 'managed-settings.json'))
    }
  } else {
    candidates.push('/etc/ackemcode/managed-settings.json')
  }
  return candidates
}

export function ackemFlagSettingsPath(): string | null {
  const env = process.env.ACKEM_FLAG_SETTINGS?.trim()
  if (!env) return null
  return path.resolve(env)
}

function extractRulesFromJson(data: unknown): PermissionRulesConfig {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ...EMPTY_PERMISSION_RULES }
  }
  const o = data as Record<string, unknown>
  if (o.permissionRules != null) {
    return normalizePermissionRules(o.permissionRules)
  }
  if (o.permissions != null) {
    return normalizePermissionRules(o.permissions)
  }
  if (o.allow != null || o.deny != null || o.ask != null) {
    return normalizePermissionRules(o)
  }
  return { ...EMPTY_PERMISSION_RULES }
}

function parseStripMode(raw: unknown): StripDangerousMode | undefined {
  if (typeof raw !== 'string') return undefined
  const v = raw.trim().toLowerCase()
  if (v === 'never' || v === '0' || v === 'false' || v === 'off') return 'never'
  if (v === 'always' || v === '1' || v === 'true' || v === 'on') return 'always'
  if (v === 'strict') return 'strict'
  if (v === 'auto') return 'auto'
  return undefined
}

export function extractPolicyControls(data: unknown): PolicyControls {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      allowManagedPermissionRulesOnly: false,
      disableBypassPermissionsMode: false
    }
  }
  const o = data as Record<string, unknown>
  return {
    allowManagedPermissionRulesOnly:
      o.allowManagedPermissionRulesOnly === true ||
      o.allowManagedPermissionsOnly === true,
    permissionsStripDangerous: parseStripMode(
      o.permissionsStripDangerous ?? o.stripDangerousAllows
    ),
    disableBypassPermissionsMode:
      o.disableBypassPermissionsMode === true ||
      o.disableBypassPermissions === true
  }
}

async function readJsonFile(
  filePath: string
): Promise<{ data: unknown; present: boolean }> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    if (!raw.trim()) return { data: {}, present: true }
    return { data: JSON.parse(raw) as unknown, present: true }
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err?.code === 'ENOENT') return { data: null, present: false }
    return { data: null, present: false }
  }
}

async function readRulesFile(
  filePath: string
): Promise<{ rules: PermissionRulesConfig; present: boolean; data: unknown }> {
  const { data, present } = await readJsonFile(filePath)
  if (!present || data == null) {
    return {
      rules: { ...EMPTY_PERMISSION_RULES },
      present: false,
      data: null
    }
  }
  return { rules: extractRulesFromJson(data), present: true, data }
}

/** Dedupe preserving first-seen order. */
function uniq(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of list) {
    const k = r.trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

export function mergePermissionRuleLayers(
  layers: PermissionRulesConfig[]
): PermissionRulesConfig {
  const allow: string[] = []
  const deny: string[] = []
  const ask: string[] = []
  for (const layer of layers) {
    allow.push(...layer.allow)
    deny.push(...layer.deny)
    ask.push(...layer.ask)
  }
  return {
    allow: uniq(allow),
    deny: uniq(deny),
    ask: uniq(ask)
  }
}

export function isEditablePermissionSource(
  source: PermissionRuleSource
): boolean {
  return (EDITABLE_PERMISSION_SOURCES as readonly string[]).includes(source)
}

/**
 * Strip dangerous allows from editable layers only; policy keeps org allows.
 */
export function applyLayerAwareDangerousStrip(
  layers: LayeredRules[],
  stripApplied: boolean
): { layers: LayeredRules[]; stripped: DangerousAllowHit[] } {
  const stripped: DangerousAllowHit[] = []
  const next = layers.map((layer) => {
    if (!stripApplied || !isEditablePermissionSource(layer.source)) {
      return { ...layer, strippedFromLayer: [] as DangerousAllowHit[] }
    }
    const r = stripDangerousAllowRules(layer.rules.allow)
    stripped.push(...r.stripped)
    return {
      ...layer,
      rules: { ...layer.rules, allow: r.allow },
      strippedFromLayer: r.stripped
    }
  })
  return { layers: next, stripped }
}

async function resolvePolicyFilePath(): Promise<string> {
  for (const p of ackemPolicySettingsCandidates()) {
    try {
      await fs.access(p)
      return p
    } catch {
      /* try next */
    }
  }
  return ackemPolicySettingsPath()
}

/**
 * Load + merge permission rules from disk layers and host (UI) rules.
 */
export async function loadLayeredPermissionRules(opts: {
  cwd: string
  hostRules?: PermissionRulesConfig
}): Promise<{ layers: LayeredRules[]; policy: PolicyControls }> {
  const cwd = path.resolve(opts.cwd || process.cwd())
  const policyPath = await resolvePolicyFilePath()
  const flagPath = ackemFlagSettingsPath()

  const specs: { source: PermissionRuleSource; path: string }[] = [
    { source: 'user', path: ackemUserSettingsPath() },
    { source: 'project', path: ackemProjectSettingsPath(cwd) },
    { source: 'local', path: ackemLocalSettingsPath(cwd) }
  ]

  const layers: LayeredRules[] = []
  for (const s of specs) {
    const { rules, present } = await readRulesFile(s.path)
    layers.push({ source: s.source, path: s.path, rules, present })
  }

  layers.push({
    source: 'host',
    path: '(host settings / data/settings.json)',
    rules: normalizePermissionRules(opts.hostRules ?? EMPTY_PERMISSION_RULES),
    present: true
  })

  if (flagPath) {
    const { rules, present } = await readRulesFile(flagPath)
    layers.push({ source: 'flag', path: flagPath, rules, present })
  } else {
    layers.push({
      source: 'flag',
      path: '(ACKEM_FLAG_SETTINGS unset)',
      rules: { ...EMPTY_PERMISSION_RULES },
      present: false
    })
  }

  const policyRead = await readRulesFile(policyPath)
  layers.push({
    source: 'policy',
    path: policyPath,
    rules: policyRead.rules,
    present: policyRead.present
  })

  const policy = extractPolicyControls(policyRead.data)

  return { layers, policy }
}

export async function resolveEffectivePermissionRules(opts: {
  cwd: string
  hostRules?: PermissionRulesConfig
  /** Current permission mode — used when stripMode is 'auto'. */
  permissionMode?: string
  /** Override env / policy strip mode. */
  stripMode?: StripDangerousMode
}): Promise<EffectivePermissionRules> {
  const { layers: loaded, policy } = await loadLayeredPermissionRules({
    cwd: opts.cwd,
    hostRules: opts.hostRules
  })

  const managedOnly = policy.allowManagedPermissionRulesOnly === true

  // Managed-only: only policy rules participate (CC shouldAllowManagedPermissionRulesOnly)
  let activeLayers = managedOnly
    ? loaded.map((l) =>
        l.source === 'policy'
          ? l
          : {
              ...l,
              rules: { ...EMPTY_PERMISSION_RULES }
            }
      )
    : loaded

  const stripMode =
    opts.stripMode ??
    policy.permissionsStripDangerous ??
    resolveStripDangerousMode()

  const strippedApplied = shouldStripDangerousAllows(
    opts.permissionMode,
    stripMode
  )

  let stripped: DangerousAllowHit[] = []
  if (strippedApplied) {
    const r = applyLayerAwareDangerousStrip(activeLayers, true)
    activeLayers = r.layers
    stripped = r.stripped
  } else {
    // Diagnostics: what would strip from editable layers
    stripped = applyLayerAwareDangerousStrip(activeLayers, true).stripped
  }

  const merged = mergePermissionRuleLayers(activeLayers.map((l) => l.rules))

  return {
    rules: merged,
    layers: activeLayers,
    stripped: strippedApplied ? stripped : [],
    stripMode,
    strippedApplied,
    managedOnly,
    policy
  }
}

/** Sync helper for tests (in-memory layers only). */
export function resolveEffectivePermissionRulesSync(opts: {
  layers: Array<PermissionRulesConfig | LayeredRules>
  permissionMode?: string
  stripMode?: StripDangerousMode
  policy?: Partial<PolicyControls>
}): EffectivePermissionRules {
  const policy: PolicyControls = {
    allowManagedPermissionRulesOnly:
      opts.policy?.allowManagedPermissionRulesOnly === true,
    permissionsStripDangerous: opts.policy?.permissionsStripDangerous,
    disableBypassPermissionsMode:
      opts.policy?.disableBypassPermissionsMode === true
  }

  const sources: PermissionRuleSource[] = [
    'user',
    'project',
    'local',
    'host',
    'flag',
    'policy'
  ]

  let layered: LayeredRules[] = opts.layers.map((item, i) => {
    if (
      item &&
      typeof item === 'object' &&
      'source' in item &&
      'rules' in item
    ) {
      const L = item as LayeredRules
      return {
        source: L.source,
        path: L.path || `layer-${i}`,
        rules: normalizePermissionRules(L.rules),
        present: L.present !== false
      }
    }
    return {
      source: sources[i] ?? 'host',
      path: `layer-${i}`,
      rules: normalizePermissionRules(item as PermissionRulesConfig),
      present: true
    }
  })

  const managedOnly = policy.allowManagedPermissionRulesOnly
  if (managedOnly) {
    layered = layered.map((l) =>
      l.source === 'policy'
        ? l
        : { ...l, rules: { ...EMPTY_PERMISSION_RULES } }
    )
  }

  const stripMode =
    opts.stripMode ??
    policy.permissionsStripDangerous ??
    resolveStripDangerousMode()
  const strippedApplied = shouldStripDangerousAllows(
    opts.permissionMode,
    stripMode
  )

  let stripped: DangerousAllowHit[] = []
  if (strippedApplied) {
    const r = applyLayerAwareDangerousStrip(layered, true)
    layered = r.layers
    stripped = r.stripped
  }

  return {
    rules: mergePermissionRuleLayers(layered.map((l) => l.rules)),
    layers: layered,
    stripped,
    stripMode,
    strippedApplied,
    managedOnly,
    policy
  }
}

/**
 * If policy disables bypass, coerce mode away from bypassPermissions.
 */
export function coercePermissionModeUnderPolicy(
  mode: string,
  policy: PolicyControls
): string {
  if (
    policy.disableBypassPermissionsMode &&
    mode === 'bypassPermissions'
  ) {
    return 'default'
  }
  return mode
}
