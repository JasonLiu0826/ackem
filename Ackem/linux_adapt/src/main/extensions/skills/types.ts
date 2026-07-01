// [extensions/skills/types] — 技能专区类型定义
//
// 技能 (Skill) 是 Ackem 的"能干活"单元。不同于核心引擎的 Pre-LLM 管线（负责情绪/关系/记忆），
// Skill 负责具体的任务执行：搜索、文件整理、日程提醒、信息查询等。
//
// Skill 与核心引擎的关系：
//   - Skill 通过 coordinator 注入工具描述到 LLM context
//   - LLM 决定是否调用 Skill（function calling）
//   - Skill 执行结果通过 ExtensionEvent 回传给引擎
//   - Skill 绝不能直接读写 memory/、companion/ 等引擎目录
//   - Skill 的副作用（如写文件）限制在 staging/ 和 skills/<id>/ 内
//
// Skill 类型：
//   - rule       : 纯规则匹配，无需 LLM（如"帮我记一下"→写 memory）
//   - tool       : LLM function calling 触发（如 web_search, file_read）
//   - proactive  : 引擎主动触发（如定时提醒、久坐检测）
//   - workflow   : 多步骤编排（如"整理下载文件夹"→扫描→分类→报告）

import type {
  ExtensionManifestBase,
  ExtensionLifecycleHooks,
  EngineSnapshot,
  ExtensionEvent,
  RuntimeContext
} from '../protocols'

// ═══════════════════════════════════════════════════════════════
// Skill 类型
// ═══════════════════════════════════════════════════════════════

export type SkillType = 'rule' | 'tool' | 'proactive' | 'workflow'

export type SkillTrigger =
  | 'manual'              // 用户明确调用
  | 'keyword'             // 关键词匹配
  | 'llm_function_call'   // LLM function calling
  | 'scheduled'           // 定时触发
  | 'engine_event'        // 引擎事件触发（如情绪突变、信任下降）
  | 'game_event'          // 游戏事件触发
  | 'system_event'        // 系统事件触发（如前台切换、空闲超时）

// ═══════════════════════════════════════════════════════════════

export interface SkillManifest extends ExtensionManifestBase {
  category: 'skill'
  /** Skill 类型 */
  skillType: SkillType
  /** 触发方式列表 */
  triggers: SkillTrigger[]
  /** 触发关键词（当 trigger 包含 keyword 时） */
  keywords?: string[]
  /** LLM function calling 定义（当 trigger 包含 llm_function_call 时） */
  functionDef?: SkillFunctionDef
  /** 所需权限 */
  permissions: string[]
  /** 执行超时毫秒 */
  timeoutMs: number
  /** 是否可在成人模式下使用 */
  adultModeSafe: boolean
  /** 冲突 Skill ID 列表（不能与这些 Skill 同时执行） */
  conflicts?: string[]
}

// ═══════════════════════════════════════════════════════════════
// Function Calling 定义 — 用于 LLM tool use
// ═══════════════════════════════════════════════════════════════

export interface SkillFunctionDef {
  /** 函数名（LLM 看到的工具名） */
  name: string
  /** 一句话描述（LLM 判断何时调用） */
  description: string
  /** JSON Schema 参数定义 */
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
    }>
    required: string[]
  }
}

// ═══════════════════════════════════════════════════════════════
// Skill 执行
// ═══════════════════════════════════════════════════════════════

export interface SkillInvocation {
  /** 调用唯一 ID */
  invocationId: string
  /** Skill manifest id */
  skillId: string
  /** 触发方式 */
  trigger: SkillTrigger
  /** 触发来源详情 */
  triggerDetail: string
  /** LLM 传入的参数（仅 llm_function_call） */
  args?: Record<string, unknown>
  /** 用户消息上下文 */
  userMessage?: string
  /** 引擎快照（只读） */
  snapshot: EngineSnapshot
  /** 运行时上下文（用户活跃、时段、陪伴在场） */
  runtime?: RuntimeContext
}

export interface SkillResult {
  /** 是否成功 */
  ok: boolean
  /** 返回给 LLM 的结果文本 */
  output: string
  /** 结构化数据（可选） */
  data?: unknown
  /** 错误信息 */
  error?: string
  /** 是否应将结果注入对话上下文 */
  injectToContext: boolean
  /** 是否产生引擎副作用事件 */
  events: ExtensionEvent[]
  /** 执行耗时毫秒 */
  durationMs: number
}

// ═══════════════════════════════════════════════════════════════
// Skill 实例
// ═══════════════════════════════════════════════════════════════

export type SkillStatus = 'planned' | 'installed' | 'active' | 'disabled' | 'error'

export interface SkillInstance {
  manifest: SkillManifest
  status: SkillStatus
  installedAt: string
  lastError?: string
  /** 执行计数 */
  executionCount: number
  /** 最后执行时间 */
  lastExecutedAt?: string
  hooks: ExtensionLifecycleHooks
}

// ═══════════════════════════════════════════════════════════════
// Skill 开发接口 — 开发者实现此接口来创建 Skill
// ═══════════════════════════════════════════════════════════════

export interface SkillHandler {
  /** Skill 清单 */
  readonly manifest: SkillManifest

  /** 执行技能 */
  execute(invocation: SkillInvocation): Promise<SkillResult>

  /** 判断是否应为此用户消息触发（rule 类 Skill 的核心方法） */
  shouldTrigger?(userMessage: string, snapshot: EngineSnapshot): boolean

  /** 主动触发检查（proactive 类 Skill 的核心方法） */
  shouldActivate?(snapshot: EngineSnapshot): Promise<boolean>

  /** 获取主动触发的调用参数 */
  getProactiveInvocation?(snapshot: EngineSnapshot): Promise<SkillInvocation>
}
