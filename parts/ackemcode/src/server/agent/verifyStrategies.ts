/**
 * Verification strategy catalog — Claude Code verificationAgent strategy spirit.
 * Ackem-owned checklists (not a paste of Anthropic prompts).
 */
export type VerifyStrategyId =
  | 'baseline'
  | 'frontend'
  | 'backend_api'
  | 'cli'
  | 'infra'
  | 'bugfix'
  | 'library'
  | 'refactor'
  | 'adversarial'

export type VerifyStrategy = {
  id: VerifyStrategyId
  title: string
  /** Short bullets injected into verification agent prompt. */
  steps: string[]
}

/** Built-in strategies (GM-VERIFY). */
export const VERIFY_STRATEGIES: Record<VerifyStrategyId, VerifyStrategy> = {
  baseline: {
    id: 'baseline',
    title: 'Universal baseline',
    steps: [
      'Discover build/test/lint commands from package.json / Makefile / README / pyproject.',
      'Run build if applicable — broken build = FAIL.',
      'Run the project test suite if present — failing tests = FAIL.',
      'Run typecheck/lint if configured.',
      'Every PASS check must include a real Command run + observed output.'
    ]
  },
  frontend: {
    id: 'frontend',
    title: 'Frontend / UI',
    steps: [
      'Start or use existing dev server if the change needs a running app.',
      'Hit the changed route(s) with curl/fetch; confirm HTML/JSON is not a soft-404.',
      'If browser MCP tools exist: navigate, interact with the changed UI, and capture a screenshot or console check — interaction/screenshot evidence is REQUIRED for PASS (R10).',
      'If no browser MCP is available: report PARTIAL explicitly — never invent browser results or claim PASS for UI-only acceptance.',
      'Fetch a sample of static/API subresources referenced by the page.'
    ]
  },
  backend_api: {
    id: 'backend_api',
    title: 'Backend / API',
    steps: [
      'Start server or use documented test harness.',
      'Call changed endpoints; assert status AND body shape, not status alone.',
      'Probe validation/error paths (bad JSON, missing auth, not-found).',
      'If create-if-not-exists paths exist, try a simple concurrency or double-submit probe.'
    ]
  },
  cli: {
    id: 'cli',
    title: 'CLI / scripts',
    steps: [
      'Run the CLI/script with representative happy-path args.',
      'Check exit codes and stdout/stderr contracts.',
      'Probe empty/malformed/boundary inputs.',
      'Verify --help / usage still matches behavior.'
    ]
  },
  infra: {
    id: 'infra',
    title: 'Infra / config',
    steps: [
      'Validate syntax (e.g. terraform validate, nginx -t, docker build dry where safe).',
      'Prefer dry-run / plan modes over destructive apply.',
      'Confirm referenced env vars/secrets are actually used, not only defined.'
    ]
  },
  bugfix: {
    id: 'bugfix',
    title: 'Bug fix',
    steps: [
      'Reproduce the original failure mode before trusting the fix.',
      'Confirm the fix resolves that reproduction.',
      'Run related regression tests / nearby paths for side effects.'
    ]
  },
  library: {
    id: 'library',
    title: 'Library / package',
    steps: [
      'Build the package.',
      'Run the full test suite.',
      'Exercise the public API as a consumer would (import / CLI).'
    ]
  },
  refactor: {
    id: 'refactor',
    title: 'Refactor (no behavior change)',
    steps: [
      'Existing tests MUST pass unchanged.',
      'Spot-check public API surface (no surprise export removals).',
      'Same inputs → same outputs for a small sample.'
    ]
  },
  adversarial: {
    id: 'adversarial',
    title: 'Adversarial probes (required seed)',
    steps: [
      'Run at least one adversarial/edge probe relevant to the change.',
      'Seeds: boundary values (0, empty, unicode), idempotent double-submit, orphan IDs, concurrency on create paths.',
      'A report with only happy-path "returns 200" checks is insufficient for VERDICT: PASS.'
    ]
  }
}

export type VerifyStrategyContext = {
  taskSummary?: string
  changedFiles?: string[]
  /** Explicit strategy ids from tool input. */
  strategies?: string[]
}

function textBlob(ctx: VerifyStrategyContext): string {
  return [
    ctx.taskSummary ?? '',
    ...(ctx.changedFiles ?? []).map((f) => f.replace(/\\/g, '/'))
  ]
    .join('\n')
    .toLowerCase()
}

/**
 * Select strategies from task/files (heuristic). Always includes baseline + adversarial.
 */
export function selectVerifyStrategies(
  ctx: VerifyStrategyContext = {}
): VerifyStrategyId[] {
  const explicit = (ctx.strategies ?? [])
    .map((s) => s.trim().toLowerCase().replace(/-/g, '_'))
    .filter(Boolean)

  const picked = new Set<VerifyStrategyId>(['baseline', 'adversarial'])

  for (const raw of explicit) {
    if (raw in VERIFY_STRATEGIES) {
      picked.add(raw as VerifyStrategyId)
    }
  }

  const blob = textBlob(ctx)
  const files = (ctx.changedFiles ?? []).map((f) => f.replace(/\\/g, '/'))

  const hasExt = (...exts: string[]) =>
    files.some((f) => exts.some((e) => f.toLowerCase().endsWith(e)))

  if (
    /\b(ui|frontend|react|vue|svelte|css|html|next\.js|vite)\b/.test(blob) ||
    hasExt('.tsx', '.jsx', '.vue', '.svelte', '.css', '.html')
  ) {
    picked.add('frontend')
  }
  if (
    /\b(api|backend|endpoint|route|server|express|fastapi|django)\b/.test(
      blob
    ) ||
    files.some((f) => /\/(routes?|api|controllers?|handlers?)\//i.test(f))
  ) {
    picked.add('backend_api')
  }
  if (
    /\b(cli|argv|commander|yargs|bin\/)\b/.test(blob) ||
    files.some((f) => /(^|\/)bin\//i.test(f) || /cli\./i.test(f))
  ) {
    picked.add('cli')
  }
  if (
    /\b(terraform|kubernetes|k8s|dockerfile|nginx|helm|infra)\b/.test(blob) ||
    hasExt('.tf', '.yml', '.yaml') &&
      /\b(deploy|k8s|terraform|docker)\b/.test(blob)
  ) {
    picked.add('infra')
  }
  if (/\b(bug|fix|regression|crash|hotfix)\b/.test(blob)) {
    picked.add('bugfix')
  }
  if (
    /\b(refactor|rename|cleanup|no behavior)\b/.test(blob) ||
    /\brefactor\b/.test(blob)
  ) {
    picked.add('refactor')
  }
  if (
    hasExt('.ts', '.js', '.py', '.go', '.rs') &&
    files.some((f) => /\/(src|lib|pkg)\//i.test(f)) &&
    /\b(library|package|sdk|export)\b/.test(blob)
  ) {
    picked.add('library')
  }

  return [...picked]
}

/** Format selected strategies for agent system/user prompt injection. */
export function formatStrategiesForPrompt(ids: VerifyStrategyId[]): string {
  const lines: string[] = [
    '=== VERIFICATION STRATEGIES (follow all that apply) ==='
  ]
  for (const id of ids) {
    const s = VERIFY_STRATEGIES[id]
    if (!s) continue
    lines.push(`## ${s.title} (${s.id})`)
    for (const step of s.steps) {
      lines.push(`- ${step}`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}
