/**
 * K4 — spawn-time worktree isolation for sub-agents (CC isolation:"worktree").
 * Sub-agents do not receive enter/exit_worktree tools.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  cleanupWorktree,
  countWorktreeChanges,
  createWorktreeForSession,
  type WorktreeSession
} from './worktree.js'

export type SavedIsolationFields = {
  isolationWorktreePath?: string
  isolationWorktreeBranch?: string
  isolationOriginalCwd?: string
  isolationOriginalHeadCommit?: string
  isolationWorktreeName?: string
}

export function isolationFieldsFromSession(
  session: WorktreeSession
): SavedIsolationFields {
  return {
    isolationWorktreePath: session.worktreePath,
    isolationWorktreeBranch: session.worktreeBranch,
    isolationOriginalCwd: session.originalCwd,
    isolationOriginalHeadCommit: session.originalHeadCommit,
    isolationWorktreeName: session.worktreeName
  }
}

export type IsolationMode = 'none' | 'worktree'

export function parseIsolationMode(raw: unknown): IsolationMode {
  const s = String(raw ?? 'none').trim().toLowerCase()
  return s === 'worktree' ? 'worktree' : 'none'
}

export async function createAgentWorktree(opts: {
  sessionId: string
  cwd: string
  agentId: string
}): Promise<WorktreeSession> {
  const slug = `agent-${opts.agentId.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 24) || 'x'}`
  return createWorktreeForSession(opts.sessionId, opts.cwd, slug)
}

export async function settleAgentWorktree(
  session: WorktreeSession
): Promise<{ kept: boolean; changedFiles: number; commits: number; path: string; branch?: string }> {
  const summary = await countWorktreeChanges(session.worktreePath, session.originalHeadCommit)
  const dirty = Boolean(summary && (summary.changedFiles > 0 || summary.commits > 0))
  if (!dirty && summary) {
    await cleanupWorktree(session)
    return {
      kept: false,
      changedFiles: 0,
      commits: 0,
      path: session.worktreePath,
      branch: session.worktreeBranch
    }
  }
  return {
    kept: true,
    changedFiles: summary?.changedFiles ?? 0,
    commits: summary?.commits ?? 0,
    path: session.worktreePath,
    branch: session.worktreeBranch
  }
}

/** Resume: re-enter the saved tree if it still exists; otherwise fall back to main cwd. */
export async function restoreIsolationWorktree(
  saved: SavedIsolationFields | null | undefined,
  sessionId = 'session'
): Promise<{ session?: WorktreeSession; note: string }> {
  const p = saved?.isolationWorktreePath?.trim()
  if (!p) return { note: '' }
  try {
    await fs.access(p)
    return {
      session: {
        originalCwd: saved?.isolationOriginalCwd || path.dirname(p),
        worktreePath: p,
        worktreeName: saved?.isolationWorktreeName || path.basename(p),
        worktreeBranch: saved?.isolationWorktreeBranch,
        originalHeadCommit: saved?.isolationOriginalHeadCommit,
        sessionId
      },
      note: `isolation=worktree resumed ${p}`
    }
  } catch {
    return {
      note: `isolation worktree gone (${p}); using main cwd`
    }
  }
}
