// [prompt/tool-followup] — 工具调用跟进 prompt（v1.1 设计文档）
// 迁移自 toolFollowUp.ts

export const TOOL_LABEL: Record<string, string> = {
  web_search: '网页搜索',
  read_file: '文件读取',
}

/** 工具跟进的人格化 fallback */
export function buildToolResultsFallback(personalityId: string): string {
  const fallbacks: Record<string, string> = {
    tsundere: '哼……查是查到了，但我一时不知道怎么说。你自己看上面吧。',
    kuudere: '……查到了。看上面。',
    deredere: '我帮你查了，但一时组织不好语言。你先看看上面的内容，有疑问再问我。',
    yandere: '我查到了……但我现在不想说。你自己看。',
    genki: '诶~查到了但我说不太好！你先看看上面的！',
  }
  return fallbacks[personalityId] ?? '我帮你查了，详情在上面。'
}

/** 空结果人格化 fallback */
export function buildEmptyResultFallback(personalityId: string): string {
  const fallbacks: Record<string, string> = {
    tsundere: '这破网站什么都没写，别问我了。',
    kuudere: '没找到。换个说法试试。',
    deredere: '我帮你查了，但没找到有用的。要不换个关键词？',
    yandere: '查不到……是不是有人把信息藏起来了？',
    genki: '诶~没找到！换个说法试试吧！',
  }
  return fallbacks[personalityId] ?? '没找到相关信息。'
}

/** 工具跟进 user prompt block */
export function buildToolFollowUpBlock(
  toolResults: Array<{ name: string; content: string }>,
): string {
  const blocks = toolResults
    .filter((tr) => tr.name !== 'append_memory')
    .map((tr) => {
      const label = TOOL_LABEL[tr.name] ?? tr.name
      return `【${label}结果】\n${tr.content}`
    })
    .join('\n\n')

  if (!blocks) return ''

  return (
    `${blocks}\n\n` +
    '【任务】请直接回答用户上一句的问题。\n' +
    '- 以搜索结果为主，若摘要偏泛可结合常识简要补充，但仍要给出实质内容；\n' +
    '- 禁止说「要不要再搜」「换个关键词」「你主要关注哪一块」等推脱话；\n' +
    '- 不要复述本段说明。'
  )
}
