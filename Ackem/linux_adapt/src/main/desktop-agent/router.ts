import type { WebContents } from 'electron'
import type { UseComputerArgs } from '../../shared/desktopAgent'
import type { AppSettings } from '../settings'
import type { ToolResult } from '../engine/types'
import { appendDesktopAgentAudit } from './auditLog'
import {
  actionLabel,
  CLOSE_ACTIONS
} from './actions'
import {
  checkActionSettings,
  evaluatePathPolicy,
  isBlockedCloseTarget
} from './policy'
import { requestDesktopAgentConfirm } from './confirm/confirmService'
import { shouldSkipDesktopAgentConfirm } from './confirmBypass'
import { executeDesktopAgentAction } from './adapters/win/executor'
import { homedir } from 'node:os'

function decisionMessage(decision: string): string {
  if (decision === 'timeout') return '用户未在时限内确认，操作已取消'
  if (decision === 'denied') return '用户未允许该操作'
  return decision
}

function memoryHintFromSummary(action: string, summary: string, ok: boolean): string | undefined {
  if (!ok) return `电脑助手：${summary}`
  return `电脑助手 ${action}：${summary}`
}

export async function executeUseComputer(
  args: UseComputerArgs,
  ctx: {
    settings: AppSettings
    dataRoot: string
    webContents?: WebContents
    sessionId?: string
    taskPlanId?: string
    background?: boolean
  }
): Promise<ToolResult> {
  const action = args.action
  const cwd = homedir()

  const settingsBlock = checkActionSettings(action, ctx.settings)
  if (settingsBlock) {
    appendDesktopAgentAudit(ctx.dataRoot, {
      ts: new Date().toISOString(),
      action,
      path: args.path,
      path_to: args.path_to,
      target: args.target,
      url: args.url,
      result: 'blocked',
      summary: settingsBlock
    })
    return {
      toolName: 'use_computer',
      success: false,
      content: settingsBlock,
      summary: settingsBlock
    }
  }

  if (CLOSE_ACTIONS.has(action)) {
    const target = (args.target || args.path || '').trim()
    if (isBlockedCloseTarget(target)) {
      const msg = '系统关键进程不可关闭'
      appendDesktopAgentAudit(ctx.dataRoot, {
        ts: new Date().toISOString(),
        action,
        target,
        result: 'blocked',
        summary: msg
      })
      return {
        toolName: 'use_computer',
        success: false,
        content: msg,
        summary: msg
      }
    }
  }

  const policy = evaluatePathPolicy(action, args.path, args.path_to, cwd)
  if (!policy.ok) {
    appendDesktopAgentAudit(ctx.dataRoot, {
      ts: new Date().toISOString(),
      action,
      path: args.path,
      path_to: args.path_to,
      result: 'blocked',
      summary: policy.hardBlockReason
    })
    return {
      toolName: 'use_computer',
      success: false,
      content: policy.hardBlockReason ?? '策略拦截',
      summary: policy.hardBlockReason ?? '策略拦截'
    }
  }

  const label = actionLabel(action)
  const kind = CLOSE_ACTIONS.has(action) ? 'close' : 'generic'
  const statusText =
    kind === 'close'
      ? `等待你确认关闭 ${args.target || args.path || '目标'}…`
      : `等待你确认：${label} ${policy.normalizedPath ?? args.url ?? args.target ?? ''}…`
  const sessionId = ctx.sessionId ?? 'default'
  if (ctx.webContents) {
    if (ctx.background) {
      ctx.webContents.send('desktop-agent:job-status', { sessionId, label: statusText })
      ctx.webContents.send('desktop-agent:job-state', {
        sessionId,
        phase: 'waiting_confirm',
        label: statusText,
        active: true
      })
    } else {
      ctx.webContents.send('chat:status', statusText)
    }
  }

  const skipConfirm = shouldSkipDesktopAgentConfirm(
    ctx.dataRoot,
    sessionId,
    action,
    ctx.taskPlanId
  )
  const showTaskDeleteBatch =
    action === 'delete_path' && Boolean(ctx.taskPlanId) && !skipConfirm
  const decision = skipConfirm
    ? ('allowed' as const)
    : await requestDesktopAgentConfirm({
        action,
        actionLabel: label,
        kind,
        path: policy.normalizedPath ?? args.path,
        pathTo: policy.normalizedPathTo ?? args.path_to,
        target: args.target,
        url: args.url,
        sensitiveWarning: policy.sensitiveWarning,
        pathMissing: policy.pathMissing,
        hardBlockReason: policy.hardBlockReason,
        taskPlanId: ctx.taskPlanId,
        showTaskDeleteBatch
      })

  if (ctx.background && ctx.webContents) {
    ctx.webContents.send('desktop-agent:job-state', {
      sessionId,
      phase: 'executing',
      label: '继续执行…',
      active: true
    })
  }

  if (decision !== 'allowed') {
    const msg = decisionMessage(decision)
    appendDesktopAgentAudit(ctx.dataRoot, {
      ts: new Date().toISOString(),
      action,
      path: policy.normalizedPath,
      path_to: policy.normalizedPathTo,
      target: args.target,
      url: args.url,
      result: decision,
      summary: msg
    })
    return {
      toolName: 'use_computer',
      success: false,
      content: msg,
      summary: msg,
      memoryHint: `电脑助手：用户拒绝 ${label}`
    }
  }

  try {
    const execArgs: UseComputerArgs = {
      ...args,
      path: policy.normalizedPath ?? args.path,
      path_to: policy.normalizedPathTo ?? args.path_to
    }
    const result = await executeDesktopAgentAction(action, execArgs, {
      dataRoot: ctx.dataRoot,
      downloadDir: ctx.settings.desktopAgentDownloadDir,
      cwd
    })

    appendDesktopAgentAudit(ctx.dataRoot, {
      ts: new Date().toISOString(),
      action,
      path: execArgs.path,
      path_to: execArgs.path_to,
      target: args.target,
      url: args.url,
      result: 'allowed',
      summary: result.summary
    })

    return {
      toolName: 'use_computer',
      success: result.ok,
      content: result.content,
      summary: result.summary,
      memoryHint: memoryHintFromSummary(label, result.summary, result.ok)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    appendDesktopAgentAudit(ctx.dataRoot, {
      ts: new Date().toISOString(),
      action,
      path: policy.normalizedPath,
      path_to: policy.normalizedPathTo,
      result: 'error',
      summary: msg
    })
    return {
      toolName: 'use_computer',
      success: false,
      content: `执行失败：${msg}`,
      summary: `执行失败：${msg}`
    }
  }
}
