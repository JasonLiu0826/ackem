import type { ChannelPlan } from '../../shared/channelPlan'
import type { ResponsePolicy } from '../../shared/response'
const COMPLETION = /(?:我|我们|已|已经|成功).{0,12}(?:写好|写完|创建|修改|改好|改完|部署|整理完|读完|入库|运行.{0,4}测试|完成.{0,6}(?:任务|操作|文件))|(?:文件|网站|项目|测试).{0,12}(?:已完成|已创建|已生成|通过|写好了)|(?:我|我们|系统).{0,8}(?:已|已经|永久|永远).{0,8}(?:记住|记下|保存)/
const SAFE_STATUS = { not_executed: '这项操作尚未执行。', queued: '任务已排队，尚未完成。', running: '任务正在处理，完成后会交付结果。', waiting_permission: '任务正在等待权限或必要信息。', succeeded: '执行结果需以对应回执为准。', failed: '这项操作执行失败。', aborted: '这项操作已停止。', unknown: '目前无法确认这项操作的结果。' }
function hasEvidence(value: unknown, domain: RegExp): boolean {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, item]) => (domain.test(key) && (typeof item === 'string' ? !!item.trim() : Array.isArray(item) ? item.length > 0 : !!item && typeof item === 'object' && Object.keys(item).length > 0)) || (typeof item === 'object' && hasEvidence(item, domain)))
}
export function guardReplyText(text: string, policy: ResponsePolicy, state: { fenced: boolean } = { fenced: false }): string {
  const clean = text.replace(/\[SPLIT\]/gi, '\n\n')
  // Code, quotations and hypothetical instructions are not action receipts.
  return clean.split(/(?<=[。！？!?\n])/).map(sentence => {
    if (/^\s*```/.test(sentence)) { state.fenced = !state.fenced; return sentence }
    if (state.fenced) return sentence
    const criterion = !/(?:我|我们|本轮|此次|这次).{0,8}(?:已|已经|成功)/.test(sentence) && /需要|必须|应当|应该|标准|条件|是否|能否|验收|检查|核对|验证/.test(sentence)
    if (!COMPLETION.test(sentence) || criterion || /如果|假设|例如|比如|执行后|完成后|可以|如何|怎么|尚未|没有|未完成|无法|不能|不要|不得/.test(sentence) || /^\s*>/.test(sentence)) return sentence
    if (policy.status === 'succeeded' && policy.receipt && policy.runId) {
      const fileClaim = /写好|写完|创建.{0,6}(?:文件|网站)|修改|改好|改完|文件.{0,10}(?:创建|生成)/.test(sentence)
      const testClaim = /测试/.test(sentence)
      const deployClaim = /部署/.test(sentence)
      const memoryClaim = /记住|记下|永久|永远/.test(sentence)
      if ((!fileClaim || hasEvidence(policy.receipt, /path|file|backup|文件|备份|写入/i)) && (!testClaim || hasEvidence(policy.receipt, /test|verification|测试/i)) && (!deployClaim || hasEvidence(policy.receipt, /deploy|部署/i)) && (!memoryClaim || hasEvidence(policy.receipt, /memory|fact|记忆/i))) return sentence
    }
    return SAFE_STATUS[policy.status] + (sentence.endsWith('\n') ? '\n' : '')
  }).join('')
}
/** Compatibility callers cannot assert completion from a boolean. */
export function outputGuard(text: string, plan: ChannelPlan, _executed: boolean, policy?: ResponsePolicy): string {
  return guardReplyText(text, policy ?? { origin: 'answer', style: 'assistant', status: 'not_executed', plan })
}
