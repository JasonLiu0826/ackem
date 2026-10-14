import type { DispatchCatalogEntry, DispatchConfig } from '../protocols'
import { isCoreExtension } from '../../../shared/coreExtensions'
import type { AppSettings } from '../../settings'

const MIN_LEN = 4

/** 用户在问「Ackem 能做什么 / 有什么功能」，而非请求具体能力或情感话题 */
const LISTING_PATTERNS: RegExp[] = [
  /(?:你|Ackem|这边|系统).{0,12}(?:会|能|可以|都).{0,8}(?:干|做|帮).{0,8}(?:什么|啥)/u,
  /(?:你|Ackem).{0,8}(?:会|能|都).{0,6}(?:些什么|啥|什么)(?:功能|能力)?/u,
  /(?:有|都有|都有哪些).{0,4}(?:什么|啥)(?:功能|能力|本事|特长)/u,
  /(?:哪些|什么).{0,8}(?:扩展|插件|[Ss]kill|技能)/u,
  /介绍.{0,10}(?:一下.{0,6})?(?:功能|能力|扩展)/u,
  /能干(?:些什么|啥|什么)/u,
  /(?:功能|能力|扩展).{0,6}((?:都)?有(?:哪些|什么|啥)|清单|列表)/u
]

/** 情感/关系/假设类问句，勿当作能力清单 */
const LISTING_EXCLUDE: RegExp[] = [
  /(?:爱|喜欢|想我|生气|难过|伤心|离开|还会在|陪(?:我|你)|在吗|还在吗|是谁|叫什么)/u,
  /(?:会不会|能不能).{0,12}(?:骗|伤|抛弃|不理)/u
]

const MODE_LABEL: Record<DispatchConfig['mode'], string> = {
  dispatched: '对话触发',
  autonomous: '后台自动',
  always_on: '常驻',
  manual: '手动',
  engine_event: '引擎事件',
  scheduled: '定时'
}

const STATUS_LABEL: Record<DispatchCatalogEntry['status'], string> = {
  active: '已启用',
  installed: '已安装未启用',
  planned: '规划中',
  disabled: '已停用',
  error: '异常',
  deprecated: '已弃用'
}

export type ExtensionCatalogListingOptions = {
  maxChars?: number
  /** 兼容旧调用者；现行能力清单不注入已退役模式。 */
  desktopAgentSection?: string
  settings?: Partial<AppSettings>
}

export function isExtensionCapabilityListingQuery(message: string): boolean {
  const trimmed = message.trim()
  if (trimmed.length < MIN_LEN) return false
  if (LISTING_EXCLUDE.some((re) => re.test(trimmed))) return false
  return LISTING_PATTERNS.some((re) => re.test(trimmed))
}

function isUsableNow(entry: DispatchCatalogEntry): boolean {
  return entry.status === 'active'
}

function unusableReason(entry: DispatchCatalogEntry): string {
  switch (entry.status) {
    case 'disabled':
      return '扩展中心已关闭，需重新启用'
    case 'planned':
      return '规划中，尚未接入'
    case 'error':
      return '加载异常，请到扩展中心检查'
    case 'installed':
      return '已安装但未启用'
    default:
      return '当前不可用'
  }
}

function triggerHint(entry: DispatchCatalogEntry): string {
  const parts: string[] = []
  if (entry.dispatch.scenarios.length > 0) {
    parts.push(`场景：${entry.dispatch.scenarios.slice(0, 3).join('；')}`)
  }
  if (entry.dispatch.keywords.length > 0) {
    parts.push(`可说：${entry.dispatch.keywords.slice(0, 4).join('、')}`)
  }
  if (entry.dispatch.slash?.length) {
    parts.push(`指令：${entry.dispatch.slash.slice(0, 3).join('、')}`)
  }
  const mode = MODE_LABEL[entry.dispatch.mode] ?? entry.dispatch.mode
  if (entry.dispatch.mode === 'manual') {
    parts.push('触发：需在扩展中心或指令手动启动')
  } else if (entry.dispatch.mode === 'autonomous') {
    parts.push('触发：后台自动，无需每轮对话')
  } else {
    parts.push(`触发：${mode}`)
  }
  return parts.filter(Boolean).join('；')
}

function formatUsableEntryLine(entry: DispatchCatalogEntry): string {
  const core = isCoreExtension(entry.id) ? ' · 基础能力' : ''
  const summary = entry.dispatch.summary.trim()
  return `- 【可用】${entry.name}（${entry.category}${core}）：${summary}。${triggerHint(entry)}`
}

function formatUnavailableEntryLine(entry: DispatchCatalogEntry): string {
  const status = STATUS_LABEL[entry.status] ?? entry.status
  const summary = entry.dispatch.summary.trim()
  return `- 【不可用】${entry.name}（${entry.category} · ${status}）：${summary}。原因：${unusableReason(entry)}`
}

/** 平台级功能（非扩展库 catalog 条目）的可用性说明 */
export function buildPlatformFeaturesSection(_settings?: Partial<AppSettings>): string {
  return [
    '【平台功能 · 现行架构】',
    '- 【可用】chat（聊天）：对话、长期记忆、性格情绪表达、解释与 Markdown 知识整理，支持用户提交图片（所选模型需支持识图）。',
    '- 【可用】记忆导入：记忆页可导入 txt / md / json。',
    '- plugin（插件）：调用下方清单中当前启用的现成能力。',
    '- 【可用】work（任务 · AckemCode）：Ackem 可自主调用、读取真实进度和工具结果、审批普通请求、验收并返工；用户随时可接管。处理指定文件、目录、项目与命令，创建或修改插件；需要按实际路由、确认、权限及运行时状态执行，不能仅凭能力介绍声称已经开始或完成。',
    '具体插件的权限范围不等于任务通道的全局权限范围。'
  ].join('\n')
}

/** 将扩展库 catalog 格式化为 LLM 上下文块（按可用/不可用分组，字符预算内截断） */
export function buildExtensionCatalogListingBlock(
  catalog: DispatchCatalogEntry[],
  options?: ExtensionCatalogListingOptions
): string {
  const maxChars = options?.maxChars ?? 2800
  const usable = catalog.filter(isUsableNow)
  const unavailable = catalog.filter((e) => !isUsableNow(e))

  const lines: string[] = [
    '【扩展能力清单 · 本轮自动检索】',
    '用户正在询问 Ackem 的能力/功能。基于现行架构和下列清单自然介绍，只回答用户关注的能力。',
    '硬性规则：',
    '1) 仅「【可用】」项可以说「我能帮你…」并举例触发方式；「【不可用】」「【暂未开放】」只能说明存在或原因，禁止假称能执行。',
    '2) 禁止编造未在清单中的扩展、Skill、插件或假称本轮已执行某操作。',
    '3) 不要敷衍「功能多着呢」却不举例；按用户问题概括聊天、已启用插件和 AckemCode 任务，不为了凑条目介绍未开放或退役功能。',
    ''
  ]

  lines.push(buildPlatformFeaturesSection(options?.settings), '')


  if (usable.length > 0) {
    lines.push(`扩展库 · 当前可用（${usable.length}）：`)
    for (const entry of usable) lines.push(formatUsableEntryLine(entry))
    lines.push('')
  } else {
    lines.push('扩展库 · 当前可用：暂无（可到扩展中心启用，或通过 AckemCode 任务创建）。', '')
  }

  if (unavailable.length > 0) {
    lines.push(`扩展库 · 暂不可用（${unavailable.length}）：`)
    for (const entry of unavailable.slice(0, 14)) lines.push(formatUnavailableEntryLine(entry))
    if (unavailable.length > 14) {
      lines.push(`- …另有 ${unavailable.length - 14} 项暂不可用，可到扩展中心查看`)
    }
    lines.push('')
  }

  lines.push(
    '回复建议：先一句话概括 Ackem 能做什么，再按平台功能 → 可用扩展 →（如有）暂不可用/未开放 分层说明；用户想创建新能力时说明 AckemCode 任务与确认流程，不空口承诺执行。'
  )

  let block = lines.join('\n')
  if (block.length > maxChars) {
    block = `${block.slice(0, maxChars - 20).trimEnd()}\n…（清单已截断）`
  }
  return block
}
