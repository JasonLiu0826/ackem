import { spawn } from 'node:child_process'
import {
  annotateSandboxStderr,
  cleanupAfterSandboxedCommand,
  prepareSandboxedSpawn
} from '../../sandbox/index.js'
import {
  destructiveShellWarning,
  isBenignNonZeroExit,
  resolveShellTimeoutMs,
  truncateShellOutput
} from './limits.js'
import { getSessionHookEnvVars } from '../../hooks/sessionEnv.js'
import { resolveBashExecutable, WINDOWS_BASH_UNAVAILABLE } from './resolveBash.js'
import { killProcessTree } from './killProcessTree.js'

export type ShellToolResult = {
  ok: boolean
  output: string
  sandboxed?: boolean
}

export async function runShellTool(
  cwd: string,
  input: Record<string, unknown>,
  shell: 'bash' | 'powershell',
  signal?: AbortSignal
): Promise<ShellToolResult> {
  const command = String(input.command ?? '')
  if (!command.trim()) {
    return { ok: false, output: 'command is required' }
  }
  if (shell === 'bash' && !resolveBashExecutable()) {
    return { ok: false, output: WINDOWS_BASH_UNAVAILABLE }
  }
  if (signal?.aborted) {
    return { ok: false, output: 'Tool execution aborted by user.' }
  }
  const timeoutMs = resolveShellTimeoutMs(input)
  const warn = destructiveShellWarning(command, shell)
  const dangerouslyDisableSandbox = Boolean(input.dangerouslyDisableSandbox)

  let plan
  try {
    plan = await prepareSandboxedSpawn({
      command,
      shell,
      cwd,
      dangerouslyDisableSandbox,
      signal
    })
  } catch (e) {
    return {
      ok: false,
      output: e instanceof Error ? e.message : String(e)
    }
  }

  try {
    const result = await spawnPlan(
      cwd,
      command,
      {
        ...plan,
        env: {
          ...plan.env,
          ...(await getSessionHookEnvVars())
        }
      },
      timeoutMs,
      shell,
      signal
    )
    let output = result.output
    if (plan.useSandbox) {
      output = annotateSandboxStderr(command, output)
    } else if (plan.sandboxFallbackReason) {
      // GM-BASH: never silently imply OS isolation when we fell back
      output =
        `[sandbox: NOT isolated — ${plan.sandboxFallbackReason}]\n` + output
    }
    if (warn) {
      output = `[warning: ${warn}]\n` + output
    }
    return {
      ok: result.ok,
      output: truncateShellOutput(output),
      sandboxed: plan.useSandbox
    }
  } finally {
    if (plan.useSandbox) cleanupAfterSandboxedCommand()
  }
}

function spawnPlan(
  cwd: string,
  command: string,
  plan: { argv: string[]; env: NodeJS.ProcessEnv },
  timeoutMs: number,
  shell: 'bash' | 'powershell',
  signal?: AbortSignal
): Promise<ShellToolResult> {
  return new Promise((resolve) => {
    const exe = plan.argv[0]
    const args = plan.argv.slice(1)
    if (!exe) {
      resolve({ ok: false, output: 'sandbox spawn: empty argv' })
      return
    }

    const child = spawn(exe, args, {
      cwd,
      env: plan.env,
      windowsHide: true,
      shell: false
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (r: ShellToolResult) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      resolve(r)
    }

    const onAbort = () => {
      killProcessTree(child)
      finish({
        ok: false,
        output:
          signal?.reason === 'sibling_error'
            ? 'Cancelled: parallel tool call sibling errored'
            : 'Tool execution aborted by user.'
      })
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    const timer = setTimeout(() => {
      killProcessTree(child)
      const body =
        shell === 'bash'
          ? truncateShellOutput(stdout + (stderr ? `\n${stderr}` : ''))
          : truncateShellOutput(
              [stdout && `stdout:\n${stdout}`, stderr && `stderr:\n${stderr}`]
                .filter(Boolean)
                .join('\n')
            )
      finish({
        ok: false,
        output: `Timed out after ${timeoutMs}ms\n${body}`
      })
    }, timeoutMs)

    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (signal?.aborted) {
        finish({
          ok: false,
          output:
            signal.reason === 'sibling_error'
              ? 'Cancelled: parallel tool call sibling errored'
              : 'Tool execution aborted by user.'
        })
        return
      }
      const blob = `${stdout}\n${stderr}`.replace(/\r/g, '').trim()
      if (/^terminated$/i.test(blob) || (code === null && !blob)) {
        finish({ ok: false, output: '命令被中止。' })
        return
      }
      const benign = isBenignNonZeroExit(command, code)
      const ok = code === 0 || benign

      if (shell === 'bash') {
        let merged = stdout
        if (stderr) merged = merged ? `${merged}\n${stderr}` : stderr
        if (!ok) {
          merged = (merged ? merged + '\n' : '') + `Exit code ${code ?? '?'}`
        } else if (benign && code === 1) {
          if (!merged.trim()) merged = 'No matches'
        }
        finish({ ok, output: merged || '(no output)' })
        return
      }

      const parts = [
        !ok ? `Exit code ${code ?? '?'}` : '',
        stdout && `stdout:\n${stdout}`,
        stderr && `stderr:\n${stderr}`
      ].filter(Boolean)
      finish({ ok, output: parts.join('\n') || '(no output)' })
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      const isWin = process.platform === 'win32'
      const hint =
        shell === 'bash' && isWin
          ? '\nHint: bash.exe not found — install Git Bash, or use the powershell tool.'
          : shell === 'powershell' && !isWin
            ? '\nHint: pwsh not found — install PowerShell, or use the bash tool.'
            : ''
      finish({ ok: false, output: err.message + hint })
    })
  })
}
