/**
 * Run a single command/http hook — CC executeHooks spirit (exit 2 = blocking).
 */
import { spawn } from 'node:child_process'
import { assertSafeHostname } from '../tools/webFetch/ssrf.js'
import type {
  HookConfig,
  HookEventName,
  HookInput,
  SingleHookResult,
  SyncHookJson
} from './types.js'
import {
  getHookEnvFilePath,
  getSessionHookEnvVars,
  isEnvFileHookEvent,
  shouldPassClaudeEnvFile,
  type EnvFileHookEvent
} from './sessionEnv.js'

const DEFAULT_TIMEOUT_SEC = 60
/** Cap wall time even if misconfigured */
const MAX_TIMEOUT_SEC = 600

export type ExecuteHookOpts = {
  event?: HookEventName | string
  hookIndex?: number
  sessionId?: string
}

function parseJsonOutput(stdout: string): SyncHookJson | undefined {
  const t = stdout.trim()
  if (!t) return undefined
  // Prefer last JSON object in stdout
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(t.slice(start, end + 1)) as SyncHookJson
  } catch {
    return undefined
  }
}

function isBlockingResult(
  exitCode: number,
  json?: SyncHookJson
): { blocking: boolean; message: string } {
  if (json?.decision === 'block') {
    return {
      blocking: true,
      message: json.reason || json.stopReason || 'Hook blocked this action'
    }
  }
  // continue:false → preventContinuation in merge (not exit-2 hard block)
  const pre = json?.hookSpecificOutput as
    | { permissionDecision?: string; permissionDecisionReason?: string }
    | undefined
  if (pre?.permissionDecision === 'deny') {
    return {
      blocking: true,
      message:
        pre.permissionDecisionReason ||
        json?.reason ||
        'Hook denied this tool use'
    }
  }
  if (exitCode === 2) {
    return {
      blocking: true,
      message:
        json?.reason ||
        json?.stopReason ||
        (json as { systemMessage?: string } | undefined)?.systemMessage ||
        'Hook blocked (exit code 2)'
    }
  }
  return { blocking: false, message: '' }
}

function interpolateHeaders(
  headers: Record<string, string> | undefined,
  allowed: string[] | undefined
): Record<string, string> {
  if (!headers) return {}
  const allow = new Set(allowed ?? [])
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k] = v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, a, b) => {
      const name = (a || b) as string
      if (!allow.has(name)) return ''
      return process.env[name] ?? ''
    })
  }
  return out
}

async function runCommandHook(
  hook: Extract<HookConfig, { type: 'command' }>,
  input: HookInput,
  cwd: string,
  signal?: AbortSignal,
  execOpts?: ExecuteHookOpts
): Promise<SingleHookResult> {
  const timeoutSec = Math.min(
    MAX_TIMEOUT_SEC,
    Math.max(1, hook.timeout ?? DEFAULT_TIMEOUT_SEC)
  )
  const payload = JSON.stringify(input) + '\n'
  const isWin = process.platform === 'win32'
  const shell = hook.shell === 'powershell' ? 'powershell' : 'bash'
  let exe: string
  let args: string[]
  if (shell === 'powershell') {
    exe = isWin ? 'powershell.exe' : 'pwsh'
    args = ['-NoProfile', '-NonInteractive', '-Command', hook.command]
  } else {
    exe = isWin ? 'bash.exe' : 'bash'
    args = ['-lc', hook.command]
  }

  const sessionEnv = await getSessionHookEnvVars(execOpts?.sessionId)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...sessionEnv,
    CLAUDE_PROJECT_DIR: cwd,
    ACKEM_PROJECT_DIR: cwd
  }

  const eventName = execOpts?.event || input.hook_event_name
  if (
    shouldPassClaudeEnvFile({ event: eventName, shell }) &&
    isEnvFileHookEvent(eventName)
  ) {
    const filePath = await getHookEnvFilePath(
      eventName as EnvFileHookEvent,
      execOpts?.hookIndex ?? 0,
      execOpts?.sessionId ||
        ('session_id' in input ? String(input.session_id) : undefined)
    )
    // Ensure empty file exists so hooks can append exports
    try {
      const fs = await import('node:fs/promises')
      await fs.writeFile(filePath, '')
    } catch {
      /* ignore */
    }
    env.CLAUDE_ENV_FILE = filePath
    env.ACKEM_ENV_FILE = filePath
  }

  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: 'aborted',
        blocking: false,
        blockMessage: '',
        error: 'aborted'
      })
      return
    }

    const child = spawn(exe, args, {
      cwd,
      env,
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (r: SingleHookResult) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      resolve(r)
    }
    const onAbort = () => {
      child.kill()
      finish({
        exitCode: 1,
        stdout,
        stderr: stderr || 'aborted',
        blocking: false,
        blockMessage: '',
        error: 'aborted'
      })
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const timer = setTimeout(() => {
      child.kill()
      finish({
        exitCode: 1,
        stdout,
        stderr: stderr + `\nHook timed out after ${timeoutSec}s`,
        blocking: false,
        blockMessage: '',
        timedOut: true,
        error: 'timeout'
      })
    }, timeoutSec * 1000)

    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      finish({
        exitCode: 1,
        stdout,
        stderr: err.message,
        blocking: false,
        blockMessage: '',
        error: err.message
      })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const exitCode = code ?? 1
      const json = parseJsonOutput(stdout)
      const { blocking, message } = isBlockingResult(exitCode, json)
      const blockMessage =
        message ||
        (blocking ? stderr.trim() || stdout.trim() || `exit ${exitCode}` : '')
      finish({
        exitCode,
        stdout,
        stderr,
        json,
        blocking,
        blockMessage
      })
    })

    try {
      child.stdin.write(payload)
      child.stdin.end()
    } catch {
      /* ignore */
    }
  })
}

async function runHttpHook(
  hook: Extract<HookConfig, { type: 'http' }>,
  input: HookInput,
  signal?: AbortSignal
): Promise<SingleHookResult> {
  const timeoutSec = Math.min(
    MAX_TIMEOUT_SEC,
    Math.max(1, hook.timeout ?? DEFAULT_TIMEOUT_SEC)
  )
  try {
    const u = new URL(hook.url)
    // Hooks may target local policy servers — allow loopback
    await assertSafeHostname(u.hostname, { allowLoopback: true })
  } catch (e) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: e instanceof Error ? e.message : String(e),
      blocking: false,
      blockMessage: '',
      error: 'ssrf'
    }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutSec * 1000)
  const onParent = () => ctrl.abort()
  signal?.addEventListener('abort', onParent, { once: true })

  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...interpolateHeaders(hook.headers, hook.allowedEnvVars)
      },
      body: JSON.stringify(input),
      signal: ctrl.signal,
      redirect: 'manual'
    })
    if (res.status >= 300 && res.status < 400) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `HTTP redirects not allowed (${res.status})`,
        blocking: false,
        blockMessage: '',
        error: 'redirect'
      }
    }
    const text = await res.text()
    let json: SyncHookJson | undefined
    if (text.trim()) {
      try {
        json = JSON.parse(text) as SyncHookJson
      } catch {
        return {
          exitCode: 1,
          stdout: text,
          stderr: 'HTTP hook response is not JSON',
          blocking: false,
          blockMessage: '',
          error: 'invalid_json'
        }
      }
    } else {
      json = {}
    }
    const exitCode = res.ok ? 0 : res.status === 403 ? 2 : 1
    const { blocking, message } = isBlockingResult(exitCode, json)
    return {
      exitCode,
      stdout: text,
      stderr: res.ok ? '' : `HTTP ${res.status}`,
      json,
      blocking,
      blockMessage: message
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      exitCode: 1,
      stdout: '',
      stderr: msg,
      blocking: false,
      blockMessage: '',
      error: msg.includes('abort') ? 'timeout' : msg,
      timedOut: msg.includes('abort')
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onParent)
  }
}

export async function executeHook(
  hook: HookConfig,
  input: HookInput,
  cwd: string,
  signal?: AbortSignal,
  execOpts?: ExecuteHookOpts
): Promise<SingleHookResult> {
  if (hook.type === 'command') {
    return runCommandHook(hook, input, cwd, signal, execOpts)
  }
  if (hook.type === 'http') {
    return runHttpHook(hook, input, signal)
  }
  return {
    exitCode: 1,
    stdout: '',
    stderr: `Unsupported hook type`,
    blocking: false,
    blockMessage: '',
    error: 'unsupported'
  }
}
