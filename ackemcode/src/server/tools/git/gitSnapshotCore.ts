/**
 * R1 — structured read-only git workspace snapshot (CC git status spirit, Ackem-owned).
 */
import { spawn } from 'node:child_process'

export type GitSnapshotOpts = {
  cwd: string
  maxChars?: number
  includeStat?: boolean
  patchPath?: string
  patchMaxChars?: number
  signal?: AbortSignal
}

async function gitLines(
  cwd: string,
  args: string[],
  maxChars: number,
  signal?: AbortSignal
): Promise<{ ok: boolean; text: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, env: process.env, windowsHide: true })
    let out = ''
    let err = ''
    const onAbort = () => child.kill('SIGTERM')
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout?.on('data', (d) => {
      out += d.toString()
      if (out.length > maxChars) out = out.slice(0, maxChars)
    })
    child.stderr?.on('data', (d) => {
      err += d.toString()
      if (err.length > maxChars) err = err.slice(0, maxChars)
    })
    child.on('error', (e) => resolve({ ok: false, text: e.message, code: 127 }))
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort)
      resolve({
        ok: code === 0,
        text: (out || err || '').slice(0, maxChars),
        code
      })
    })
  })
}

export async function runGitSnapshot(
  opts: GitSnapshotOpts
): Promise<{ ok: boolean; output: string }> {
  const maxChars = opts.maxChars ?? 16_000
  const branch = await gitLines(opts.cwd, ['branch', '--show-current'], 500, opts.signal)
  const status = await gitLines(opts.cwd, ['status', '--short', '--branch'], maxChars, opts.signal)
  if (status.code === 127 || /not a git repository/i.test(status.text)) {
    return {
      ok: false,
      output: status.text.includes('not a git')
        ? 'Not a git repository (or git unavailable).'
        : `git unavailable: ${status.text}`
    }
  }

  const lines: string[] = [
    '=== git_snapshot (read-only) ===',
    `cwd: ${opts.cwd}`,
    `branch: ${branch.text.trim() || '(detached or unknown)'}`,
    '',
    '## status',
    status.text.trim() || '(clean)',
    ''
  ]

  if (opts.includeStat !== false) {
    const stat = await gitLines(opts.cwd, ['diff', '--stat'], maxChars, opts.signal)
    const staged = await gitLines(
      opts.cwd,
      ['diff', '--cached', '--stat'],
      maxChars,
      opts.signal
    )
    lines.push('## diff --stat (unstaged)', stat.text.trim() || '(none)', '')
    lines.push('## diff --cached --stat', staged.text.trim() || '(none)', '')
  }

  if (opts.patchPath) {
    const patchMax = opts.patchMaxChars ?? 4_000
    const patch = await gitLines(
      opts.cwd,
      ['diff', '--', opts.patchPath],
      patchMax,
      opts.signal
    )
    lines.push(`## patch (unstaged) ${opts.patchPath}`, patch.text.trim() || '(no diff)', '')
  }

  return { ok: true, output: lines.join('\n') }
}
