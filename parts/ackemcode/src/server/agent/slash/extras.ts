import { EFFORT_LEVELS, isEffortLevel } from '../../../shared/types.js'
import {
  estimateMessagesTokens,
  estimateContextBreakdown,
  formatContextReport,
  resolveContextWindowInfo
} from '../compact/index.js'
import { manageMcp, parseMcpSlashArg } from '../mcpManage.js'
import type { SlashContext, SlashHandleResult } from './types.js'

export function extraHelpLines(): string[] {
  return [
    '/effort [low|medium|high|max] — 思考强度',
    '/model [id] — 切换已注册模型（/setup 测试通过；CLI 无参弹选择器）',
    '/context — 上下文窗口、来源、各桶占用',
    '/mcp [list|enable|disable|add|remove|reconnect|auth] — MCP 管理',
    '/setup — standalone LLM 配置说明',
    '/web-set — 配置网页搜索密钥（Tavily / SerpAPI / Brave）',
    '/sandbox [on|off|status] — 沙箱开关',
    '/memory — 列出 memdir 笔记',
    '/plugins — 本地 plugin.json 包',
    '/pr — gh 开 PR 提示',
    '/commit — git 提交提示'
  ]
}

export async function handleExtraSlash(
  name: string,
  arg: string,
  ctx: SlashContext
): Promise<SlashHandleResult | null> {
  if (name === 'effort') {
    const current = ctx.getEffort?.() ?? 'medium'
    if (!arg) {
      return {
        handled: true,
        message: `slash /effort — 当前：${current}，用法：/effort <${EFFORT_LEVELS.join('|')}>`
      }
    }
    if (!isEffortLevel(arg)) {
      return {
        handled: true,
        message: `slash /effort — 未知 "${arg}"，可选：${EFFORT_LEVELS.join(', ')}`
      }
    }
    if (!ctx.setEffort) {
      return { handled: true, message: 'slash /effort — setEffort 不可用' }
    }
    await ctx.setEffort(arg)
    return { handled: true, message: `slash /effort → ${arg}` }
  }

  if (name === 'model') {
    const registered = (await ctx.getRegisteredModels?.()) ?? []
    const current = ctx.getModel?.() ?? '(未设置)'
    if (!arg) {
      if (!registered.length) {
        return {
          handled: true,
          message: 'slash /model — 尚无注册模型。请先用 /setup 测试通过并保存。'
        }
      }
      const lines = registered.map(
        (m) => `  · ${m.model}${m.model === current ? ' (当前)' : ''}`
      )
      return {
        handled: true,
        message: [
          `slash /model — 已注册（${registered.length}）`,
          ...lines,
          '',
          'CLI 输入 /model 打开选择器'
        ].join('\n')
      }
    }
    if (!ctx.setModel) {
      return { handled: true, message: 'slash /model — setModel 不可用' }
    }
    const hit = registered.some((m) => m.model === arg)
    if (!hit) {
      return {
        handled: true,
        message: `slash /model — 「${arg}」未注册。请先用 /setup 测试通过后再切换。`
      }
    }
    await ctx.setModel(arg, true)
    return { handled: true, message: `slash /model → ${arg}（已保存）` }
  }

  if (name === 'context') {
    const history = ctx.getHistory?.() ?? []
    const tokens = estimateMessagesTokens(history)
    const model = ctx.getModel?.() ?? ''
    const info = resolveContextWindowInfo({
      settingsContextWindow: ctx.getContextWindow?.(),
      model
    })
    const breakdown = estimateContextBreakdown({ history, info })
    return {
      handled: true,
      message: formatContextReport({
        model: model || '(未设置)',
        tokens,
        info,
        breakdown,
        sessionId: ctx.getSessionId?.()
      }),
      data: { tokens, info, breakdown }
    }
  }

  if (name === 'mcp') {
    const input = parseMcpSlashArg(arg)
    const result = ctx.manageMcp
      ? await ctx.manageMcp(arg)
      : await manageMcp(input)
    return { handled: true, message: result.output, data: { ok: result.ok } }
  }

  if (name === 'setup') {
    const { runSetupChecklist, formatSetupChecklist } = await import(
      '../setupChecklist.js'
    )
    const checks = await runSetupChecklist()
    return {
      handled: true,
      message: [
        '=== /setup ===',
        'Standalone CLI 写入 data/settings.standalone.json',
        '字段：apiBaseUrl · apiKey · model · contextWindow · llmVendorId',
        '测试：POST /api/llm/test   厂商列表：GET /api/llm/vendors',
        'Ink：在 CLI 里运行 /setup 向导。Runtime 不在聊天里收密钥。',
        '',
        formatSetupChecklist(checks)
      ].join('\n')
    }
  }

  if (name === 'web-set') {
    return {
      handled: true,
      message: [
        '=== /web-set ===',
        '网页搜索密钥由用户自己申请，写入 settings.webSearch。',
        '引擎：Tavily（推荐）· SerpAPI · Brave',
        'Tavily：https://app.tavily.com  每月 1000 免费额度，无需绑卡，密钥以 tvly- 开头',
        'SerpAPI：https://serpapi.com/users/sign_up  → https://serpapi.com/manage-api-key',
        'Brave：https://api-dashboard.search.brave.com/register  免费档约 $5，注册需绑卡防滥用',
        'Ink：在 CLI 里运行 /web-set，← → 选引擎后粘贴密钥。聊天里不收密钥。'
      ].join('\n')
    }
  }

  if (name === 'sandbox') {
    const cur = ctx.getSandboxEnabled?.() ?? false
    if (!arg || arg === 'status') {
      return {
        handled: true,
        message: `slash /sandbox — ${cur ? '开' : '关'}，用法：/sandbox on|off`
      }
    }
    if (arg === 'on' || arg === 'off') {
      if (!ctx.setSandboxEnabled) {
        return { handled: true, message: 'slash /sandbox — setSandboxEnabled 不可用' }
      }
      await ctx.setSandboxEnabled(arg === 'on')
      return { handled: true, message: `slash /sandbox → ${arg}` }
    }
    return { handled: true, message: 'slash /sandbox — 用法：/sandbox [on|off|status]' }
  }

  if (name === 'memory') {
    if (!ctx.listMemory) {
      return { handled: true, message: 'slash /memory — listMemory 不可用' }
    }
    const text = await ctx.listMemory()
    return { handled: true, message: text }
  }

  if (name === 'plugins') {
    if (!ctx.listPlugins) {
      return { handled: true, message: 'slash /plugins — listPlugins 不可用' }
    }
    const text = await ctx.listPlugins()
    return { handled: true, message: `=== /plugins ===\n${text}` }
  }

  if (name === 'pr') {
    return {
      handled: true,
      message: [
        '=== /pr ===',
        '使用本地 gh（gh auth login）。建议：',
        '  gh pr create --fill',
        '  gh pr view --comments',
        '或让 Agent 用 bash/gh 开 PR。'
      ].join('\n')
    }
  }

  if (name === 'commit') {
    return {
      handled: true,
      message:
        '=== /commit ===\n让 Agent 查看 git status/diff 并写提交说明；或自己在终端 git commit。'
    }
  }

  if (ctx.invokePluginCommand) {
    const plug = await ctx.invokePluginCommand(name, arg)
    if (plug) {
      return {
        handled: true,
        message: `slash /${name} — plugin command`,
        followUpUserText: plug
      }
    }
  }

  if (ctx.invokeSkillFollowUp) {
    const follow = await ctx.invokeSkillFollowUp(name, arg)
    if (follow) {
      return {
        handled: true,
        message: `slash /${name} — 正在调用 skill`,
        followUpUserText: follow
      }
    }
  }

  return null
}
