import { spawn } from 'node:child_process'
import { GIT_TIMEOUT_MS, MAX_GIT_STATUS_CHARS } from './constants.js'

function runGit(
  cwd: string,
  args: string[],
  timeoutMs = GIT_TIMEOUT_MS
): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', ['--no-optional-locks', ...args], {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve({ ok, stdout: stdout.trim() })
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(false)
    }, timeoutMs)
    child.stdout?.on('data', (b: Buffer) => {
      stdout += b.toString('utf8')
    })
    child.on('error', () => {
      clearTimeout(timer)
      finish(false)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      finish(code === 0)
    })
  })
}

/**
 * Snapshot git status for system context (Claude Code getGitStatus spirit).
 * Failures return null — never throw into the agent loop.
 */
export async function getGitStatusBlock(cwd: string): Promise<string | null> {
  try {
    const inside = await runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
    if (!inside.ok || inside.stdout !== 'true') return null

    const [branch, status, log] = await Promise.all([
      runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
      runGit(cwd, ['status', '--short']),
      runGit(cwd, ['log', '--oneline', '-n', '5'])
    ])

    const branchName = branch.ok ? branch.stdout || '(unknown)' : '(unknown)'
    let statusText = status.ok ? status.stdout : ''
    if (statusText.length > MAX_GIT_STATUS_CHARS) {
      statusText =
        statusText.slice(0, MAX_GIT_STATUS_CHARS) +
        '\n... (truncated because it exceeds 2k characters. If you need more, run git status via bash/powershell)'
    }

    return [
      'This is the git status at the start of the turn. Note that this status is a snapshot in time, and will not update during the conversation unless you re-check with tools.',
      `Current branch: ${branchName}`,
      `Status:\n${statusText || '(clean)'}`,
      log.ok && log.stdout ? `Recent commits:\n${log.stdout}` : null
    ]
      .filter(Boolean)
      .join('\n\n')
  } catch {
    return null
  }
}
