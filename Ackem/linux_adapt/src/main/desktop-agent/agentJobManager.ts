import type { WebContents } from 'electron'
import type { DesktopAgentJobPhase } from '../../shared/desktopAgentDock'
import { createLogger } from '../logger'
import { runOpenAiDesktopAgentJob } from './openAiAgentJobRunner'
import { runAnthropicDesktopAgentJobBackground } from './anthropicAgentLoop'
import { isContinueTaskPlanIntent, loadPersistedTaskPlan } from './task-plan/taskPlanStore'
import { deliverDesktopAgentTaskResult } from './deliveryCoordinator'

const log = createLogger('desktop-agent.job')

type RunningJob = {
  abort: AbortController
  promise: Promise<void>
}

function jobKey(dataRoot: string, sessionId: string): string {
  return `${dataRoot}::${sessionId}`
}

const running = new Map<string, RunningJob>()

function emitJobState(
  webContents: WebContents,
  sessionId: string,
  phase: DesktopAgentJobPhase,
  label?: string
): void {
  webContents.send('desktop-agent:job-state', {
    sessionId,
    phase,
    label,
    active: phase !== 'idle' && phase !== 'completed' && phase !== 'failed'
  })
}

function buildJobFailureDeliveryText(err: string): string {
  if (/tool_choice|thinking mode does not support/i.test(err)) {
    return [
      '任务未能完成：当前模型处于 **Thinking 推理模式**，接口不允许强制指定工具（tool_choice=required）。',
      '',
      '你可以：',
      '- 在模型设置里关闭 Thinking / 去掉额外请求头中的 enable_thinking；',
      '- 或换用非 reasoner 的 chat 模型；',
      '- 然后重新发送任务指令。',
      '',
      `（技术详情：${err.slice(0, 240)}）`
    ].join('\n')
  }
  if (/任务已取消|aborted/i.test(err)) {
    return '电脑助手任务已取消。'
  }
  return `任务未能完成：${err.slice(0, 400)}`
}

export function isBackgroundAgentJobRunning(dataRoot: string, sessionId: string): boolean {
  return running.has(jobKey(dataRoot, sessionId))
}

import { isDesktopAgentPipelineOpen } from '../../shared/desktopAgentFeature'

export function startBackgroundAgentJob(params: {
  provider: 'openai' | 'anthropic'
  webContents: WebContents
  body: Record<string, unknown>
  dataRoot: string
  sessionId: string
  userText: string
}): void {
  if (!isDesktopAgentPipelineOpen()) return
  const key = jobKey(params.dataRoot, params.sessionId)
  if (running.has(key)) {
    if (isContinueTaskPlanIntent(params.userText)) {
      log.info('job.already_running', { sessionId: params.sessionId })
    }
    return
  }

  const abort = new AbortController()
  const run =
    params.provider === 'anthropic'
      ? runAnthropicDesktopAgentJobBackground({
          webContents: params.webContents,
          body: params.body,
          dataRoot: params.dataRoot,
          signal: abort.signal
        })
      : runOpenAiDesktopAgentJob({
          webContents: params.webContents,
          body: params.body,
          dataRoot: params.dataRoot,
          background: true,
          signal: abort.signal
        })

  const promise = (async () => {
    emitJobState(params.webContents, params.sessionId, 'executing', '电脑助手任务执行中…')
    params.webContents.send('desktop-agent:agent-busy', { sessionId: params.sessionId, busy: true })
    try {
      await run
      emitJobState(params.webContents, params.sessionId, 'completed')
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      log.warn('job.fail', { err })
      emitJobState(params.webContents, params.sessionId, 'failed', err)
      const persisted = loadPersistedTaskPlan(params.dataRoot, params.sessionId)
      deliverDesktopAgentTaskResult(params.webContents, {
        sessionId: params.sessionId,
        taskPlanId: persisted?.plan.id,
        goalSummary: persisted?.plan.goalSummary ?? params.userText.slice(0, 80),
        allPassed: false,
        text: buildJobFailureDeliveryText(err)
      })
    } finally {
      params.webContents.send('desktop-agent:agent-busy', {
        sessionId: params.sessionId,
        busy: false
      })
      params.webContents.send('desktop-agent:job-status', {
        sessionId: params.sessionId,
        label: ''
      })
      emitJobState(params.webContents, params.sessionId, 'idle')
    }
  })()

  running.set(key, { abort, promise })
  void promise.finally(() => {
    running.delete(key)
  })
}

export function cancelBackgroundAgentJob(dataRoot: string, sessionId: string): void {
  const job = running.get(jobKey(dataRoot, sessionId))
  if (job) {
    job.abort.abort()
  }
}

export function resetAgentJobManagerForTests(): void {
  for (const [, job] of running) {
    job.abort.abort()
  }
  running.clear()
}
