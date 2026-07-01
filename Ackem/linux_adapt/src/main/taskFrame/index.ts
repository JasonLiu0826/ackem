/**
 * Task Frame 模块 — L0 用户任务理解
 *
 * 扩展或其它主进程模块请从此处 import，勿耦合 knowledge-presentation。
 */

export { resolveUserTaskFrame } from './resolveUserTaskFrame'
export {
  buildTaskFrameSystemHint,
  buildCardBodyFormatBlock,
  buildCompanionReplyFormatBlock,
  buildToolFollowUpFormatBlock
} from './formatInstructions'
export { planWebSearchExecution, type WebSearchExecutionPlan } from './mergeWebSearch'
export { runWebSearchWithTaskFrame, type WebSearchTurnOutcome } from './webSearchWithTaskFrame'
export { parseUserTaskFrameFromBody } from './parseFromBody'

export type {
  UserTaskFrame,
  TaskGoal,
  TaskDeliveryFormat,
  TaskFrameRuleHint
} from '../../shared/taskFrame'
export {
  detectTaskFrameRules,
  taskFrameFromRules,
  isStructuredDelivery,
  buildFormatHintFromDelivery
} from '../../shared/taskFrame'
