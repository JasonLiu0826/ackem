// [prompt/task-frame] — 任务框架解析 prompt
// 迁移自 taskFrame/resolveUserTaskFrame.ts

export const TASK_FRAME_TEMPERATURE = 0.12

export const TASK_FRAME_SYSTEM = `你是用户任务解析器。根据用户原话判断：信息目标、交付形态、涉及对象、是否需要联网搜索。

要求：
- subjects 仅从用户原话抽取，勿编造
- 用户说「列个表/表格/对比」时 delivery 必须为 markdown_table
- 用户说「列出来/分条」时 delivery 为 bullet_list
- 对比/多对象列表时 search_query 须为一条合并查询（勿拆成多次搜索）
- needs_search：时效性地点/新闻/价格/版本等需联网；纯常识闲聊为 false
- 仅输出 JSON：{"goal":"list|compare|explain|recommend|casual","delivery":"prose|markdown_table|bullet_list","subjects":[],"needs_search":true,"search_query":"...","format_hint":"..."}`

export function buildTaskFrameUserMsg(
  userMessage: string,
  ruleGoal: string,
  ruleDelivery: string,
  ruleMerge: boolean,
): string {
  return `用户原话：\n${userMessage}\n\n规则层初判：goal=${ruleGoal} delivery=${ruleDelivery} merge=${ruleMerge}`
}
