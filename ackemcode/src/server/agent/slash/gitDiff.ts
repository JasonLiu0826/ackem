/**
 * Read-only git diff summary for /diff (GM-SLASH). R1: shares gitSnapshotCore.
 */
import { runGitSnapshot } from '../../tools/git/gitSnapshotCore.js'

export async function runGitDiffSummary(
  cwd: string,
  opts?: { maxChars?: number; signal?: AbortSignal }
): Promise<{ ok: boolean; output: string }> {
  const r = await runGitSnapshot({
    cwd,
    maxChars: opts?.maxChars ?? 12_000,
    includeStat: true,
    signal: opts?.signal
  })
  if (!r.ok) return r
  return {
    ok: true,
    output: r.output.replace('=== git_snapshot (read-only) ===', '=== /diff (read-only) ===')
  }
}
