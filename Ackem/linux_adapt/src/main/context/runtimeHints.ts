import type { RuntimeContext } from './types'

/** 生活场景 hint（CTX-A）；confidence 过低时不输出 */
export function buildActivityHint(runtime: RuntimeContext): string | null {
  const { activity } = runtime
  if (activity.confidence < 0.4 || activity.category === 'unknown') return null
  return `用户当前场景：${activity.label}（置信 ${Math.round(activity.confidence * 100)}%）`
}

/** 将 RuntimeContext 格式化为可注入 LLM 的说明块 */
export function buildRuntimeContextHint(runtime: RuntimeContext): string {
  const { user, companion, time } = runtime
  const lines = [
    `【运行时上下文】本地 ${time.localDate} ${time.localTime}（${time.timeOfDay}）`,
    `用户最后活跃：${user.minutesSinceLastChat} 分钟前，参与度 ${user.engagement}`,
    `陪伴在场：${companion.mode}，空闲 ${Math.round(companion.idleDurationMs / 60_000)} 分钟`
  ]

  const activityLine = buildActivityHint(runtime)
  if (activityLine) lines.push(activityLine)

  if (user.engagement === 'active_now' || user.engagement === 'recently_active') {
    lines.push(
      '用户此刻很可能醒着且在线；不要假设 ta 在睡觉或 offline。',
      '若记忆里有熬夜/补觉，以当前仍在互动为准。'
    )
    if (user.recentUserSnippets.length > 0) {
      lines.push(
        '用户最近说的话：',
        ...user.recentUserSnippets.map((s, i) => `${i + 1}. ${s}`)
      )
    }
  } else if (user.engagement === 'idle') {
    lines.push('用户可能暂时离开；不要笃定 ta 一定在睡觉。')
  } else {
    lines.push('用户已较长时间未对话；可温和推测，但不要写死「一定在睡觉」。')
  }

  if (companion.mode === 'sleeping') {
    lines.push('系统推断用户可能已休息（长时间无交互且处于深夜窗口）。')
  }

  return lines.join('\n')
}

/** 日记等场景专用的用户状态 hint（复用 runtime.user） */
export function buildUserPresenceHintFromRuntime(runtime: RuntimeContext): string {
  return buildRuntimeContextHint(runtime)
}
