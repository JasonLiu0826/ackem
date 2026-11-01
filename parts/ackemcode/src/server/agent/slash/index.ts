/**
 * Slash command router — Claude Code processSlashCommand / commands/* spirit.
 * GM-SLASH: backend-only builtins; unknown slash → user text (queue never stalls).
 */
import type { ChatMessage } from '../../../shared/types.js'
import { HOOK_EVENTS, type HooksConfig } from '../../hooks/types.js'
import {
  estimateMessagesTokens,
  maybeCompactMessages
} from '../compact/index.js'
import { buildDoctorReport } from './doctor.js'
import { runGitDiffSummary } from './gitDiff.js'
import {
  BUILTIN_SLASH_COMMANDS,
  SLASH_PERMISSION_MODES,
  type SlashContext,
  type SlashHandleResult
} from './types.js'
import {
  SLASH_AGENT_TIERS,
  agentTierLabel,
  normalizeAgentTier
} from '../agentCollaboration.js'
import {
  formatSkillsListing,
  loadSkillsDetailed
} from '../../skills/loadSkills.js'
import { extraHelpLines, handleExtraSlash } from './extras.js'

export type { SlashContext, SlashHandleResult } from './types.js'
export { BUILTIN_SLASH_COMMANDS, SLASH_PERMISSION_MODES } from './types.js'

function helpText(): string {
  return [
    '=== /help（AckemCode 斜杠命令）===',
    '/clear — 清空会话 history、todo、读文件缓存',
    '/mode <mode> — 设置权限模式（' +
      SLASH_PERMISSION_MODES.join('|') +
      '）',
    '/agents [solo|auto|team] — Agent 协作档位（并行子 Agent）',
    '/plan — 未在 plan 时进入计划模式；已在 plan 时预览（/plan enter 强制进入）',
    '/compact — 强制压缩一次上下文',
    '/status | /cost — 会话快照（模式、cwd、token 等）',
    '/diff — 只读 git status / diff --stat',
    '/doctor — 权限 / hooks / sandbox / MCP / LSP 自检',
    '/hooks — 列出已配置的 hook 事件',
    '/skills — 已安装技能（含 override / 校验）',
    ...extraHelpLines(),
    '',
    '未知 /命令 会当作普通用户句转发（队列不会卡住）。'
  ].join('\n')
}

function listConfiguredHooks(
  config: HooksConfig | Record<string, unknown> | undefined
): { events: string[]; detail: string[] } {
  if (!config || typeof config !== 'object') {
    return { events: [], detail: [] }
  }
  const events: string[] = []
  const detail: string[] = []
  for (const ev of HOOK_EVENTS) {
    const groups = (config as Record<string, unknown>)[ev]
    if (!Array.isArray(groups) || !groups.length) continue
    events.push(ev)
    let hookCount = 0
    for (const g of groups) {
      if (g && typeof g === 'object' && Array.isArray((g as { hooks?: unknown }).hooks)) {
        hookCount += (g as { hooks: unknown[] }).hooks.length
      }
    }
    detail.push(`${ev}: ${groups.length} matcher(s), ~${hookCount} hook(s)`)
  }
  return { events, detail }
}

function buildStatusSnapshot(ctx: SlashContext): {
  text: string
  data: Record<string, unknown>
} {
  const history = ctx.getHistory?.() ?? []
  const tokens = estimateMessagesTokens(history as ChatMessage[])
  const data = {
    sessionId: ctx.getSessionId?.() ?? null,
    cwd: ctx.getCwd?.() ?? process.cwd(),
    mode: ctx.getMode?.() ?? 'default',
    historyMessages: history.length,
    estimatedTokens: tokens,
    hooksDisabled: ctx.hooksDisabled?.() === true,
    permissionRules: ctx.getPermissionRuleCounts?.() ?? null,
    verify: ctx.getVerifySummary?.() ?? null,
    agentTier: ctx.getAgentTier?.() ?? 'auto',
    mcp: ctx.getMcpStatus?.() ?? null,
    lsp: ctx.getLspSummary?.() ?? null
  }
  const text = [
    '=== /status ===',
    `session: ${data.sessionId ?? '(无)'}`,
    `cwd: ${data.cwd}`,
    `mode: ${data.mode}`,
    `agents: ${agentTierLabel(normalizeAgentTier(data.agentTier as string))}`,
    `history: ${data.historyMessages} 条消息 ≈ ${data.estimatedTokens} tokens`,
    data.verify
      ? `verify: verdict=${(data.verify as { verdict?: string }).verdict ?? '?'} verified=${Boolean((data.verify as { verified?: boolean }).verified)}`
      : 'verify: (无)',
    data.permissionRules
      ? `rules: allow=${(data.permissionRules as { allow: number }).allow} deny=${(data.permissionRules as { deny: number }).deny} ask=${(data.permissionRules as { ask: number }).ask}`
      : 'rules: (无)',
    `hooks: ${data.hooksDisabled ? '已禁用' : '已启用'}`
  ].join('\n')
  return { text, data }
}

/**
 * Async slash router (compact/diff may I/O).
 * Unknown slash → followUpUserText so the queue never stalls (S07 contract).
 */
export async function handleSlashCommand(
  text: string,
  ctx: SlashContext
): Promise<SlashHandleResult> {
  const raw = text.trim()
  const body = raw.replace(/^\//, '').trim()
  const [cmd, ...rest] = body.split(/\s+/)
  const name = (cmd || '').toLowerCase()
  const arg = rest.join(' ').trim()

  if (name === 'clear') {
    ctx.clearHistory()
    return { handled: true, message: 'slash /clear — 已清空会话 history' }
  }

  if (name === 'mode') {
    if (!arg) {
      return {
        handled: true,
        message:
          'slash /mode — 用法：/mode <' +
          SLASH_PERMISSION_MODES.join('|') +
          '>'
      }
    }
    if (!SLASH_PERMISSION_MODES.includes(arg as (typeof SLASH_PERMISSION_MODES)[number])) {
      return {
        handled: true,
        message: `slash /mode — 未知模式 "${arg}"，可选：${SLASH_PERMISSION_MODES.join(', ')}`
      }
    }
    if (!ctx.setMode) {
      return {
        handled: true,
        message: 'slash /mode — 当前宿主不支持 setMode'
      }
    }
    ctx.setMode(arg)
    return { handled: true, message: `slash /mode → ${arg}` }
  }

  if (name === 'agents') {
    const current = normalizeAgentTier(ctx.getAgentTier?.())
    if (!arg) {
      return {
        handled: true,
        message: `slash /agents — 当前：${agentTierLabel(current)}，用法：/agents <${SLASH_AGENT_TIERS.join('|')}>`
      }
    }
    if (!SLASH_AGENT_TIERS.includes(arg as (typeof SLASH_AGENT_TIERS)[number])) {
      return {
        handled: true,
        message: `slash /agents — 未知档位 "${arg}"，可选：${SLASH_AGENT_TIERS.join(', ')}`
      }
    }
    if (!ctx.setAgentTier) {
      return {
        handled: true,
        message: 'slash /agents — 当前宿主不支持 setAgentTier'
      }
    }
    await ctx.setAgentTier(arg as (typeof SLASH_AGENT_TIERS)[number])
    return {
      handled: true,
      message: `slash /agents → ${agentTierLabel(arg as (typeof SLASH_AGENT_TIERS)[number])}`
    }
  }

  if (name === 'plan') {
    const alreadyPlan = ctx.getMode?.() === 'plan'
    const enter = arg === 'enter' || arg === 'mode' || (!arg && !alreadyPlan)
    if (enter) {
      if (!ctx.setMode) {
        return { handled: true, message: 'slash /plan — setMode 不可用' }
      }
      ctx.setMode('plan')
      return { handled: true, message: alreadyPlan ? '已在 plan 模式' : 'slash /plan → 已进入 plan 模式' }
    }
    if (!ctx.readPlan) {
      return { handled: true, message: 'slash /plan — readPlan 不可用' }
    }
    const { path: planPath, content } = await ctx.readPlan()
    if (!content.trim()) {
      return {
        handled: true,
        message: `slash /plan — 已在 plan 模式，计划文件仍空\nFile: ${planPath}`,
        data: { path: planPath, empty: true }
      }
    }
    const preview =
      content.length > 8000 ? `${content.slice(0, 8000)}\n… (+${content.length - 8000} chars)` : content
    return {
      handled: true,
      message: `=== /plan ===\nFile: ${planPath}\n\n${preview}`,
      data: { path: planPath, chars: content.length }
    }
  }

  if (name === 'help') {
    return { handled: true, message: helpText() }
  }

  if (name === 'compact') {
    const history = ctx.getHistory?.()
    const setHistory = ctx.setHistory
    if (!history || !setHistory) {
      return {
        handled: true,
        message:
          'slash /compact — 无法访问 history，不能压缩'
      }
    }
    const result = maybeCompactMessages(history, { forceFull: true })
    setHistory(result.messages)
    return {
      handled: true,
      message: `slash /compact — kind=${result.kind} tokens ${result.beforeTokens}→${result.afterTokens} truncatedToolResults=${result.truncatedToolResults}`,
      data: {
        kind: result.kind,
        beforeTokens: result.beforeTokens,
        afterTokens: result.afterTokens,
        truncatedToolResults: result.truncatedToolResults
      }
    }
  }

  if (name === 'status' || name === 'cost') {
    const snap = buildStatusSnapshot(ctx)
    return {
      handled: true,
      message: name === 'cost' ? snap.text.replace('/status', '/cost') : snap.text,
      data: snap.data
    }
  }

  if (name === 'diff') {
    const cwd = ctx.getCwd?.() || process.cwd()
    const diff = await runGitDiffSummary(cwd)
    return {
      handled: true,
      message: diff.output,
      data: { ok: diff.ok, cwd }
    }
  }

  if (name === 'doctor') {
    const report = await buildDoctorReport(ctx)
    return {
      handled: true,
      message: report.text,
      data: report.data
    }
  }

  if (name === 'hooks') {
    if (ctx.hooksDisabled?.()) {
      return {
        handled: true,
        message: 'slash /hooks — hooks 已禁用 (disableAllHooks)',
        data: { disabled: true, events: [], knownEvents: [...HOOK_EVENTS] }
      }
    }
    const listed = listConfiguredHooks(ctx.getHooksConfig?.())
    const lines = [
      '=== /hooks ===',
      listed.events.length
        ? listed.detail.join('\n')
        : '（未配置 hook 事件）',
      '',
      `已知 HOOK_EVENTS（${HOOK_EVENTS.length} 个）：${HOOK_EVENTS.join(', ')}`
    ]
    return {
      handled: true,
      message: lines.join('\n'),
      data: {
        disabled: false,
        events: listed.events,
        knownEvents: [...HOOK_EVENTS]
      }
    }
  }

  if (name === 'skills') {
    const cwd = ctx.getCwd?.() || process.cwd()
    const meta = await loadSkillsDetailed({
      cwd,
      useClaudeSkills: false
    })
    const listing = formatSkillsListing(meta.skills)
    const lines = [
      '=== /skills ===',
      listing,
      meta.overrides.length
        ? `\nOverrides（${meta.overrides.length}）：` +
          meta.overrides
            .slice(0, 12)
            .map(
              (o) => `${o.name}: ${o.previousSource}→${o.winnerSource}`
            )
            .join('; ')
        : '',
      meta.validationIssues.length
        ? `\n校验警告：${meta.validationIssues.length} 个 skill`
        : ''
    ].filter(Boolean)
    return {
      handled: true,
      message: lines.join('\n'),
      data: {
        count: meta.skills.length,
        overrides: meta.overrides,
        validationIssues: meta.validationIssues
      }
    }
  }

  const extra = await handleExtraSlash(name, arg, ctx)
  if (extra) return extra

  // Unknown: treat as user prompt so queue never stalls
  const known = BUILTIN_SLASH_COMMANDS.join(', ')
  return {
    handled: true,
    message: `slash /${name || '(空)'} — 非内置命令（${known}），将作为普通用户句转发`,
    followUpUserText: raw
  }
}
