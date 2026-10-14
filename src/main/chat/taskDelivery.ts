import type { AppSettings } from '../settings'
import { personalityResultLead } from '../personalityVoice'
import type { ActionRun } from '../memory/contracts'
import type { ReplyMetadata } from '../../shared/response'
import { guardReplyText } from '../channel/outputGuard'
export function buildTaskDelivery(run: ActionRun, input: { goal: string; files: string[]; summary?: string; checks?: Array<{ command: string; ok: boolean }>; settings?: AppSettings }): ({ content: string; actionStatus: ActionRun['status'] } & ReplyMetadata) | null {
  if (!['succeeded', 'failed', 'aborted', 'unknown'].includes(run.status)) return null
  const status = run.status as 'succeeded' | 'failed' | 'aborted' | 'unknown'
  const label = { succeeded: '任务已完成', failed: '任务执行失败', aborted: '任务已停止', unknown: '任务结果暂时无法确认' }[status]!
  const files = [...new Set(input.files)].slice(0, 30)
  const artifacts = files.length ? '\n\n已收到成功文件操作的产物：\n' + files.map(path => `- \`${path.replace(/`/g, '')}\``).join('\n') : ''
  const summary = input.summary?.trim() ? '\n\n执行说明：\n' + guardReplyText(input.summary.trim().slice(0, 6000), { origin: 'action_result', style: 'assistant', status, runId: run.runId, receipt: { files } }) : ''
  const checks = input.checks?.length ? '\n\n校验命令回执（工具返回状态）：\n' + input.checks.slice(-10).map(check => `- ${check.ok ? '返回成功' : '返回失败'}：\`${check.command.replace(/`/g, '').slice(0, 300)}\``).join('\n') : ''
  return { replyId: `task-result-${run.runId}`, turnId: run.turnId, runId: run.runId, origin: 'action_result', sourceLabel: '任务结果 · AckemCode',
    actionStatus: status, artifacts: files.map(path => ({ kind: 'file' as const, path })), content: `${input.settings ? personalityResultLead(input.settings, status) : label + "。"}\n\n任务：${input.goal.slice(0, 300)}${summary}${artifacts}${checks}${run.status === 'unknown' ? '\n\n连接已中断或缺少可信回执，不能据此判断成功；可在工作台查看并恢复。' : ''}\n\n详细执行过程可在工作台查看。` }
}
