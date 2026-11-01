// [qq] — 出站文本清洗
//
// 来源：大肥鱼配置包里的 dafeiyu_clean 插件（原作者的实测结论）——
// DeepSeek 系列模型偶尔会把内部标签当成正文吐出来，最典型的是
//   <system_reminder>…</system_reminder>、DSML 工具调用标签、<|special_token|>
// 这些一旦发到 QQ 上，"机器人感"立刻暴露。发出的内容必须在最后一刻清洗。

/** 成对出现的内部块：整段连内容一起删 */
const BLOCK_TAGS = [
  'system_reminder',
  'system',
  'internal',
  'thinking',
  'analysis',
  'reasoning',
  'tool_call',
  'tool_result',
  'function_call',
  'function_result',
  'ds_safety',
  'memory_context',
  'reminder'
]

const BLOCK_RE = new RegExp(
  `<(${BLOCK_TAGS.join('|')})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
  'gi'
)

/** 没有被闭合的同类标签碎片（模型被截断时会留下半截） */
const ORPHAN_TAG_RE = new RegExp(`<\\/?(${BLOCK_TAGS.join('|')})\\b[^>]*>`, 'gi')

/** OpenAI/DeepSeek 风格的特殊 token：<|im_start|>、<|endoftext|> 等 */
const SPECIAL_TOKEN_RE = /<\|[^|\n]{0,40}\|>/g

/** DSML：全角竖线包起来的标签，如 <｜｜｜DSML｜｜｜tool_calls> */
const DSML_TOKEN_RE = /<\uff5c[^\n]{0,80}?\uff5c[^>\n]*>/g

/** 行内残留的反引号代码围栏标记（QQ 不渲染 markdown） */
const FENCE_RE = /^```[a-zA-Z0-9_-]*\s*$/gm

/** 连续空行压成一行 */
const MULTI_BLANK_RE = /\n{3,}/g

/**
 * 清洗一段即将发出的文本。
 * 顺序有讲究：先删大块（会连带内容），再删碎片 token，最后收拾空白。
 */
export function sanitizeOutboundText(raw: string): string {
  if (!raw) return ''

  let text = raw

  text = text.replace(BLOCK_RE, '')
  text = text.replace(ORPHAN_TAG_RE, '')
  text = text.replace(SPECIAL_TOKEN_RE, '')
  text = text.replace(DSML_TOKEN_RE, '')
  text = text.replace(FENCE_RE, '')
  text = text.replace(MULTI_BLANK_RE, '\n\n')

  return text.trim()
}

/**
 * 判断一条气泡清洗后是否还有可发的内容。
 * 纯空白、纯标点残留（如只剩「…」以外的孤立符号）视为空。
 */
export function hasSendableContent(text: string): boolean {
  const stripped = text.replace(/[\s\u200b-\u200d\ufe0f]+/g, '')
  return stripped.length > 0
}

// ── 称呼密度守卫 ────────────────────────────────────────────────
// 实测语料：她 773 条消息里只有 80 条带称呼（10.3%），平均十条一次。
// 模型对"频率"这种指令不敏感，容易每句都叫，所以在发出前按硬规则削一次。

/** 会被当作"称呼"的片段（长的放前面，避免 baby 先命中把 babyyy 拆坏） */
const PET_NAME_TOKENS = [
  'good boy',
  // 注意顺序：更长的写法必须排在其词根前面，否则 'daddy' 会先把 'daddyy' 截断
  'daddyy',
  'daddy',
  'baby',
  'mommy',
  '老公',
  '哥哥',
  '宝宝',
  '宝贝',
  '亲爱的'
]

function buildPetNameRe(extraTokens: string[]): RegExp {
  return new RegExp([...PET_NAME_TOKENS, ...extraTokens].join('|'), 'gi')
}

/** 删除一个称呼片段时，连带吃掉的紧邻标点/空格 */
const ADJACENT_PUNCT = /[\s,，、~～！!？?]/

/**
 * 一轮回复里最多保留 max 个称呼，超出部分删掉（连带紧邻标点）。
 * 保护规则：删完会让整条气泡变空的，视为"独立称呼条"（真实语料里合法），跳过不删。
 */
export function capNicknameDensity(bodies: string[], max = 1, extraTokens: string[] = []): string[] {
  const out = [...bodies]
  let kept = 0
  const petNameRe = buildPetNameRe(extraTokens)

  for (let i = 0; i < out.length; i++) {
    let body = out[i]
    // 同一气泡内也一个个过；从后往前删避免索引错位
    for (;;) {
      const hits = [...body.matchAll(petNameRe)]
      // 找到第一个"可以删"的（超出保留额度、且删完不为空）
      let target = -1
      for (let h = hits.length - 1; h >= 0; h--) {
        const isBeyond = kept + 1 > max || h > 0
        if (!isBeyond) continue
        let s = hits[h].index ?? 0
        let e = s + hits[h][0].length
        while (s > 0 && ADJACENT_PUNCT.test(body[s - 1])) s--
        while (e < body.length && ADJACENT_PUNCT.test(body[e])) e++
        // 允许削成空：整条只有称呼时该条会被丢弃，否则称呼三连会全部逃过限额
        target = h
        body = (body.slice(0, s) + body.slice(e)).trim()
        break
      }
      if (target < 0) break
    }
    // 统计这条里最终还剩几个称呼，决定它是否消耗额度
    const remaining = [...body.matchAll(petNameRe)].length
    kept += remaining
    out[i] = body
  }

  // 削空的条目直接去掉，调用方拿到的是干净气泡列表
  return out.filter((b) => b.trim().length > 0)
}

// ── emoji 密度守卫 ──────────────────────────────────────────────
// 语音指南只是"建议"，模型经常照旧每句甩表情。发出去之前按硬规则削一次。

const EMOJI_RE =
  /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2764}]/gu

/** 整轮最多留 max 个 emoji，多的删掉（含叠写的变体选择符） */
export function capEmojiDensity(bodies: string[], max = 1): string[] {
  let kept = 0
  const out: string[] = []

  for (const body of bodies) {
    if (max === 0) {
      const stripped = body.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim()
      if (stripped.length > 0) out.push(stripped)
      continue
    }
    let result = ''
    let lastIndex = 0
    for (const m of body.matchAll(EMOJI_RE)) {
      const idx = m.index ?? 0
      result += body.slice(lastIndex, idx)
      lastIndex = idx + m[0].length
      if (kept < max) {
        result += m[0]
        kept += 1
      }
    }
    result += body.slice(lastIndex)
    const cleaned = result.replace(/\s{2,}/g, ' ').trim()
    if (cleaned.length > 0) out.push(cleaned)
  }

  return out.length > 0 ? out : bodies
}

// ── 断句守卫 ────────────────────────────────────────────────────
// 规则统一收敛到 chat/humanizeReply（桌面 / 微信 / QQ 共用一份），这里只做转发，
// 避免三端各写一套、越改越不一致。

export { insertBreathCommas, BREATH_CONNECTORS } from '../../chat/humanizeReply'

// ── 媒介自觉守卫 ────────────────────────────────────────────────
// 你们在 QQ 上打字，她不在他身边。模型偶尔会写成"同处一室"，
// 比如「我盯着你呢」「跑不掉的」。这类句子一出现就立刻出戏。

const PHYSICAL_PRESENCE_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /我(就|正)?(在|正)?(这|那)?(儿)?(看着|盯着|望着)你/, why: '声称看得见他' },
  { re: /你(跑|逃)不(掉|了)/, why: '声称能抓住他' },
  { re: /(逃|躲)不出我/, why: '声称能抓住他' },
  { re: /我在你(身|旁|后)边/, why: '声称物理在场' },
  { re: /我(掐|拍|捏|戳)你/, why: '声称发生肢体接触' },
  { re: /(闻|嗅)到你/, why: '声称能感知气味' },
  { re: /你(身上|头发|衣服).{0,6}(味道|香|好闻)/, why: '声称能感知外形' },
  { re: /我(刚才|刚刚)?(抱|摸)了你/, why: '把虚拟亲近说成既成事实' }
]

/** 返回命中的违规片段及原因；空数组表示干净 */
export function detectPhysicalPresence(text: string): Array<{ hit: string; why: string }> {
  const out: Array<{ hit: string; why: string }> = []
  for (const { re, why } of PHYSICAL_PRESENCE_PATTERNS) {
    const m = text.match(re)
    if (m) out.push({ hit: m[0], why })
  }
  return out
}
