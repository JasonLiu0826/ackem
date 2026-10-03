export type RecallIntentKind =
  | 'task_progress'
  | 'plugin_result'
  | 'user_preference'
  | 'episode_time'
  | 'explicit_recall'
  | 'general'

/** Rule-based intent tags (not answer lookup). */
export function detectRecallIntents(text: string): RecallIntentKind[] {
  const t = text.trim()
  const intents = new Set<RecallIntentKind>()
  if (/进度|进行|跑到哪|做完|完成了吗|任务|工单|工人|AckemCode|运行态|状态/.test(t)) {
    intents.add('task_progress')
  }
  if (/插件|扩展|口袋|上次.*(查|调用|跑)|天气插件|ext\./.test(t)) {
    intents.add('plugin_result')
  }
  if (/喜欢|偏好|习惯|住在|住址|地址|在哪|讨厌|不喝|爱喝|常去/.test(t)) {
    intents.add('user_preference')
  }
  if (/你还记得|再确认|直接告诉我|明确说|是不是还记得|别绕弯/.test(t)) {
    intents.add('explicit_recall')
  }
  if (/记得|什么时候|经历|那天|之前|上周|回忆|发生过/.test(t)) {
    intents.add('episode_time')
  }
  if (intents.size === 0) intents.add('general')
  return [...intents]
}
