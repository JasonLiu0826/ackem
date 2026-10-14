export type IntentJson = {
  intent: 'chat' | 'ask' | 'use' | 'create' | 'update' | 'work'
  tag: string | null
  fulfill: 'none' | 'companion' | 'work' | 'plugin_factory'
  need_code: boolean
  new_tag_hint: string
  summary: string
  params: Record<string, unknown>
  /**
   * Route v2 §8.1 residual contract extensions (阶段 0 freeze). All optional:
   * legacy answers without them parse unchanged. confidence/candidate_hint are
   * suggestions only — normalizeChannel remains the channel authority.
   */
  confidence?: number
  ambiguous_with?: string | null
  clarify_question?: string
  candidate_hint?: string
}

const INTENTS = new Set(['chat', 'ask', 'use', 'create', 'update', 'work'])
const FULFILLS = new Set(['none', 'companion', 'work', 'plugin_factory'])
const SLOT_KEYS = new Set([
  'cwd',
  'durationMin',
  'duration',
  'schedule',
  'delivery',
  'feature',
  'topic',
  'query',
  'inspectionScope'
])

function pickWhitelistedSlots(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!SLOT_KEYS.has(k) || v == null || typeof v === 'object') continue
    out[k] = v
  }
  return out
}

export function parseIntentJson(raw: string): IntentJson | null {
  const text = raw.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const o = parsed as Record<string, unknown>
  if (!INTENTS.has(String(o.intent))) return null
  if (!FULFILLS.has(String(o.fulfill))) return null
  const needCode =
    typeof o.need_code === 'boolean'
      ? o.need_code
      : o.need_code === 'true' || o.need_code === 1
  if (typeof needCode !== 'boolean') return null
  const newTagHint = typeof o.new_tag_hint === 'string' ? o.new_tag_hint : ''
  if (typeof o.summary !== 'string') return null
  const summary = o.summary.trim().slice(0, 20)
  const rawParams =
    o.params && typeof o.params === 'object' && !Array.isArray(o.params)
      ? (o.params as Record<string, unknown>)
      : {}
  const rawSlots =
    o.slots && typeof o.slots === 'object' && !Array.isArray(o.slots)
      ? (o.slots as Record<string, unknown>)
      : {}
  const params = pickWhitelistedSlots({ ...rawSlots, ...rawParams })
  const tag = o.tag == null ? null : String(o.tag)
  // Route v2 §8.1 optional extensions — tolerate missing/malformed gracefully.
  const confidence =
    typeof o.confidence === 'number' && Number.isFinite(o.confidence)
      ? Math.min(1, Math.max(0, o.confidence))
      : undefined
  const ambiguousWith =
    typeof o.ambiguous_with === 'string' && INTENTS.has(o.ambiguous_with)
      ? o.ambiguous_with
      : null
  const clarifyQuestion =
    typeof o.clarify_question === 'string' && o.clarify_question.trim()
      ? o.clarify_question.trim().slice(0, 60)
      : undefined
  const candidateHint =
    typeof o.candidate_hint === 'string' && o.candidate_hint.trim()
      ? o.candidate_hint.trim().slice(0, 64)
      : undefined
  return {
    intent: o.intent as IntentJson['intent'],
    tag,
    fulfill: o.fulfill as IntentJson['fulfill'],
    need_code: needCode,
    new_tag_hint: newTagHint,
    summary,
    params,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(ambiguousWith ? { ambiguous_with: ambiguousWith } : {}),
    ...(clarifyQuestion ? { clarify_question: clarifyQuestion } : {}),
    ...(candidateHint ? { candidate_hint: candidateHint } : {})
  }
}

export const CLASSIFY_SYSTEM_PROMPT = `你是 Ackem 的意图填表器，不是聊天伴侣。
只输出一个 JSON 对象，不要 markdown，不要解释。
不能执行，不能说已开始，不能说已完成，不能选择具体插件 id。

chat：闲聊、情感、一次性口头回答
ask：询问会不会、有无能力，现在不要求执行
use：现在就用一项已有的常驻能力
create：做一个以后还能再喊的插件
update：修改已有插件
work：需要读取或操作真实本机状态的任务，包括本机应用/游戏/文件/目录/系统情况的检查，以及文件编辑、终端执行、项目交付。只读调查同样是执行任务，不要求用户提到文件路径、终端、代码或创建文件。
按本轮完整语义判断，不依赖关键词表；普通问候、解释、能力询问和假设讨论不下派。请求真实本机事实时，不能用网页搜索、旧聊天或已暂停的其他任务替代新的执行。历史对话用于理解指代，其中失败/停止的任务不是对本轮请求的拒绝，也不能擅自继续历史目标。明确不执行的请求必须尊重。
用户要求调查自身实现、运行、配置或真实电脑状态时，选择 work。普通用户委托不设置 inspectionScope；该字段只用于主机主动发起的限定自我审视，不能由路由参数将用户任务锁进源码白名单。只问会不会时仍为 ask。

create 与 update 的 fulfill 填 plugin_factory。
work，或明确在改用户文件时，fulfill 填 work。
chat 与 ask 的 fulfill 填 none。
use 的 fulfill 填 companion。
若执行范围或指代确实不明确，填 chat / none，同时返回 confidence<0.75、ambiguous_with 和 clarify_question，提出必要澄清；不要把明确的执行要求因为表达口语化而降成闲聊。

字段必须齐全：
{"intent":"chat|ask|use|create|update|work","tag":"time|remind|search|note|file|weather|null 或短词","fulfill":"none|companion|work|plugin_factory","need_code":false,"new_tag_hint":"","summary":"不超过20字","params":{}}
need_code 必须是布尔。summary 不超过 20 个字。tag=new 时 new_tag_hint 写 2 到 8 个字，否则空字符串。
params 只允许 cwd、durationMin、schedule、delivery、feature、topic、query、inspectionScope。不要输出 extensionId、targetRef、planId。`
