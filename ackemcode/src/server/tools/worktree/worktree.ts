/**
 * Enter/Exit Worktree — Claude Code EnterWorktreeTool / ExitWorktreeTool +
 * utils/worktree git path (no hooks/tmux; Ackem host exemption).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const MAX_WORKTREE_SLUG_LENGTH = 64
const VALID_WORKTREE_SLUG_SEGMENT = /^[A-Za-z0-9._-]+$/

export type WorktreeSession = {
  originalCwd: string
  worktreePath: string
  worktreeName: string
  worktreeBranch?: string
  originalBranch?: string
  originalHeadCommit?: string
  sessionId: string
  /** True when path came from WorktreeCreate hook (not git worktree add). */
  outsourced?: boolean
}

export function validateWorktreeSlug(slug: string): void {
  if (slug.length > MAX_WORKTREE_SLUG_LENGTH) {
    throw new Error(
      `Invalid worktree name: must be ${MAX_WORKTREE_SLUG_LENGTH} characters or fewer (got ${slug.length})`
    )
  }
  for (const segment of slug.split('/')) {
    if (segment === '.' || segment === '..') {
      throw new Error(
        `Invalid worktree name "${slug}": must not contain "." or ".." path segments`
      )
    }
    if (!VALID_WORKTREE_SLUG_SEGMENT.test(segment)) {
      throw new Error(
        `Invalid worktree name "${slug}": each "/"-separated segment must be non-empty and contain only letters, digits, dots, underscores, and dashes`
      )
    }
  }
}

function flattenSlug(slug: string): string {
  return slug.replaceAll('/', '+')
}

export function worktreeBranchName(slug: string): string {
  return `worktree-${flattenSlug(slug)}`
}

function worktreesDir(repoRoot: string): string {
  return path.join(repoRoot, '.ackemcode', 'worktrees')
}

function worktreePathFor(repoRoot: string, slug: string): string {
  return path.join(worktreesDir(repoRoot), flattenSlug(slug))
}

function runGit(
  args: string[],
  cwd: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: ''
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', (err) => {
      resolve({ code: 1, stdout, stderr: err.message })
    })
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

/** Walk up for .git (file or directory). */
export async function findGitRoot(start: string): Promise<string | null> {
  let dir = path.resolve(start)
  for (;;) {
    try {
      await fs.access(path.join(dir, '.git'))
      return dir
    } catch {
      /* continue */
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Canonical main repo root — if cwd is inside a linked worktree, resolve via
 * `git rev-parse --git-common-dir` then parent of that common dir.
 */
export async function findCanonicalGitRoot(start: string): Promise<string | null> {
  const root = await findGitRoot(start)
  if (!root) return null
  const { code, stdout } = await runGit(['rev-parse', '--git-common-dir'], root)
  if (code !== 0) return root
  const common = stdout.trim()
  if (!common) return root
  const absCommon = path.isAbsolute(common) ? common : path.resolve(root, common)
  // common dir is usually <repo>/.git — main root is parent
  if (path.basename(absCommon) === '.git') return path.dirname(absCommon)
  return root
}

async function readWorktreeHeadSha(worktreePath: string): Promise<string | null> {
  try {
    const gitFile = path.join(worktreePath, '.git')
    const st = await fs.stat(gitFile)
    if (st.isDirectory()) {
      const { code, stdout } = await runGit(['rev-parse', 'HEAD'], worktreePath)
      return code === 0 ? stdout.trim() || null : null
    }
    // gitdir: pointer
    const txt = await fs.readFile(gitFile, 'utf8')
    if (!/gitdir:/i.test(txt)) return null
    const { code, stdout } = await runGit(['rev-parse', 'HEAD'], worktreePath)
    return code === 0 ? stdout.trim() || null : null
  } catch {
    return null
  }
}

function randomSlug(): string {
  return `wt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export async function createWorktreeForSession(
  sessionId: string,
  cwd: string,
  name?: string
): Promise<WorktreeSession> {
  const slug = name?.trim() || randomSlug()
  validateWorktreeSlug(slug)

  const mainRepoRoot = (await findCanonicalGitRoot(cwd)) || (await findGitRoot(cwd))
  if (!mainRepoRoot) {
    throw new Error(
      'Cannot create a worktree: not in a git repository. Initialize git or open a repo as cwd.'
    )
  }

  const worktreePath = worktreePathFor(mainRepoRoot, slug)
  const worktreeBranch = worktreeBranchName(slug)

  const existingHead = await readWorktreeHeadSha(worktreePath)
  let headCommit: string
  if (existingHead) {
    headCommit = existingHead
  } else {
    await fs.mkdir(worktreesDir(mainRepoRoot), { recursive: true })
    // Prefer current HEAD (no network fetch) — Ackem host simplification vs CC origin fetch
    const base = 'HEAD'
    const sha = await runGit(['rev-parse', base], mainRepoRoot)
    if (sha.code !== 0) {
      throw new Error(`Failed to resolve base branch: ${sha.stderr || sha.stdout}`)
    }
    headCommit = sha.stdout.trim()
    const add = await runGit(
      ['worktree', 'add', '-B', worktreeBranch, worktreePath, base],
      mainRepoRoot
    )
    if (add.code !== 0) {
      throw new Error(`Failed to create worktree: ${add.stderr || add.stdout}`)
    }
  }

  const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], mainRepoRoot)
  const originalBranch =
    branch.code === 0 && branch.stdout.trim() !== 'HEAD'
      ? branch.stdout.trim()
      : undefined

  return {
    originalCwd: path.resolve(cwd),
    worktreePath,
    worktreeName: slug,
    worktreeBranch,
    originalBranch,
    originalHeadCommit: headCommit,
    sessionId
  }
}

export type ChangeSummary = { changedFiles: number; commits: number }

/** Fail-closed: null means unknown / unsafe to remove. */
export async function countWorktreeChanges(
  worktreePath: string,
  originalHeadCommit: string | undefined
): Promise<ChangeSummary | null> {
  const status = await runGit(['status', '--porcelain'], worktreePath)
  if (status.code !== 0) return null
  const changedFiles = status.stdout.split('\n').filter((l) => l.trim()).length
  if (!originalHeadCommit) return null
  const rev = await runGit(
    ['rev-list', '--count', `${originalHeadCommit}..HEAD`],
    worktreePath
  )
  if (rev.code !== 0) return null
  const commits = parseInt(rev.stdout.trim(), 10) || 0
  return { changedFiles, commits }
}

export async function keepWorktree(session: WorktreeSession): Promise<void> {
  // Caller restores cwd; we only clear git-side? keep leaves disk intact.
  void session
}

export async function cleanupWorktree(session: WorktreeSession): Promise<void> {
  // Hook-outsourced paths are not git worktrees we created — do not `git worktree remove`.
  // WorktreeRemove hooks (if any) already ran in the tool handler.
  if (session.outsourced) return
  const { worktreePath, originalCwd, worktreeBranch } = session
  const remove = await runGit(
    ['worktree', 'remove', '--force', worktreePath],
    originalCwd
  )
  if (remove.code !== 0) {
    // best-effort: still try branch delete
  }
  if (worktreeBranch) {
    await new Promise((r) => setTimeout(r, 100))
    await runGit(['branch', '-D', worktreeBranch], originalCwd)
  }
}

export function enterWorktreeMessage(session: WorktreeSession): string {
  const branchInfo = session.worktreeBranch
    ? ` on branch ${session.worktreeBranch}`
    : session.outsourced
      ? ' (hook-outsourced path)'
      : ''
  return (
    `Created worktree at ${session.worktreePath}${branchInfo}. ` +
    `The session is now working in the worktree. Use exit_worktree to leave mid-session.`
  )
}

/**
 * Attach an existing directory as the session worktree (WorktreeCreate hook override).
 * CC: when WorktreeCreate hooks are configured, stdout path replaces git worktree add.
 */
export async function attachOutsourcedWorktreeSession(opts: {
  sessionId: string
  originalCwd: string
  worktreePath: string
  name?: string
}): Promise<WorktreeSession> {
  const worktreePath = path.resolve(opts.worktreePath)
  let st: Awaited<ReturnType<typeof fs.stat>>
  try {
    st = await fs.stat(worktreePath)
  } catch {
    throw new Error(
      `WorktreeCreate hook returned path that does not exist: ${worktreePath}`
    )
  }
  if (!st.isDirectory()) {
    throw new Error(
      `WorktreeCreate hook returned a non-directory path: ${worktreePath}`
    )
  }
  const slug = (opts.name?.trim() || path.basename(worktreePath)).slice(0, 64)
  return {
    originalCwd: path.resolve(opts.originalCwd),
    worktreePath,
    worktreeName: slug,
    sessionId: opts.sessionId,
    outsourced: true,
    originalHeadCommit: (await readWorktreeHeadSha(worktreePath)) || undefined
  }
}

/** True when settings define at least one WorktreeCreate hook. */
export function hasWorktreeCreateHooks(
  hooks: Record<string, unknown> | undefined | null
): boolean {
  return hasNamedHookGroups(hooks, 'WorktreeCreate')
}

/** True when settings define at least one WorktreeRemove hook. */
export function hasWorktreeRemoveHooks(
  hooks: Record<string, unknown> | undefined | null
): boolean {
  return hasNamedHookGroups(hooks, 'WorktreeRemove')
}

function hasNamedHookGroups(
  hooks: Record<string, unknown> | undefined | null,
  name: string
): boolean {
  if (!hooks || typeof hooks !== 'object') return false
  const groups = hooks[name]
  if (!Array.isArray(groups)) return false
  for (const g of groups) {
    if (
      g &&
      typeof g === 'object' &&
      Array.isArray((g as { hooks?: unknown }).hooks) &&
      (g as { hooks: unknown[] }).hooks.length > 0
    ) {
      return true
    }
  }
  return false
}

/**
 * True when `cwd` is a linked git worktree (`.git` is a file pointer), not the
 * main working tree. EnterWorktree still creates under the canonical main root.
 */
export async function isLinkedGitWorktree(cwd: string): Promise<boolean> {
  try {
    const gitPath = path.join(path.resolve(cwd), '.git')
    const st = await fs.stat(gitPath)
    return st.isFile()
  } catch {
    return false
  }
}
