/**
 * Ackem sandbox settings (CC settings.sandbox shape, Ackem-owned types).
 * OS isolation is provided by @anthropic-ai/sandbox-runtime — same package CC uses.
 */
import { resolveDefaultSandboxEnabled } from './defaults.js'
export type AckemSandboxSettings = {
  /** Master switch. Default true (Ackem); explicit false in saved settings respected. */
  enabled?: boolean
  /**
   * When true and sandbox is actively wrapping the command, bash/powershell
   * may auto-allow without a permission prompt (CC autoAllowBashIfSandboxed).
   * Default true when unset.
   */
  autoAllowBashIfSandboxed?: boolean
  /**
   * Allow model to set dangerouslyDisableSandbox / run outside the cage.
   * Default true when unset. Set false to force sandbox always.
   */
  allowUnsandboxedCommands?: boolean
  /** Convenience patterns that skip sandbox (NOT a security boundary). */
  excludedCommands?: string[]
  /**
   * User chose "continue without sandbox and don't ask again" on the
   * first-run onboarding dialog. Does not disable sandbox if already enabled.
   */
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

export const DEFAULT_SANDBOX_SETTINGS: Required<
  Pick<
    AckemSandboxSettings,
    'enabled' | 'autoAllowBashIfSandboxed' | 'allowUnsandboxedCommands'
  >
> &
  AckemSandboxSettings = {
  enabled: resolveDefaultSandboxEnabled(),
  autoAllowBashIfSandboxed: true,
  allowUnsandboxedCommands: true,
  excludedCommands: [],
  skipInstallPrompt: false,
  network: { allowedDomains: [], deniedDomains: [] },
  filesystem: {}
}

export function normalizeSandboxSettings(
  raw?: AckemSandboxSettings | null
): AckemSandboxSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SANDBOX_SETTINGS }
  }
  const arr = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : []
  return {
    enabled:
      raw.enabled === undefined
        ? resolveDefaultSandboxEnabled()
        : Boolean(raw.enabled),
    autoAllowBashIfSandboxed:
      raw.autoAllowBashIfSandboxed === undefined
        ? true
        : Boolean(raw.autoAllowBashIfSandboxed),
    allowUnsandboxedCommands:
      raw.allowUnsandboxedCommands === undefined
        ? true
        : Boolean(raw.allowUnsandboxedCommands),
    excludedCommands: arr(raw.excludedCommands),
    skipInstallPrompt: Boolean(raw.skipInstallPrompt),
    network: {
      allowedDomains: arr(raw.network?.allowedDomains),
      deniedDomains: arr(raw.network?.deniedDomains),
      allowUnixSockets: arr(raw.network?.allowUnixSockets),
      allowAllUnixSockets: Boolean(raw.network?.allowAllUnixSockets),
      allowLocalBinding: Boolean(raw.network?.allowLocalBinding),
      httpProxyPort:
        typeof raw.network?.httpProxyPort === 'number'
          ? raw.network.httpProxyPort
          : undefined,
      socksProxyPort:
        typeof raw.network?.socksProxyPort === 'number'
          ? raw.network.socksProxyPort
          : undefined
    },
    filesystem: {
      allowWrite: arr(raw.filesystem?.allowWrite),
      denyWrite: arr(raw.filesystem?.denyWrite),
      denyRead: arr(raw.filesystem?.denyRead),
      allowRead: arr(raw.filesystem?.allowRead)
    },
    enableWeakerNestedSandbox: Boolean(raw.enableWeakerNestedSandbox),
    enableWeakerNetworkIsolation: Boolean(raw.enableWeakerNetworkIsolation),
    ignoreViolations:
      raw.ignoreViolations && typeof raw.ignoreViolations === 'object'
        ? raw.ignoreViolations
        : undefined
  }
}
