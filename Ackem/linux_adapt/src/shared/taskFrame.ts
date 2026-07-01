/**
 * 用户任务框（Task Frame）— 主进程 / 渲染进程 / 扩展共用类型与纯规则检测。
 *
 * 层级：L0 任务理解（与 L0.5 工作意图、Extension Dispatch 正交）
 * - L0.5 回答「用哪个工具 / 扩展」（search_web、knowledge_card、write_file…）
 * - Task Frame 回答「用户要什么形态 / 是否对比 / 如何合并搜索」
 *
 * 不含任何主题实体词表；subjects 由 resolveUserTaskFrame（LLM）从用户原话抽取。
 */

/** 用户期望的信息组织目标 */
export type TaskGoal = 'casual' | 'list' | 'compare' | 'explain' | 'recommend'

/** 交付形态 */
export type TaskDeliveryFormat = 'prose' | 'markdown_table' | 'bullet_list'

export type UserTaskFrame = {
  goal: TaskGoal
  delivery: TaskDeliveryFormat
  /** 用户原话中提到的对象（城市、产品、概念等），勿在规则层写死 */
  subjects: string[]
  /** 是否建议联网检索（LLM 或规则推断） */
  needsSearch: boolean
  /** 合并后的单次搜索 query；mergeWebSearch 为 true 时 chat 层应优先使用 */
  searchQuery?: string
  /** 为 true 时，本轮多次 web_search 须合并为一次 */
  mergeWebSearch: boolean
  /** 供 synthesis / follow-up 注入的格式说明 */
  formatHint?: string
  /** 解析来源，便于调试与扩展 */
  source: 'rules' | 'llm' | 'rules+llm'
}

/** 规则层可同步得到的局部结果 */
export type TaskFrameRuleHint = {
  delivery: TaskDeliveryFormat
  goal: TaskGoal
  mergeWebSearch: boolean
  needsLlmEnrich: boolean
}

const TABLE_FORMAT_RE =
  /列个表|列个.{0,24}表|画个表|画表格|列表|表格|清单|汇总成表|做成表|对照表|对比表|差距表|排成表|制成表/u

const BULLET_FORMAT_RE =
  /列出来|罗列|分条|逐条|一条一条|条目/u

const COMPARE_GOAL_RE =
  /对比(?:一下)?|对照(?:一下)?|比较(?:一下)?|分别说说|各有什么|都有啥|都有哪些|哪个好|差距表/u

const LIST_GOAL_RE =
  /有哪些|有什么|都有什么|列举|罗列/u

const EXPLICIT_SEARCH_RE =
  /(?:帮我)?(?:搜|查)(?:一下|一搜|一查)?|联网搜|上网搜|搜索|查找/u

/**
 * 纯规则：从用户原话检测交付形态与目标（无 LLM、无实体词表）。
 */
export function detectTaskFrameRules(userMessage: string): TaskFrameRuleHint {
  const t = userMessage.trim()
  if (!t) {
    return {
      delivery: 'prose',
      goal: 'casual',
      mergeWebSearch: false,
      needsLlmEnrich: false
    }
  }

  let delivery: TaskDeliveryFormat = 'prose'
  if (TABLE_FORMAT_RE.test(t)) {
    delivery = 'markdown_table'
  } else if (BULLET_FORMAT_RE.test(t)) {
    delivery = 'bullet_list'
  } else if (COMPARE_GOAL_RE.test(t)) {
    delivery = 'markdown_table'
  }

  let goal: TaskGoal = 'casual'
  if (COMPARE_GOAL_RE.test(t)) {
    goal = 'compare'
  } else if (LIST_GOAL_RE.test(t) || delivery !== 'prose') {
    goal = 'list'
  } else if (/介绍|解释|是什么|什么意思|原理/u.test(t)) {
    goal = 'explain'
  } else if (/推荐|建议|哪个好|值得/u.test(t)) {
    goal = 'recommend'
  }

  const structured = delivery !== 'prose'
  const mergeWebSearch = goal === 'compare' || (structured && COMPARE_GOAL_RE.test(t))

  const needsLlmEnrich =
    structured ||
    goal === 'compare' ||
    goal === 'list' ||
    EXPLICIT_SEARCH_RE.test(t)

  return {
    delivery,
    goal,
    mergeWebSearch,
    needsLlmEnrich
  }
}

/** 规则层默认帧（LLM 不可用时的 fallback） */
export function taskFrameFromRules(userMessage: string): UserTaskFrame {
  const hint = detectTaskFrameRules(userMessage)
  return {
    goal: hint.goal,
    delivery: hint.delivery,
    subjects: [],
    needsSearch: EXPLICIT_SEARCH_RE.test(userMessage.trim()),
    searchQuery: undefined,
    mergeWebSearch: hint.mergeWebSearch,
    formatHint: buildFormatHintFromDelivery(hint.delivery, hint.goal),
    source: 'rules'
  }
}

export function buildFormatHintFromDelivery(
  delivery: TaskDeliveryFormat,
  goal: TaskGoal
): string | undefined {
  if (delivery === 'markdown_table') {
    if (goal === 'compare') {
      return '用户要求对比表：正文必须是 Markdown 表格，按对象分列或分栏，每行一条要点，禁止改写成散文段落。'
    }
    return '用户要求表格：正文必须是 Markdown 表格（含表头与多行数据），禁止仅用散文叙述。'
  }
  if (delivery === 'bullet_list') {
    return '用户要求列表：正文用 Markdown 无序列表（- 开头），每条一行，禁止整段散文。'
  }
  return undefined
}

/** 是否结构化交付（表格 / 列表） */
export function isStructuredDelivery(frame: UserTaskFrame | undefined): boolean {
  return frame != null && frame.delivery !== 'prose'
}
