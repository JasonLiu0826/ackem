import type { RawLlmPlan } from './normalizePlan'

/** 去掉 markdown 代码块包裹 */
function stripCodeFence(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
}

/** 常见 LLM JSON 瑕疵修复 */
function repairJsonText(text: string): string {
  let s = stripCodeFence(text.trim())
  s = s.replace(/[\u201c\u201d]/g, '"')
  s = s.replace(/[\u2018\u2019]/g, "'")
  s = s.replace(/,\s*([}\]])/g, '$1')
  s = s.replace(/\b(\w+)\s*:/g, '"$1":')
  return s
}

export function extractJsonObject(text: string): RawLlmPlan | null {
  const t = stripCodeFence(text.trim())
  if (!t) return null

  const attempts = [t, repairJsonText(t)]
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) {
    attempts.push(t.slice(start, end + 1), repairJsonText(t.slice(start, end + 1)))
  }

  for (const candidate of attempts) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate) as RawLlmPlan
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      /* next */
    }
  }
  return null
}

export function buildJsonRepairUserMessage(invalidOutput: string): string {
  return [
    '上一次输出不是合法 JSON。请只输出一个 JSON 对象，不要 markdown，不要解释。',
    '必须包含 goalSummary (string) 和 steps (array)。',
    '错误输出如下：',
    invalidOutput.slice(0, 2000)
  ].join('\n')
}
