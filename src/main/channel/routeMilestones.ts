/**
 * Route v2 阶段 3-4 — 思考中里程碑 (设计 §17.2).
 *
 * Each routing layer boundary emits ONE status line derived from the REAL
 * layer event (RouteTrace mark). 总红线: 屏幕上的每句话必须对应账本里的一条
 * RouteTrace 事件——绝不伪造进度。渲染层显示规格 (灰度/单行/展开≤4行/完成
 * 收起) 由前端实现, 这里只负责产出真实文案序列。
 */

export type RouteStage =
  | 'understood'
  | 'catalog'
  | 'checking'
  | 'confirming'
  | 'decided_chat'
  | 'decided_plugin'
  | 'decided_work'

const STAGE_TEXT: Record<RouteStage, string> = {
  understood: '听懂了你的意思',
  catalog: '在对照你的能力清单…',
  checking: '在核对行动规则…',
  confirming: '这句话有点含糊，我在确认意图…',
  decided_chat: '这轮陪你聊',
  decided_plugin: '找到了能用的能力',
  decided_work: '这需要动你的磁盘，先和你确认'
}

export function stageText(stage: RouteStage): string {
  return STAGE_TEXT[stage]
}

/**
 * Milestone sink passed by ipc/chat.ts: each call maps to one RouteTrace
 * layer event already recorded. 频控由调用方保证 (层边界天然低频)。
 */
export type MilestoneSink = (stage: RouteStage) => void

export function createMilestoneEmitter(sink: MilestoneSink) {
  return {
    understood: () => sink('understood'),
    catalog: () => sink('catalog'),
    checking: () => sink('checking'),
    confirming: () => sink('confirming'),
    decided: (channel: 'chat' | 'plugin' | 'work') =>
      sink(channel === 'chat' ? 'decided_chat' : channel === 'plugin' ? 'decided_plugin' : 'decided_work')
  }
}

export type RouteMilestones = ReturnType<typeof createMilestoneEmitter>
