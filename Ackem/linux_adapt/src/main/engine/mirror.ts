// [mirror] — P2-2 镜中记忆矛盾检测
// 在self.md内容更新时做简单规则检测
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface MirrorAssertion {
  text: string        // 原始语句
  subject: string     // 主语（我/ta/我们）
  valence: number     // -1(负面自我评价) ~ 1(正面)
  topic: string       // 话题关键词
}

export interface Contradiction {
  old: MirrorAssertion
  new: MirrorAssertion
  topic: string
  description: string
}

/** 抽取简单断言：每行一个 "我...""ta...""我们..." */
function extractAssertions(text: string): MirrorAssertion[] {
  const out: MirrorAssertion[] = []
  const lines = text.split(/[。！？\n]/)
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.length < 4) continue
    const hasSelf = /我/.test(t)
    if (!hasSelf) continue

    const valence = estimateValence(t)
    const topic = extractTopicWord(t)
    const subject = /我们/.test(t) ? '我们' : /ta|他|她/.test(t) ? 'ta' : '我'
    out.push({ text: t, subject, valence, topic })
  }
  return out
}

function estimateValence(text: string): number {
  const pos = ['喜欢', '开心', '重要', '珍惜', '温柔', '幸运', '幸福', '美好', '懂', '理解', '陪伴', '爱']
  const neg = ['讨厌', '难过', '不好', '失败', '没用', '不配', '害怕', '担心', '孤独', '离开', '失去']
  let s = 0
  for (const w of pos) if (text.includes(w)) s += 0.4
  for (const w of neg) if (text.includes(w)) s -= 0.5
  return Math.max(-1, Math.min(1, s))
}

function extractTopicWord(text: string): string {
  const topics = ['陪伴', '聊天', '理解', '帮助', '性格', '感情', '工作', '生活', '自己', '关系', '沉默', '回应', '关心', '未来']
  for (const t of topics) if (text.includes(t)) return t
  return '自我'
}

/** 检测新旧断言间的矛盾 */
export async function detectContradictions(
  oldText: string,
  newText: string,
  /** Embedding 提供者（可选，用于语义话题匹配） */
  embedText?: (text: string) => Promise<number[]>
): Promise<Contradiction[]> {
  const oldAs = extractAssertions(oldText)
  const newAs = extractAssertions(newText)
  const out: Contradiction[] = []

  // 预计算所有断言的 Embedding（一次性批量）
  const allTexts = [...oldAs.map(a => a.topic), ...newAs.map(a => a.topic)]
  const topicEmbedMap = new Map<string, number[]>()

  // 先用精确匹配（快速路径）
  for (const na of newAs) {
    for (const oa of oldAs) {
      if (oa.topic !== na.topic) continue
      if (Math.abs(oa.valence - na.valence) >= 0.6) {
        out.push({
          old: oa, new: na, topic: na.topic,
          description: `关于「${na.topic}」，之前觉得「${oa.text.slice(0, 30)}…」但现在认为「${na.text.slice(0, 30)}…」`
        })
      }
    }
  }

  // Embedding 语义匹配：精确没匹配到的，用语义补漏
  if (out.length === 0 && embedText) {
    // 收集还没匹配到的新旧话题对
    for (const na of newAs) {
      for (const oa of oldAs) {
        if (oa.topic === na.topic) continue // 精确匹配已处理
        try {
          if (!topicEmbedMap.has(oa.topic)) {
            topicEmbedMap.set(oa.topic, await embedText(oa.topic))
          }
          if (!topicEmbedMap.has(na.topic)) {
            topicEmbedMap.set(na.topic, await embedText(na.topic))
          }
          const oaEmb = topicEmbedMap.get(oa.topic)!
          const naEmb = topicEmbedMap.get(na.topic)!
          const { cosineSimilarity } = await import('../memory/factEmbeddingCache')
          if (cosineSimilarity(oaEmb, naEmb) > 0.70 && Math.abs(oa.valence - na.valence) >= 0.6) {
            out.push({
              old: oa, new: na, topic: `${oa.topic}→${na.topic}`,
              description: `关于「${oa.topic}/${na.topic}」，之前觉得「${oa.text.slice(0, 30)}…」但现在认为「${na.text.slice(0, 30)}…」`
            })
          }
        } catch { /* 降级 */ }
      }
    }
  }

  return out
}

/** 读取self.md */
export function readSelfMd(dataRoot: string): string {
  const p = join(dataRoot, 'companion', 'self.md')
  if (!existsSync(p)) return ''
  return readFileSync(p, 'utf-8')
}
