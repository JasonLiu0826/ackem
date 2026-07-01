export function buildFunProfile(facts: string[], trust: number, tone?: string): string {
  const usePlayful = tone === '调侃' || (tone !== '宠溺' && trust < 55)
  const label = usePlayful ? '调侃风' : '宠溺风'
  if (!facts.length) {
    return `【趣味档案 · ${label}】\n还不够了解你——多聊几句、多记一点事，再来写小传吧。`
  }
  const bullets = facts.slice(0, 6).map((f, i) => `${i + 1}. ${f.trim()}`)
  const closer = usePlayful
    ? '（以上纯属娱乐向拼凑，别当真～）'
    : '（记下的都是你愿意分享的小片段。）'
  return `【趣味档案 · ${label}】\n${bullets.join('\n')}\n\n${closer}`
}
