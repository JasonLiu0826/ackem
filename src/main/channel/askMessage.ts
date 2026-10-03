import type { ChannelPlan } from '../../shared/channelPlan'

export function askMessageFor(plan: ChannelPlan, names?: Record<string, string>): string {
  switch (plan.pendingConfirm) {
    case 'work_job':
      return plan.cwd
        ? `我可以在 ${plan.cwd} 做这件事。确认后开始这项任务。`
        : '我可以在该目录完成这件事。请先选定目录，确认后开始。'
    case 'create':
      return '我会制作这个插件。确认后开始任务。'
    case 'update':
      return `我会修改${names?.[plan.extensionId ?? ''] ?? '这个插件'}。确认后开始任务。`
    case 'use_missing':
      return '我还没有这项能力，要不要给你做一个？'
    case 'plugin_ask': {
      const list = (plan.candidateExtensionIds ?? [])
        .map((id) => names?.[id] ?? id)
        .join('、')
      return `有几项相近能力（${list}）。要启用哪一个？`
    }
    case 'plugin_use':
      return `我可以现在调用${names?.[plan.extensionId ?? ''] ?? '这个插件'}。确认后开始。`
    default:
      return plan.grounding
  }
}
