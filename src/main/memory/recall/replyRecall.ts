/** Never fall back to ungoverned facts when governed recall is empty. */
export function mergeReplyRecall(query: string, governed: string, legacy: string): string {
  const factual = /记得|之前|上次|偏好|喜欢|住在|进度|任务|插件|再确认|别绕弯/.test(query)
  const authority = governed.trim() || '没有召回可确认的相关记忆；不要猜测或用旧对话证明执行结果。'
  return `【可信记忆与执行证据】\n${authority}${factual ? '' : `\n\n【补充情境；与可信记忆冲突时忽略】\n${legacy}`}`
}
