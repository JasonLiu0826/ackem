/** Kairos 已更名为 Ackem：注入 LLM 的文本统一替换旧品牌名 */
export function normalizeAckemBrandText(text: string): string {
  return text.replace(/Kairos/g, 'Ackem').replace(/kairos/g, 'ackem')
}
