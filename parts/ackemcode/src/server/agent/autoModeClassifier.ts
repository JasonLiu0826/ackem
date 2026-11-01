/**
 * Auto-mode LLM classifier (CC yoloClassifier / autoMode spirit).
 * Ackem-owned prompts — do NOT paste Anthropic classifier templates.
 *
 * Flow: S13 dangerousPatterns first → allowlisted tools skip LLM →
 * gray-zone ask candidates → side LLM → allow | deny | unavailable→ask.
 */
import type { AckemCodeSettings, ChatMessage } from '../../shared/types.js'
import { chatCompletion, LlmError } from './llm.js'
import {
  classifyToolRisk,
  riskBlocksAutoAllow
} from './dangerousPatterns.js'
import {
  PermissionBroker,
  type PermissionEvalResult
} from './permissions.js'

export type AutoModeRules = {
  /** Extra allow guidance bullets (user-custom). */
  allow: string[]
  /** Extra soft-deny / caution bullets. */
  softDeny: string[]
  /** Environment notes (repo purpose, trusted dirs, etc.). */
  environment: string[]
}

export type AutoModeClassifierResult = {
  shouldBlock: boolean
  reason: string
  /** API/parse failure — callers must fail-closed (ask, never silent allow). */
  unavailable?: boolean
  model?: string
  durationMs?: number
  /** R8: which stage produced the final decision (1 = fast screen). */
  stage?: 1 | 2
  /** R8: stage-1 screen verdict when two-stage ran. */
  stage1Verdict?: Stage1Verdict
}

/** R8: stage-1 fast-screen verdicts (CC two-stage yoloClassifier structure). */
export type Stage1Verdict = 'allow' | 'block' | 'unsure'

/** Tools safe enough to skip the LLM in auto mode (CC SAFE_YOLO_ALLOWLISTED spirit). */
const SAFE_AUTO_ALLOWLIST = new Set([
  'read_file',
  'glob',
  'grep',
  'list_dir',
  'lsp',
  'list_mcp_resources',
  'read_mcp_resource',
  'list_skills',
  'todo_write',
  'task_create',
  'task_get',
  'task_update',
  'task_list',
  'ask_user',
  'enter_plan_mode',
  'exit_plan_mode',
  'cron_list'
])

export function isAutoModeAllowlistedTool(toolName: string): boolean {
  return SAFE_AUTO_ALLOWLIST.has(toolName)
}

export function formatActionForClassifier(
  toolName: string,
  input: unknown
): string {
  let payload = ''
  try {
    payload = JSON.stringify(input ?? {}, null, 0)
  } catch {
    payload = String(input)
  }
  if (payload.length > 4000) payload = payload.slice(0, 4000) + '…'
  return `Tool: ${toolName}\nInput: ${payload}`
}

function bullets(title: string, items: string[]): string {
  const cleaned = items.map((s) => s.trim()).filter(Boolean)
  if (!cleaned.length) return ''
  return `${title}\n${cleaned.map((s) => `- ${s}`).join('\n')}\n`
}

/**
 * Compact security rubric — Ackem original text (not CC prompt dump).
 */
export function buildAutoModeSystemPrompt(rules: AutoModeRules = emptyRules()): string {
  return [
    'You are a permission security classifier for a coding agent (AckemCode).',
    'Decide whether the NEXT tool action is safe to auto-allow without asking the human.',
    '',
    'Allow when the action is routine development work inside the project:',
    '- reading/searching code, running tests/builds/linters, git status/diff/log,',
    '- editing ordinary project source under the working tree,',
    '- installing deps with the project package manager when clearly intended.',
    '',
    'Block (shouldBlock=true) when the action is risky or irreversible:',
    '- deleting large trees (rm -rf, Remove-Item -Recurse), wiping disks, chmod 777,',
    '- curl|sh / wget|bash / iwr|iex / base64|sh style remote code execution,',
    '- git push --force, git reset --hard, git clean -fdx, package publish,',
    '- kubectl/terraform/aws/gcloud destructive deletes, docker prune -f,',
    '- exfiltrating secrets (.env, keys, tokens) or posting credentials,',
    '- modifying files clearly outside the project without strong justification,',
    '- disabling security controls (Defender, firewall), reverse shells, privilege escalation.',
    '',
    'When unsure, prefer shouldBlock=true (fail closed).',
    '',
    bullets('User allow hints (prefer allow if they clearly match):', rules.allow),
    bullets('User soft-deny hints (prefer block if they match):', rules.softDeny),
    bullets('Environment notes:', rules.environment),
    'Respond with ONLY a single JSON object, no markdown fences:',
    '{"thinking":"brief reason","shouldBlock":true|false,"reason":"one-line decision"}'
  ]
    .filter((line) => line !== '')
    .join('\n')
}

export function emptyRules(): AutoModeRules {
  return { allow: [], softDeny: [], environment: [] }
}

export function normalizeAutoModeRules(
  raw?: Partial<AutoModeRules> | null
): AutoModeRules {
  const arr = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : []
  return {
    allow: arr(raw?.allow),
    softDeny: arr(raw?.softDeny),
    environment: arr(raw?.environment)
  }
}

/** Parse model JSON (tolerant of fences / leading prose). */
export function parseClassifierJson(text: string): {
  shouldBlock: boolean
  reason: string
  thinking?: string
} | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence?.[1]?.trim() || trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as Record<
      string,
      unknown
    >
    if (typeof obj.shouldBlock !== 'boolean') return null
    return {
      shouldBlock: obj.shouldBlock,
      reason:
        typeof obj.reason === 'string' && obj.reason.trim()
          ? obj.reason.trim()
          : obj.shouldBlock
            ? 'Classifier blocked action'
            : 'Classifier allowed action',
      thinking: typeof obj.thinking === 'string' ? obj.thinking : undefined
    }
  } catch {
    return null
  }
}

function recentUserHints(messages: ChatMessage[] | undefined, max = 6): string {
  if (!messages?.length) return ''
  const bits: string[] = []
  for (let i = messages.length - 1; i >= 0 && bits.length < max; i--) {
    const m = messages[i]!
    if (m.role !== 'user' || typeof m.content !== 'string') continue
    const t = m.content.trim()
    if (!t) continue
    bits.unshift(t.length > 500 ? t.slice(0, 500) + '…' : t)
  }
  if (!bits.length) return ''
  return `Recent user messages (context only):\n${bits.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n\n`
}

/**
 * R8 stage 1: short fast-screen prompt (cheap model friendly). Three-way
 * output — allow / block / unsure. Anything not clearly routine must be
 * "unsure" so stage 2 re-reviews with more context.
 */
export function buildStage1SystemPrompt(): string {
  return [
    'You are a FAST permission screen for a coding agent. One pending tool action.',
    'Answer allow ONLY for clearly routine development work: reading/searching code,',
    'tests/builds/linters, git status/diff/log, ordinary source edits inside the project.',
    'Answer block ONLY for obviously destructive/malicious actions: recursive deletes,',
    'disk wipes, remote-code pipes (curl|sh), force-push, credential exfiltration.',
    'Anything in between, ambiguous, or context-dependent → unsure.',
    'Respond with ONLY one JSON object, no fences:',
    '{"verdict":"allow"|"block"|"unsure","reason":"one line"}'
  ].join('\n')
}

/** R8: parse the stage-1 screen JSON. Null → treat as unsure/unavailable. */
export function parseStage1Json(
  text: string
): { verdict: Stage1Verdict; reason: string } | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence?.[1]?.trim() || trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as Record<
      string,
      unknown
    >
    const v = typeof obj.verdict === 'string' ? obj.verdict.toLowerCase() : ''
    if (v !== 'allow' && v !== 'block' && v !== 'unsure') return null
    return {
      verdict: v,
      reason:
        typeof obj.reason === 'string' && obj.reason.trim()
          ? obj.reason.trim()
          : `stage1 ${v}`
    }
  } catch {
    return null
  }
}

/** R8: cheap stage-1 model (env override), falling back to the main model. */
export function resolveStage1Model(mainModel: string): string {
  const env = process.env.ACKEM_AUTO_CLASSIFIER_STAGE1_MODEL?.trim()
  return env || mainModel
}

/** R8: ACKEM_AUTO_CLASSIFIER_TWO_STAGE=0 falls back to single full-pass. */
export function isTwoStageClassifierEnabled(): boolean {
  const v = process.env.ACKEM_AUTO_CLASSIFIER_TWO_STAGE
  return !(v === '0' || v === 'false' || v === 'off')
}

async function runStage1(opts: {
  apiBaseUrl: string
  apiKey: string
  model: string
  action: string
  signal?: AbortSignal
}): Promise<{ verdict: Stage1Verdict; reason: string } | null> {
  try {
    const { message: msg } = await chatCompletion({
      apiBaseUrl: opts.apiBaseUrl,
      apiKey: opts.apiKey,
      model: opts.model,
      effort: 'low',
      messages: [
        { role: 'system', content: buildStage1SystemPrompt() },
        { role: 'user', content: `Screen this pending tool action:\n\n${opts.action}\n` }
      ],
      tools: [],
      signal: opts.signal
    })
    const text = typeof msg.content === 'string' ? msg.content : ''
    return parseStage1Json(text)
  } catch {
    // Stage-1 trouble is never fatal — stage 2 is the authority.
    return null
  }
}

/**
 * Two-stage auto classifier (CC yoloClassifier stage1 fast screen → stage2
 * contextual review). Stage 1 may only fast-ALLOW clearly routine actions;
 * block/unsure/failure always escalates to the full stage-2 pass, so the
 * fail-closed and iron-gate semantics of stage 2 are unchanged.
 */
export async function classifyAutoModeAction(opts: {
  apiBaseUrl: string
  apiKey: string
  model: string
  toolName: string
  input?: unknown
  rules?: AutoModeRules
  /** Optional short transcript context (user turns). */
  messages?: ChatMessage[]
  signal?: AbortSignal
}): Promise<AutoModeClassifierResult> {
  const started = Date.now()
  const model = opts.model || 'gpt-4.1-mini'

  if (!opts.apiKey?.trim()) {
    return {
      shouldBlock: true,
      reason: 'Auto-mode classifier unavailable: missing API key',
      unavailable: true,
      model,
      durationMs: Date.now() - started
    }
  }

  if (isAutoModeAllowlistedTool(opts.toolName)) {
    return {
      shouldBlock: false,
      reason: `Auto allowlist: ${opts.toolName}`,
      model,
      durationMs: Date.now() - started
    }
  }

  const action = formatActionForClassifier(opts.toolName, opts.input)

  // R8 stage 1: fast screen. Only a clear "allow" short-circuits.
  let stage1Verdict: Stage1Verdict | undefined
  let stage1Reason = ''
  if (isTwoStageClassifierEnabled()) {
    const stage1Model = resolveStage1Model(model)
    const s1 = await runStage1({
      apiBaseUrl: opts.apiBaseUrl,
      apiKey: opts.apiKey,
      model: stage1Model,
      action,
      signal: opts.signal
    })
    if (s1) {
      stage1Verdict = s1.verdict
      stage1Reason = s1.reason
      if (s1.verdict === 'allow') {
        return {
          shouldBlock: false,
          reason: `Auto classifier (stage1): ${s1.reason}`,
          model: stage1Model,
          durationMs: Date.now() - started,
          stage: 1,
          stage1Verdict: 'allow'
        }
      }
    }
  }

  // Stage 2: full contextual review (also the single-stage path).
  const system = buildAutoModeSystemPrompt(opts.rules ?? emptyRules())
  const stage1Note = stage1Verdict
    ? `A fast pre-screen flagged this action as "${stage1Verdict}" (${stage1Reason}). Re-review carefully with the full context below.\n\n`
    : ''
  const user =
    stage1Note +
    recentUserHints(opts.messages) +
    `Classify this pending tool action:\n\n${action}\n`

  try {
    const { message: msg } = await chatCompletion({
      apiBaseUrl: opts.apiBaseUrl,
      apiKey: opts.apiKey,
      model,
      effort: 'low',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      tools: [],
      signal: opts.signal
    })
    const text = typeof msg.content === 'string' ? msg.content : ''
    const parsed = parseClassifierJson(text)
    if (!parsed) {
      return {
        shouldBlock: true,
        reason: 'Auto-mode classifier returned unparseable response (fail-closed)',
        unavailable: true,
        model,
        durationMs: Date.now() - started,
        stage: 2,
        stage1Verdict
      }
    }
    return {
      shouldBlock: parsed.shouldBlock,
      reason: `Auto classifier: ${parsed.reason}`,
      model,
      durationMs: Date.now() - started,
      stage: 2,
      stage1Verdict
    }
  } catch (e) {
    const detail =
      e instanceof LlmError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e)
    return {
      shouldBlock: true,
      reason: `Auto-mode classifier error (fail-closed): ${detail}`,
      unavailable: true,
      model,
      durationMs: Date.now() - started,
      stage: 2,
      stage1Verdict
    }
  }
}

/**
 * Iron gate (CC tengu_iron_gate_closed spirit): when the classifier is
 * unavailable, deny (not silent allow). Default ON.
 * Set ACKEM_AUTO_IRON_GATE=0 to fall back to ask (human decides).
 */
export function isAutoIronGateClosed(): boolean {
  const v = process.env.ACKEM_AUTO_IRON_GATE
  if (v === '0' || v === 'false' || v === 'off') return false
  return true
}

/**
 * Map classifier outcome onto a permission verdict.
 * - allow when clearly safe
 * - deny when blocked
 * - unavailable: deny under iron gate (default); else ask
 */
export function applyClassifierToVerdict(
  result: AutoModeClassifierResult
): { behavior: 'allow' | 'deny' | 'ask'; reason: string } {
  if (result.unavailable) {
    if (isAutoIronGateClosed()) {
      return {
        behavior: 'deny',
        reason: `${result.reason} (iron gate: deny while classifier unavailable)`
      }
    }
    return {
      behavior: 'ask',
      reason: result.reason
    }
  }
  if (result.shouldBlock) {
    return {
      behavior: 'deny',
      reason: result.reason
    }
  }
  return {
    behavior: 'allow',
    reason: result.reason
  }
}

export type AutoModeClassifierApplyOpts = {
  toolName: string
  input: unknown
  cwd: string
  settings: Pick<
    AckemCodeSettings,
    'apiBaseUrl' | 'apiKey' | 'model' | 'autoMode'
  >
  recentMessages?: ChatMessage[]
  signal?: AbortSignal
  permissions: PermissionBroker
  onStatus?: (message: string) => void
  classifyAuto?: typeof classifyAutoModeAction
}

/**
 * Resolve gray-zone ask verdicts via auto-mode LLM classifier (main loop + sub-agents).
 * When `active` is false, returns verdict unchanged.
 */
export async function maybeApplyAutoModeClassifier(
  active: boolean,
  verdict: PermissionEvalResult,
  ctx: AutoModeClassifierApplyOpts
): Promise<PermissionEvalResult> {
  if (
    !active ||
    !verdict.classifierCandidate ||
    verdict.behavior !== 'ask' ||
    isAutoModeClassifierEnvDisabled()
  ) {
    return verdict
  }

  const name = ctx.toolName
  const parsedInput = ctx.input

  if (isAutoModeAllowlistedTool(name)) {
    return {
      behavior: 'allow',
      reason: `Auto allowlist: ${name}`
    }
  }

  ctx.onStatus?.(`auto-mode classifier · ${name}`)
  const classify = ctx.classifyAuto ?? classifyAutoModeAction
  let clf: AutoModeClassifierResult
  try {
    clf = await classify({
      apiBaseUrl: ctx.settings.apiBaseUrl,
      apiKey: ctx.settings.apiKey,
      model: ctx.settings.autoMode?.model || ctx.settings.model,
      toolName: name,
      input: parsedInput,
      rules: normalizeAutoModeRules(ctx.settings.autoMode),
      messages: ctx.recentMessages,
      signal: ctx.signal
    })
  } catch (e) {
    clf = {
      shouldBlock: true,
      unavailable: true,
      reason: `Auto-mode classifier threw (fail-closed): ${
        e instanceof Error ? e.message : String(e)
      }`
    }
  }
  let next = applyClassifierToVerdict(clf)
  let resolved: PermissionEvalResult = {
    behavior: next.behavior,
    reason: next.reason
  }
  if (resolved.behavior === 'allow') {
    try {
      const risk = classifyToolRisk({
        toolName: name,
        input: parsedInput,
        cwd: ctx.cwd,
        additionalWorkingDirectories:
          ctx.permissions.getAdditionalWorkingDirectories()
      })
      if (risk.level === 'critical') {
        resolved = {
          behavior: 'deny',
          reason: `Auto mis-allow blocked: ${risk.reason}`
        }
      } else if (riskBlocksAutoAllow(risk.level)) {
        resolved = {
          behavior: 'ask',
          reason: `Auto mis-allow blocked: ${risk.reason}`
        }
      }
    } catch {
      resolved = {
        behavior: 'ask',
        reason: 'Auto mis-allow blocked: risk re-check failed (fail-closed)'
      }
    }
  }
  if (
    resolved.behavior === 'deny' ||
    resolved.behavior === 'allow' ||
    resolved.behavior === 'ask'
  ) {
    const tracked = ctx.permissions.noteClassifierOutcome(resolved.behavior)
    if (resolved.behavior === 'deny' && tracked.fallbackToAsk) {
      resolved = {
        behavior: 'ask',
        reason: `${resolved.reason} (denial tracking: fallback to prompt after ${tracked.state.consecutiveDenials} consecutive / ${tracked.state.totalDenials} total denials)`
      }
    }
  }
  ctx.onStatus?.(
    `auto-mode → ${resolved.behavior}: ${resolved.reason.slice(0, 120)}`
  )
  return resolved
}

/** Env ACKEM_AUTO_MODE_CLASSIFIER=0 disables LLM even in auto mode. */
export function isAutoModeClassifierEnvDisabled(): boolean {
  const v = process.env.ACKEM_AUTO_MODE_CLASSIFIER
  return v === '0' || v === 'false' || v === 'off'
}
