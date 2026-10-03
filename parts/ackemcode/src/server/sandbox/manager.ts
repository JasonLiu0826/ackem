/**
 * Ackem sandbox manager — wraps @anthropic-ai/sandbox-runtime (same ASRT as Claude Code).
 * Integration layer is Ackem-owned; does not paste CC sandbox-adapter.ts.
 */
import {
  SandboxManager as BaseSandboxManager,
  type SandboxAskCallback,
  type SandboxDependencyCheck,
  type SandboxRuntimeConfig,
  windowsInstallInstructions
} from '@anthropic-ai/sandbox-runtime'
import type { PermissionRulesConfig } from '../agent/permissionRules.js'
import { buildSandboxRuntimeConfig } from './config.js'
import {
  shouldUseSandbox,
  shouldUseSandboxFromSettings,
  type SandboxToolInput
} from './shouldUseSandbox.js'
import {
  normalizeSandboxSettings,
  type AckemSandboxSettings
} from './types.js'
import { resolveBashExecutable } from '../tools/shell/resolveBash.js'

let initPromise: Promise<void> | undefined
let lastConfigKey = ''
let currentSettings: AckemSandboxSettings = normalizeSandboxSettings(null)
let currentCwd = process.cwd()
let currentRules: PermissionRulesConfig = { allow: [], deny: [], ask: [] }

function configKey(
  cwd: string,
  sandbox: AckemSandboxSettings,
  rules: PermissionRulesConfig
): string {
  return JSON.stringify({
    cwd,
    sandbox,
    allow: rules.allow,
    deny: rules.deny
  })
}

export function getSandboxSettings(): AckemSandboxSettings {
  return currentSettings
}

export function isSandboxEnabledInSettings(): boolean {
  return Boolean(currentSettings.enabled)
}

export function isSupportedPlatform(): boolean {
  return BaseSandboxManager.isSupportedPlatform()
}

export function checkSandboxDependencies(): SandboxDependencyCheck {
  return BaseSandboxManager.checkDependencies()
}

/**
 * True when settings want sandbox AND platform/deps allow it (CC isSandboxingEnabled).
 */
export function isSandboxingEnabled(): boolean {
  if (!isSandboxEnabledInSettings()) return false
  if (!isSupportedPlatform()) return false
  if (checkSandboxDependencies().errors.length > 0) return false
  return true
}

/**
 * Warn when user set sandbox.enabled but it cannot run (CC getSandboxUnavailableReason).
 */
export function getSandboxUnavailableReason(): string | undefined {
  if (!isSandboxEnabledInSettings()) return undefined
  if (!isSupportedPlatform()) {
    return `sandbox.enabled is set but ${process.platform} is not supported (requires macOS, Linux/WSL2, or Windows with ASRT)`
  }
  const deps = checkSandboxDependencies()
  if (deps.errors.length > 0) {
    const hint =
      process.platform === 'win32'
        ? 'run: npx sandbox-runtime windows-install (one UAC prompt), or POST /api/sandbox/windows-install'
        : process.platform === 'darwin'
          ? 'check sandbox-exec availability / run doctor'
          : 'install bubblewrap/socat (e.g. apt install bubblewrap socat)'
    return `sandbox.enabled is set but dependencies are missing: ${deps.errors.join('; ')} · ${hint}`
  }
  return undefined
}

export function isAutoAllowBashIfSandboxedEnabled(): boolean {
  return currentSettings.autoAllowBashIfSandboxed !== false
}

export function areUnsandboxedCommandsAllowed(): boolean {
  return currentSettings.allowUnsandboxedCommands !== false
}

export async function initializeSandbox(opts: {
  cwd: string
  sandbox?: AckemSandboxSettings | null
  permissionRules?: PermissionRulesConfig
  askNetwork?: SandboxAskCallback
}): Promise<{ ok: boolean; reason?: string }> {
  currentCwd = opts.cwd
  currentSettings = normalizeSandboxSettings(opts.sandbox)
  currentRules = opts.permissionRules ?? { allow: [], deny: [], ask: [] }

  if (!currentSettings.enabled) {
    initPromise = undefined
    lastConfigKey = ''
    return { ok: true, reason: 'sandbox disabled in settings' }
  }

  const unavailable = getSandboxUnavailableReason()
  if (unavailable) {
    return { ok: false, reason: unavailable }
  }

  const key = configKey(currentCwd, currentSettings, currentRules)
  if (initPromise && key === lastConfigKey) {
    await initPromise
    return { ok: true }
  }

  const runtimeConfig = buildSandboxRuntimeConfig({
    cwd: currentCwd,
    sandbox: currentSettings,
    permissionRules: currentRules
  })

  lastConfigKey = key
  initPromise = (async () => {
    try {
      await BaseSandboxManager.initialize(
        runtimeConfig,
        opts.askNetwork,
        process.platform === 'darwin'
      )
    } catch (e) {
      initPromise = undefined
      lastConfigKey = ''
      throw e
    }
  })()

  try {
    await initPromise
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e)
    }
  }
}

export function refreshSandboxConfig(opts?: {
  cwd?: string
  sandbox?: AckemSandboxSettings | null
  permissionRules?: PermissionRulesConfig
}): void {
  if (opts?.cwd) currentCwd = opts.cwd
  if (opts?.sandbox !== undefined) {
    currentSettings = normalizeSandboxSettings(opts.sandbox)
  }
  if (opts?.permissionRules) currentRules = opts.permissionRules
  if (!isSandboxingEnabled()) return
  if (!BaseSandboxManager.getConfig()) return
  const cfg = buildSandboxRuntimeConfig({
    cwd: currentCwd,
    sandbox: currentSettings,
    permissionRules: currentRules
  })
  BaseSandboxManager.updateConfig(cfg)
  lastConfigKey = configKey(currentCwd, currentSettings, currentRules)
}

export function shouldSandboxCommand(input: SandboxToolInput): boolean {
  return shouldUseSandboxFromSettings(
    currentSettings,
    isSandboxingEnabled(),
    input
  )
}

export type SandboxSpawnPlan = {
  useSandbox: boolean
  argv: string[]
  env: NodeJS.ProcessEnv
  binShell?: string
  /**
   * GM-BASH: when settings wanted a sandbox but execution fell back,
   * explain why — never silently claim isolation.
   */
  sandboxFallbackReason?: string
}

/**
 * Prepare spawn argv/env for a shell command (CC Shell.ts + wrapWithSandboxArgv).
 * On Windows, wrapWithSandbox() string form is unsupported — always use Argv API.
 */
export async function prepareSandboxedSpawn(opts: {
  command: string
  shell: 'bash' | 'powershell'
  cwd: string
  dangerouslyDisableSandbox?: boolean
  signal?: AbortSignal
}): Promise<SandboxSpawnPlan> {
  const input: SandboxToolInput = {
    command: opts.command,
    dangerouslyDisableSandbox: opts.dangerouslyDisableSandbox
  }
  const wantSandbox =
    isSandboxEnabledInSettings() &&
    shouldUseSandbox({
      sandboxEnabled: true,
      allowUnsandboxedCommands: areUnsandboxedCommandsAllowed(),
      excludedCommands: currentSettings.excludedCommands ?? [],
      input
    })
  const useSandbox = shouldSandboxCommand(input)
  if (!useSandbox) {
    const plan = unsandboxedPlan(opts)
    // Settings say sandbox, but runtime is not active / excluded / disabled-flag
    if (wantSandbox && !isSandboxingEnabled()) {
      plan.sandboxFallbackReason =
        getSandboxUnavailableReason() ||
        'sandbox.enabled but runtime not ready — running unsandboxed (not isolated)'
    } else if (
      wantSandbox &&
      input.dangerouslyDisableSandbox &&
      areUnsandboxedCommandsAllowed()
    ) {
      plan.sandboxFallbackReason =
        'dangerouslyDisableSandbox — explicitly unsandboxed (not isolated)'
    }
    return plan
  }

  if (initPromise) await initPromise
  if (!BaseSandboxManager.getConfig()) {
    // Enabled in settings but init failed — fail closed to unsandboxed only if
    // allowUnsandboxed; otherwise throw so caller can surface error.
    if (areUnsandboxedCommandsAllowed()) {
      const plan = unsandboxedPlan(opts)
      plan.sandboxFallbackReason =
        getSandboxUnavailableReason() ||
        'Sandbox init failed — running unsandboxed (not isolated)'
      return plan
    }
    throw new Error(
      getSandboxUnavailableReason() ||
        'Sandbox failed to initialize and unsandboxed commands are disallowed'
    )
  }

  const binShell =
    opts.shell === 'powershell'
      ? process.platform === 'win32'
        ? 'powershell.exe'
        : 'pwsh'
      : resolveBashExecutable() || (process.platform === 'win32' ? 'bash.exe' : 'bash')

  const wrapped = await BaseSandboxManager.wrapWithSandboxArgv(
    opts.command,
    binShell,
    undefined,
    opts.signal,
    opts.cwd
  )

  return {
    useSandbox: true,
    argv: wrapped.argv,
    env: wrapped.env,
    binShell
  }
}

function unsandboxedPlan(opts: {
  command: string
  shell: 'bash' | 'powershell'
}): SandboxSpawnPlan {
  const isWin = process.platform === 'win32'
  if (opts.shell === 'powershell') {
    const exe = isWin ? 'powershell.exe' : 'pwsh'
    return {
      useSandbox: false,
      argv: [exe, '-NoProfile', '-NonInteractive', '-Command', opts.command],
      env: process.env
    }
  }
  const exe = resolveBashExecutable() || (isWin ? 'bash.exe' : 'bash')
  return {
    useSandbox: false,
    argv: [exe, '-lc', opts.command],
    env: process.env
  }
}

export function cleanupAfterSandboxedCommand(): void {
  try {
    BaseSandboxManager.cleanupAfterCommand()
  } catch {
    /* ignore */
  }
}

export function annotateSandboxStderr(command: string, stderr: string): string {
  try {
    return BaseSandboxManager.annotateStderrWithSandboxFailures(command, stderr)
  } catch {
    return stderr
  }
}

export async function resetSandbox(): Promise<void> {
  try {
    await BaseSandboxManager.reset()
  } finally {
    initPromise = undefined
    lastConfigKey = ''
  }
}

export function getSandboxStatus(): {
  enabledInSettings: boolean
  active: boolean
  supported: boolean
  unavailableReason?: string
  dependencies: SandboxDependencyCheck
  autoAllowBashIfSandboxed: boolean
  allowUnsandboxedCommands: boolean
  windowsInstallHint?: string
  runtimeConfig?: SandboxRuntimeConfig
} {
  const deps = checkSandboxDependencies()
  return {
    enabledInSettings: isSandboxEnabledInSettings(),
    active: isSandboxingEnabled(),
    supported: isSupportedPlatform(),
    unavailableReason: getSandboxUnavailableReason(),
    dependencies: deps,
    autoAllowBashIfSandboxed: isAutoAllowBashIfSandboxedEnabled(),
    allowUnsandboxedCommands: areUnsandboxedCommandsAllowed(),
    windowsInstallHint:
      process.platform === 'win32' && deps.errors.length
        ? windowsInstallInstructions(undefined)
        : undefined,
    runtimeConfig: BaseSandboxManager.getConfig()
  }
}

/**
 * Blocking trust dialog only when user already opted in (enabled) but
 * OS deps are still missing. Default product posture: sandbox off, no nag.
 */
export function shouldShowSandboxOnboarding(opts: {
  enabledInSettings: boolean
  skipInstallPrompt: boolean
  supported: boolean
  dependencyErrorCount: number
}): boolean {
  return (
    opts.enabledInSettings &&
    opts.supported &&
    opts.dependencyErrorCount > 0 &&
    !opts.skipInstallPrompt
  )
}

export type SandboxOnboardingOptionId =
  | 'install'
  | 'never'
  | 'continue'
  | 'exit'

export type SandboxOnboardingInfo = {
  showPrompt: boolean
  platform: NodeJS.Platform
  supported: boolean
  canInstallWindows: boolean
  dependencyErrors: string[]
  installHint?: string
  skipInstallPrompt: boolean
  enabledInSettings: boolean
  title: string
  body: string
  options: Array<{
    id: SandboxOnboardingOptionId
    label: string
    description?: string
  }>
}

/**
 * Optional OS sandbox consent choices (default = do not install).
 * Auto-prompt only if settings.sandbox.enabled but deps still missing.
 */
export function getSandboxOnboardingInfo(
  sandbox?: AckemSandboxSettings | null
): SandboxOnboardingInfo {
  const sb = normalizeSandboxSettings(sandbox)
  const deps = checkSandboxDependencies()
  const supported = isSupportedPlatform()
  const showPrompt = shouldShowSandboxOnboarding({
    enabledInSettings: Boolean(sb.enabled),
    skipInstallPrompt: Boolean(sb.skipInstallPrompt),
    supported,
    dependencyErrorCount: deps.errors.length
  })
  const canInstallWindows = process.platform === 'win32' && deps.errors.length > 0
  const installHint =
    process.platform === 'win32' && deps.errors.length
      ? windowsInstallInstructions(undefined)
      : process.platform === 'darwin'
        ? 'Check sandbox-exec / ASRT doctor on this Mac.'
        : 'Install bubblewrap and socat (e.g. apt install bubblewrap socat), then retry.'

  const options: SandboxOnboardingInfo['options'] = [
    {
      id: 'continue',
      label: 'Continue without sandbox for now',
      description:
        'Shell runs unsandboxed until dependencies are ready. You can enable later from Settings.'
    },
    {
      id: 'never',
      label: 'Do not install and do not ask again',
      description:
        'Keeps running unsandboxed when deps are missing. Clears this prompt until you opt in from Settings.'
    }
  ]
  if (canInstallWindows) {
    options.push({
      id: 'install',
      label: 'Install OS sandbox and enable it (optional)',
      description:
        'One UAC elevation (windows-install), then turns on settings.sandbox.enabled.'
    })
  } else if (deps.errors.length > 0) {
    options.push({
      id: 'install',
      label: 'I installed dependencies — retry and enable (optional)',
      description: installHint
    })
  } else if (supported) {
    options.push({
      id: 'install',
      label: 'Enable OS sandbox now (optional)',
      description: 'Dependencies look ready. Turns on settings.sandbox.enabled.'
    })
  }
  options.push({
    id: 'exit',
    label: 'Exit AckemCode',
    description: 'Close without changing sandbox settings.'
  })

  return {
    showPrompt,
    platform: process.platform,
    supported,
    canInstallWindows,
    dependencyErrors: deps.errors,
    installHint: deps.errors.length ? installHint : undefined,
    skipInstallPrompt: Boolean(sb.skipInstallPrompt),
    enabledInSettings: Boolean(sb.enabled),
    title: 'OS sandbox (enabled by default)',
    body:
      'Sandbox is on by default. On Windows it needs ASRT (one-time install, may require admin). Until dependencies are ready, shell commands still run unsandboxed when allowUnsandboxedCommands is true.',
    options
  }
}

export { windowsInstallInstructions }
