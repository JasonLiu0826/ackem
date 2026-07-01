// [triggerExtractor] — 触发词自动提取
// 职责：从事实 subject + summary 中提取触发词
// 工具：Intl.Segmenter（Node 18+ 内置，零依赖）
// 引用：无独立依赖

const STOPWORDS = new Set([
  '的', '了', '是', '在', '我', '你', '他', '她', '它',
  '这', '那', '很', '都', '也', '就', '还', '要', '会',
  '有', '不', '没', '和', '与', '或', '但', '而', '所',
  '被', '把', '让', '从', '到', '对', '向', '给', '跟',
  '为', '以', '因为', '所以', '如果', '虽然', '但是',
  '上', '下', '中', '里', '外', '前', '后', '左', '右',
  '一个', '什么', '怎么', '哪里', '为什么', '怎么样',
  '可以', '可能', '应该', '能够', '已经', '开始', '继续',
])

export function extractTriggers(subject: string, summary: string): string[] {
  const text = `${subject} ${summary}`
  try {
    const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
    const segments = [...segmenter.segment(text)]
    const words = segments
      .filter(s => s.isWordLike)
      .map(s => s.segment)
      .filter(w => w.length >= 2 && !STOPWORDS.has(w))
    // 去重，取前 5 个
    return [...new Set(words)].slice(0, 5)
  } catch {
    // Intl.Segmenter 不可用时的回退
    return text.split(/[\s,，。！？、；：""''（）【】《》 ]+/u)
      .filter(w => w.length >= 2 && !STOPWORDS.has(w))
      .slice(0, 5)
  }
}
