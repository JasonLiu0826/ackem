/** Kairos 已更名为 Britney：注入 LLM 的文本统一替换旧品牌名 */
export function normalizeBritneyBrandText(text: string): string {
  return text.replace(/Kairos/g, 'Britney').replace(/kairos/g, 'britney')
}
