export function buildDreamStory(input: {
  facts: string[]
  emotionLabel: string
  mood?: string
}): string {
  const seed = input.facts[0] ?? '一扇半开的窗'
  const mood = input.mood?.trim() || input.emotionLabel || '安静'
  const extra = input.facts[1] ? `你隐约还记得「${input.facts[1]}」。` : ''
  return (
    `【梦境片段 · ${mood}】\n` +
    `夜色里，${seed} 化作一条发光的走廊。` +
    `${extra}` +
    `你在走廊尽头听见自己的呼吸，醒来时只剩一句温柔余韵。` +
    `\n\n（创意向生成，非预测或占卜。）`
  )
}
