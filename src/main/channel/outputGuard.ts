import type { ChannelPlan } from '../../shared/channelPlan'

const FORBIDDEN = [
  /已经改好/,
  /已经改完/,
  /已经入库/,
  /已经部署/,
  /已经开始计时/,
  /已经读完/,
  /已经整理完/
]

export function outputGuard(text: string, plan: ChannelPlan, executed: boolean): string {
  if (executed && !plan.pendingConfirm) return text
  let out = text
  for (const re of FORBIDDEN) {
    if (re.test(out)) {
      out = `${out}\n\n（本轮尚未完成该项操作，上面若写了已完成请以本轮事实为准。）`
      break
    }
  }
  return out
}
