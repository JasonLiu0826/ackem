/** Kairos 宸叉洿鍚嶄负 Ackem锛氭敞鍏?LLM 鐨勬枃鏈粺涓€鏇挎崲鏃у搧鐗屽悕 */
export function normalizeAckemBrandText(text: string): string {
  return text.replace(/Kairos/g, 'Ackem').replace(/kairos/g, 'Ackem')
}
