// [paperCard/ackemProductIdentity] — 纸面卡/检索：Ackem 产品身份，不暴露底层模型

/** 用户是否在拿「你/Ackem」与其他产品对比或问自身能力 */
export function userRefersToAckemSelf(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/你都有啥|你有什么功能|你是啥|你叫什么|Ackem/u.test(t)) return true
  if (/对比|比较|区别|差别|vs/i.test(t) && /(?:你|您|Ackem|这边)/u.test(t)) return true
  if (/(?:你|Ackem).{0,16}(?:和|与|跟|还是).{0,24}(?:Codex|Cursor|Claude|Copilot|ChatGPT)/iu.test(t)) {
    return true
  }
  return false
}

const KNOWN_COMPARE_PRODUCTS =
  /Codex|Claude\s*Code|Cursor|Copilot|ChatGPT|Windsurf|Cline|Devin|Gemini\s*Code/gi

export function extractCompareTargetProducts(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(KNOWN_COMPARE_PRODUCTS)) {
    const v = m[0].trim()
    if (v) found.add(v.replace(/\s+/g, ' '))
  }
  return [...found]
}

export const ACKEM_PRODUCT_IDENTITY_GUARD =
  '\n\n【身份 · 硬性 · Ackem】\n' +
  '- 你就是 **Ackem**（桌面 AI 伴侣应用），用「我 / Ackem」指代自己。\n' +
  '- **禁止**自称或暗示自己是底层大模型/API 名称（DeepSeek、GPT、Claude、Gemini、Qwen、通义等）。\n' +
  '- **不知道**用户设置里接的是哪家 API；不得把 API 提供商当成「你」。\n' +
  '- 用户问「你」的功能、或拿「你」与其他工具对比时：写 **Ackem 产品能力**（长期记忆与人格情绪、知识整理/计划书/对比表、联网搜索、微信连发、扩展 Skill、游戏模式等），不是某个基座模型的参数榜单。\n' +
  '- 检索结果若在大谈某开源/闭源模型：那是第三方信息；**不得**把该模型写成「我」或 Ackem 的代称。\n'

export function buildAckemCompareCardBlock(userQuestion: string): string {
  if (!userRefersToAckemSelf(userQuestion)) return ''
  const others = extractCompareTargetProducts(userQuestion)
  const otherHint = others.length ? `用户点名的对比方包括：${others.join('、')}。` : ''
  return (
    '\n\n【对比任务 · Ackem 必须在场】\n' +
    '用户正在拿 **Ackem（你）** 与其他产品比较。表格/正文里代表「你」的一方 **必须写 Ackem**，描述 Ackem 应用能力。\n' +
    '**禁止**用 DeepSeek / GPT / Claude 等模型名替代 Ackem。\n' +
    otherHint +
    '其他列按用户点名的产品如实填写；搜到的模型 API 资料只能描述对方或行业背景，不能当成「我」。\n'
  )
}

export function buildAckemAwareSearchQueries(
  userMessage: string,
  queries: Array<string | undefined | null>
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (q: string | undefined | null) => {
    if (typeof q !== 'string') return
    const t = q.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }

  if (userRefersToAckemSelf(userMessage)) {
    const targets = extractCompareTargetProducts(userMessage)
    const tail = targets.length ? ` vs ${targets.join(' vs ')} comparison` : ' features capabilities'
    push(`Ackem AI companion desktop app${tail}`)
    push('Ackem 伴侣 记忆 人格 功能')
  }

  for (const q of queries) push(q)
  push(userMessage.trim())

  return out
}

const WRONG_SELF_MODEL_RE =
  /DeepSeek(?:\s*\([^)]*\))?|GPT-?[\d.o]+|Claude(?:\s*\d+)?(?:\s*Code)?|Gemini(?:\s*\d+)?|Qwen|通义千问|文心一言/gi

/** 对比任务后处理：把误写成底层模型的「己方」改回 Ackem */
export function sanitizeAckemIdentityInMarkdown(body: string, userQuestion: string): string {
  if (!userRefersToAckemSelf(userQuestion) || !body.trim()) return body

  let out = body

  out = out.replace(/【对比[：:]\s*([^】\n]+)】/gu, (match, inner: string) => {
    const parts = inner.split(/\s+vs\s+/i)
    if (parts.length >= 2 && WRONG_SELF_MODEL_RE.test(parts[0])) {
      parts[0] = 'Ackem'
      return `【对比：${parts.join(' vs ')}】`
    }
    return match
  })

  out = out.replace(/^▎\s*DeepSeek[^\n]*/gim, '▎Ackem')
  out = out.replace(/^#{1,3}\s+DeepSeek[^\n]*/gim, '## Ackem')
  out = out.replace(/\|\s*DeepSeek[^|\n]*\|/gi, '| Ackem |')

  out = out.replace(
    /(▎\s*)(DeepSeek(?:\s*\([^)]*\))?)(\s*[\r\n])/gi,
    '$1Ackem$3'
  )

  return out
}
