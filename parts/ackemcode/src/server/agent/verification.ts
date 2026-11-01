/**
 * Delivery verification — Claude Code verificationAgent / verify skill spirit.
 * GM-VERIFY: multi-strategy briefing, evidence enforcement, delivery gate.
 * Reimplementation only (no Anthropic source paste).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ChatMessage } from '../../shared/types.js'
import { isReadOnlyTool } from '../tools/registry.js'
import {
  formatStrategiesForPrompt,
  selectVerifyStrategies,
  type VerifyStrategyContext,
  type VerifyStrategyId
} from './verifyStrategies.js'

export type VerifyVerdict = 'PASS' | 'FAIL' | 'PARTIAL'

export type VerifyEvidence = {
  verified: boolean
  verdict: VerifyVerdict
  notes: string
  command?: string
  exitCode?: number | null
  at: string
  /** Strategies applied for this verification run. */
  strategies?: VerifyStrategyId[]
  /** Structured checks parsed from an agent report (if any). */
  checkCount?: number
  checksWithCommand?: number
}

export type VerifyCheck = {
  name: string
  hasCommand: boolean
  result?: 'PASS' | 'FAIL' | 'PARTIAL'
}

/** Parse trailing VERDICT line from a verification agent report (CC contract). */
export function parseVerifyVerdict(report: string): VerifyVerdict | null {
  const m = report.match(/^\s*VERDICT:\s*(PASS|FAIL|PARTIAL)\s*$/im)
  if (!m) return null
  return m[1] as VerifyVerdict
}

/**
 * Parse ### Check blocks. A check counts as evidenced only if it has
 * "Command run" with non-empty content (CC verificationAgent spirit).
 */
export function parseVerifyChecks(report: string): VerifyCheck[] {
  const chunks = report.split(/^###\s+Check:\s*/im).slice(1)
  const out: VerifyCheck[] = []
  for (const chunk of chunks) {
    const nameLine = chunk.split(/\r?\n/, 1)[0]?.trim() || 'unnamed'
    const cmdBlock = chunk.match(
      /\*\*Command run:\*\*\s*\n([\s\S]*?)(?=\n\*\*[A-Za-z]|\n###\s|VERDICT:|$)/i
    )
    const cmdText = (cmdBlock?.[1] ?? '').trim()
    const hasCommand =
      cmdText.length > 0 &&
      !/^(n\/a|none|skipped|todo|\(none\))$/i.test(cmdText)
    const resultM = chunk.match(
      /\*\*Result:\s*(PASS|FAIL|PARTIAL)\*\*|\bResult:\s*(PASS|FAIL|PARTIAL)\b/i
    )
    const resultRaw = (resultM?.[1] || resultM?.[2] || '').toUpperCase()
    const result =
      resultRaw === 'PASS' || resultRaw === 'FAIL' || resultRaw === 'PARTIAL'
        ? (resultRaw as VerifyCheck['result'])
        : undefined
    out.push({ name: nameLine.slice(0, 120), hasCommand, result })
  }
  return out
}

/**
 * Enforce evidence rules on an agent/report verdict (GM-VERIFY).
 * - missing VERDICT → null (caller treats as incomplete)
 * - PASS with zero Command-run checks → PARTIAL
 * - any check Result FAIL → FAIL (even if trailing VERDICT said PASS)
 */
export function enforceVerificationEvidence(
  report: string,
  declared?: VerifyVerdict | null
): {
  verdict: VerifyVerdict | null
  checks: VerifyCheck[]
  reasons: string[]
} {
  const checks = parseVerifyChecks(report)
  const reasons: string[] = []
  let verdict = declared ?? parseVerifyVerdict(report)
  if (!verdict) {
    return { verdict: null, checks, reasons: ['missing VERDICT line'] }
  }

  const withCmd = checks.filter((c) => c.hasCommand)
  const failedChecks = checks.filter((c) => c.result === 'FAIL')

  if (failedChecks.length > 0 && verdict === 'PASS') {
    verdict = 'FAIL'
    reasons.push(
      `downgraded PASS→FAIL: ${failedChecks.length} check(s) marked FAIL`
    )
  }

  if (verdict === 'PASS' && withCmd.length === 0) {
    verdict = 'PARTIAL'
    reasons.push(
      'downgraded PASS→PARTIAL: no Check blocks with Command run (reading code is not verification)'
    )
  }

  return { verdict, checks, reasons }
}

export function evidenceFromVerdict(
  verdict: VerifyVerdict,
  notes: string,
  extra?: Partial<VerifyEvidence>
): VerifyEvidence {
  return {
    verified: verdict === 'PASS',
    verdict,
    notes,
    at: new Date().toISOString(),
    ...extra
  }
}

/**
 * Host/delivery gate: only PASS with verified=true may claim delivery.
 * FAIL / PARTIAL / missing → not deliverable.
 */
export function canClaimDelivery(
  evidence: VerifyEvidence | null | undefined
): boolean {
  return Boolean(evidence && evidence.verdict === 'PASS' && evidence.verified)
}

export function deliveryBlockReason(
  evidence: VerifyEvidence | null | undefined
): string {
  if (!evidence) {
    return 'No verify evidence. Run verify_delivery or agent(subagent_type=verification) before claiming delivery.'
  }
  if (evidence.verdict === 'FAIL') {
    return `Verification FAIL — do not treat as delivered. ${evidence.notes.slice(0, 200)}`
  }
  if (evidence.verdict === 'PARTIAL') {
    return `Verification PARTIAL — environmental limits; do not treat as fully delivered. ${evidence.notes.slice(0, 200)}`
  }
  if (!evidence.verified) {
    return 'Verification did not PASS.'
  }
  return ''
}

/**
 * Run a project verify command (settings.verifyCommand).
 * Shell: powershell on win32, bash -lc elsewhere.
 */
export async function runVerifyCommand(opts: {
  command: string
  cwd: string
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<{
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  evidence: VerifyEvidence
}> {
  const command = opts.command.trim()
  if (!command) {
    const evidence = evidenceFromVerdict(
      'PARTIAL',
      'No verifyCommand configured (set settings.verifyCommand, e.g. npm test).'
    )
    return { ok: false, exitCode: null, stdout: '', stderr: '', evidence }
  }

  const timeoutMs = opts.timeoutMs ?? 120_000
  const isWin = process.platform === 'win32'
  const result = await new Promise<{
    code: number | null
    stdout: string
    stderr: string
  }>((resolve, reject) => {
    const child = isWin
      ? spawn('powershell.exe', ['-NoProfile', '-Command', command], {
          cwd: opts.cwd,
          env: process.env,
          windowsHide: true
        })
      : spawn('bash', ['-lc', command], {
          cwd: opts.cwd,
          env: process.env
        })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`verifyCommand timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    const onAbort = () => {
      child.kill('SIGTERM')
      reject(new Error('aborted'))
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    child.stdout?.on('data', (d) => {
      stdout += d.toString()
      if (stdout.length > 80_000) stdout = stdout.slice(-80_000)
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
      if (stderr.length > 40_000) stderr = stderr.slice(-40_000)
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      resolve({ code, stdout, stderr })
    })
  }).catch((e) => ({
    code: 1 as number | null,
    stdout: '',
    stderr: e instanceof Error ? e.message : String(e)
  }))

  const exitCode = result.code
  const verdict: VerifyVerdict = exitCode === 0 ? 'PASS' : 'FAIL'
  const notes = [
    `verifyCommand: ${command}`,
    `exitCode: ${exitCode ?? 'null'}`,
    result.stderr.trim() ? `stderr:\n${result.stderr.trim().slice(0, 4000)}` : null,
    result.stdout.trim()
      ? `stdout (tail):\n${result.stdout.trim().slice(-6000)}`
      : null
  ]
    .filter(Boolean)
    .join('\n')

  const evidence = evidenceFromVerdict(verdict, notes, {
    command,
    exitCode
  })
  return {
    ok: exitCode === 0,
    exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    evidence
  }
}

export type DiscoveredScript = {
  name: string
  command: string
}

/** Discover npm/pnpm/yarn scripts useful as baseline gate steps. */
export async function discoverPackageVerifyScripts(
  cwd: string
): Promise<DiscoveredScript[]> {
  try {
    const raw = await fs.readFile(path.join(cwd, 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> }
    const scripts = pkg.scripts ?? {}
    const prefer = ['test', 'test:unit', 'lint', 'typecheck', 'build']
    const out: DiscoveredScript[] = []
    for (const name of prefer) {
      if (typeof scripts[name] === 'string' && scripts[name]!.trim()) {
        out.push({ name, command: `npm run ${name} --if-present` })
      }
    }
    return out
  } catch {
    return []
  }
}

export type VerifyGateStepResult = {
  name: string
  command: string
  exitCode: number | null
  verdict: VerifyVerdict
  stdout: string
  stderr: string
}

/**
 * Multi-step delivery gate (GM-VERIFY): primary command + optional discovered scripts.
 * Aggregate: any FAIL → FAIL; no runnable steps → PARTIAL; else PASS if all PASS.
 */
export async function runVerifyGate(opts: {
  cwd: string
  /** Primary command (settings.verifyCommand or override). */
  command?: string
  /** Also run discovered package.json scripts when primary missing or autoGate. */
  autoDiscover?: boolean
  signal?: AbortSignal
  timeoutMs?: number
  strategyCtx?: VerifyStrategyContext
}): Promise<{
  ok: boolean
  evidence: VerifyEvidence
  steps: VerifyGateStepResult[]
  strategies: VerifyStrategyId[]
}> {
  const strategies = selectVerifyStrategies(opts.strategyCtx ?? {})
  const steps: VerifyGateStepResult[] = []
  const primary = (opts.command ?? '').trim()

  const queue: { name: string; command: string }[] = []
  if (primary) {
    queue.push({ name: 'primary', command: primary })
  }
  if (opts.autoDiscover || !primary) {
    const discovered = await discoverPackageVerifyScripts(opts.cwd)
    for (const d of discovered) {
      if (queue.some((q) => q.command === d.command)) continue
      // Avoid running the same npm script twice if primary already is npm test
      if (primary && primary.includes(d.name)) continue
      queue.push(d)
      if (!primary && queue.length >= 2) break
      if (primary && queue.length >= 3) break
    }
  }

  if (!queue.length) {
    const evidence = evidenceFromVerdict(
      'PARTIAL',
      [
        'No verify command and no discoverable package.json test/lint/build scripts.',
        'Set settings.verifyCommand or pass command=…; or use agent(subagent_type=verification).',
        `strategies=${strategies.join(',')}`
      ].join('\n'),
      { strategies }
    )
    return { ok: false, evidence, steps, strategies }
  }

  for (const item of queue) {
    const ran = await runVerifyCommand({
      command: item.command,
      cwd: opts.cwd,
      signal: opts.signal,
      timeoutMs: opts.timeoutMs
    })
    steps.push({
      name: item.name,
      command: item.command,
      exitCode: ran.exitCode,
      verdict: ran.evidence.verdict,
      stdout: ran.stdout,
      stderr: ran.stderr
    })
  }

  const anyFail = steps.some((s) => s.verdict === 'FAIL')
  const allPass = steps.every((s) => s.verdict === 'PASS')
  const verdict: VerifyVerdict = anyFail ? 'FAIL' : allPass ? 'PASS' : 'PARTIAL'
  const notes = [
    `strategies: ${strategies.join(', ')}`,
    ...steps.map(
      (s) =>
        `### Check: ${s.name}\n**Command run:**\n  ${s.command}\n**Result: ${s.verdict}** (exit ${s.exitCode ?? 'null'})`
    )
  ].join('\n\n')

  const evidence = evidenceFromVerdict(verdict, notes, {
    command: steps.map((s) => s.command).join(' && '),
    exitCode: anyFail
      ? steps.find((s) => s.verdict === 'FAIL')?.exitCode ?? 1
      : 0,
    strategies,
    checkCount: steps.length,
    checksWithCommand: steps.length
  })

  return { ok: verdict === 'PASS', evidence, steps, strategies }
}

/** Scan history for verify_delivery / verification agent markers. */
export function extractVerifyEvidenceFromHistory(
  history: ChatMessage[]
): VerifyEvidence | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!
    if (m.role !== 'tool' || typeof m.content !== 'string') continue
    const c = m.content
    if (!/=== VERIFY_DELIVERY ===|Sub-agent \[verification\]/i.test(c)) {
      continue
    }
    const enforced = enforceVerificationEvidence(c)
    if (!enforced.verdict) {
      const plain = parseVerifyVerdict(c)
      if (!plain) continue
      return evidenceFromVerdict(plain, c.slice(0, 2000), {
        ...extractCommandMeta(c),
        checkCount: enforced.checks.length,
        checksWithCommand: enforced.checks.filter((x) => x.hasCommand).length
      })
    }
    return evidenceFromVerdict(enforced.verdict, c.slice(0, 2000), {
      ...extractCommandMeta(c),
      checkCount: enforced.checks.length,
      checksWithCommand: enforced.checks.filter((x) => x.hasCommand).length
    })
  }
  return null
}

function extractCommandMeta(text: string): Partial<VerifyEvidence> {
  const cmd = text.match(/command:\s*(.+)/i)?.[1]?.trim()
  const exitRaw = text.match(/exitCode:\s*(-?\d+|null)/i)?.[1]
  const exitCode =
    exitRaw === 'null' || exitRaw === undefined ? null : Number(exitRaw)
  return {
    command: cmd,
    exitCode: Number.isFinite(exitCode as number) ? (exitCode as number) : null
  }
}

export function formatVerifyDeliveryOutput(opts: {
  command: string
  exitCode: number | null
  stdout: string
  stderr: string
  verdict: VerifyVerdict
  strategies?: VerifyStrategyId[]
  steps?: VerifyGateStepResult[]
}): string {
  let stepBlocks =
    opts.steps?.map(
      (s) =>
        `### Check: ${s.name}\n**Command run:**\n  ${s.command}\n**Output observed:**\n  exit ${s.exitCode ?? 'null'}\n  ${(s.stdout || s.stderr || '').trim().slice(-2000) || '(empty)'}\n**Result: ${s.verdict}**`
    ) ?? []

  // Legacy single-command path: synthesize a Check so history extract
  // does not downgrade real exit-code PASS → PARTIAL (GM-VERIFY).
  if (
    !stepBlocks.length &&
    opts.command.trim() &&
    opts.command.trim() !== '(none)'
  ) {
    const observed = [
      `exit ${opts.exitCode ?? 'null'}`,
      opts.stdout.trim().slice(-4000),
      opts.stderr.trim().slice(-2000)
    ]
      .filter(Boolean)
      .join('\n')
    stepBlocks = [
      `### Check: primary\n**Command run:**\n  ${opts.command}\n**Output observed:**\n  ${observed || '(empty)'}\n**Result: ${opts.verdict}**`
    ]
  }

  return [
    '=== VERIFY_DELIVERY ===',
    `command: ${opts.command}`,
    `exitCode: ${opts.exitCode ?? 'null'}`,
    opts.strategies?.length
      ? `strategies: ${opts.strategies.join(', ')}`
      : null,
    '',
    ...stepBlocks,
    stepBlocks.length ? '' : null,
    stepBlocks.length
      ? null
      : [
          '### stdout (tail)',
          opts.stdout.trim().slice(-8000) || '(empty)',
          '',
          '### stderr (tail)',
          opts.stderr.trim().slice(-4000) || '(empty)',
          ''
        ].join('\n'),
    `VERDICT: ${opts.verdict}`
  ]
    .filter((l) => l != null)
    .join('\n')
}

/** System prompt for verification sub-agent (CC verificationAgent spirit + strategies). */
export function verificationSystemPrompt(
  cwd: string,
  verifyCommand?: string,
  strategyCtx?: VerifyStrategyContext
): string {
  const ids = selectVerifyStrategies(strategyCtx ?? {})
  const strategyBlock = formatStrategiesForPrompt(ids)
  const cmdHint = verifyCommand?.trim()
    ? `Configured project verifyCommand: \`${verifyCommand.trim()}\` — run it unless the task specifies otherwise.`
    : 'No verifyCommand in settings — discover test/build scripts from package.json / Makefile / README.'

  return `You are a verification specialist for AckemCode. Your job is not to confirm the implementation looks right — it is to try to break it and report evidence.

Working directory: ${cwd}

=== CRITICAL: DO NOT MODIFY THE PROJECT ===
You are STRICTLY PROHIBITED from:
- Creating, modifying, or deleting files IN THE PROJECT DIRECTORY
- Installing dependencies
- git write operations (add, commit, push)

You MAY run read-only inspection and project test/build/lint commands via bash/powershell.
Ephemeral scripts only under the system temp directory; clean up after yourself.

${cmdHint}

${strategyBlock}

=== REQUIRED BASELINE ===
1. Read README / package scripts for how to build and test.
2. Run the build if applicable (broken build = FAIL).
3. Run the project's tests if present (failing tests = FAIL).
4. Run linters/typecheckers if configured.
5. Do at least one adversarial or edge-case probe relevant to the change.

Reading code alone is NOT verification. Every check needs a real command.
A VERDICT: PASS without any "**Command run:**" check blocks will be rejected by the parent (downgraded to PARTIAL).

=== OUTPUT FORMAT (REQUIRED) ===
For each check:
### Check: [name]
**Command run:**
  [exact command]
**Output observed:**
  [actual output, truncated if needed]
**Result: PASS** or **Result: FAIL** (with expected vs actual)

End with exactly one of these lines (parsed by the parent):
VERDICT: PASS
or
VERDICT: FAIL
or
VERDICT: PARTIAL

PARTIAL is only for environmental limits (no test framework, tool missing) — not uncertainty.
CRITICAL: You MUST end with VERDICT: PASS, VERDICT: FAIL, or VERDICT: PARTIAL.`
}

/** Finalize verification agent report → verdict + evidence (enforces GM-VERIFY rules). */
export function finalizeVerificationReport(report: string): {
  verdict: VerifyVerdict | null
  evidence: VerifyEvidence | null
  reasons: string[]
} {
  const enforced = enforceVerificationEvidence(report)
  if (!enforced.verdict) {
    return { verdict: null, evidence: null, reasons: enforced.reasons }
  }
  const notes = [
    ...enforced.reasons,
    report.slice(0, 1800)
  ]
    .filter(Boolean)
    .join('\n')
  return {
    verdict: enforced.verdict,
    evidence: evidenceFromVerdict(enforced.verdict, notes, {
      checkCount: enforced.checks.length,
      checksWithCommand: enforced.checks.filter((c) => c.hasCommand).length
    }),
    reasons: enforced.reasons
  }
}

/** Verification agent: allow read-only shell + configured verify command only. */
export function verificationSessionAllows(
  toolName: string,
  input: unknown,
  verifyCommand?: string
): boolean {
  const name = toolName.toLowerCase()
  if (name !== 'bash' && name !== 'powershell') return false
  if (isReadOnlyTool(name, input)) return true
  const cmd = String(
    (input as Record<string, unknown> | undefined)?.command ?? ''
  ).trim()
  if (!cmd) return false
  const vc = verifyCommand?.trim()
  if (!vc) return false
  return cmd === vc || cmd.includes(vc)
}

export {
  selectVerifyStrategies,
  formatStrategiesForPrompt,
  type VerifyStrategyContext,
  type VerifyStrategyId
} from './verifyStrategies.js'
