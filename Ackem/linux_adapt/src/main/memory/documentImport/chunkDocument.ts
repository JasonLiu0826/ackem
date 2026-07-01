/** 将导入文档按 ## 标题切分为 LLM 可处理的语义块（避免单块输出过长 JSON） */

export const IMPORT_CHUNK_TARGET = 4_800
export const IMPORT_CHUNK_HARD_MAX = 5_500

export function chunkDocumentText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const chunks: string[] = []
  const sectionSplit = normalized.split(/\n(?=##\s)/)

  for (const section of sectionSplit) {
    const piece = section.trim()
    if (!piece) continue
    if (piece.length > IMPORT_CHUNK_HARD_MAX) {
      for (let i = 0; i < piece.length; i += IMPORT_CHUNK_TARGET) {
        chunks.push(piece.slice(i, i + IMPORT_CHUNK_HARD_MAX))
      }
      continue
    }
    chunks.push(piece)
  }

  if (chunks.length === 0 && normalized) return [normalized.slice(0, IMPORT_CHUNK_HARD_MAX)]
  return chunks
}
