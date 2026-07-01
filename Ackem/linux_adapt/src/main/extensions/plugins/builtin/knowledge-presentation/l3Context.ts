// [knowledge-presentation/l3Context] — 从 assembleMessages 的 system 中提取 L3 表达上下文

/** 从 marker 起截取到下一个「\n\n【」大节（不含 marker 之后的第一个并列块） */
export function extractSectionFromMarker(system: string, marker: string): string {
  const start = system.indexOf(marker)
  if (start < 0) return ''
  const chunk = system.slice(start)
  const after = chunk.slice(marker.length)
  const next = after.search(/\n\n【/)
  if (next >= 0) return chunk.slice(0, marker.length + next).trim()
  return chunk.trim()
}

/** L3 块 + 时段氛围（orchestrator 注入在 psycheBlock 后的表达相关节） */
export function extractL3ExpressionContext(system: string): string {
  const psyche = extractSectionFromMarker(system, '【心理状态')
  const time = extractSectionFromMarker(system, '【当前时刻】')
  return [psyche, time].filter(Boolean).join('\n\n')
}

export type KnowledgeL3Role = 'card_body' | 'companion'

/** 知识整理任务专用的 L3 表达指令（附在 system 末尾，优先级高于泛化任务说明） */
export function buildKnowledgeL3Directive(l3Block: string, role: KnowledgeL3Role): string {
  const l3 = l3Block.trim()
  if (!l3) {
    return role === 'card_body'
      ? '【L3 · 表达层】未检测到心理状态块；正文以准确、齐全为主，语气中性克制。'
      : '【L3 · 表达层】未检测到心理状态块；短评遵循系统人格设定，1～3 句。'
  }

  if (role === 'card_body') {
    return [
      '【L3 · 表达点缀 — 不得压过正文篇幅】',
      l3,
      '',
      '纸面卡硬性要求（按优先级）：',
      '① **主目标**：写足 500～1200 字、3～6 个小节、≥4 条要点——缺任何一项视为失败；',
      '② **正文主体（≥90% 篇幅）**须为客观、可保存的知识点，禁止只写开场白、态度句或「坐稳听」式铺垫就结束；',
      '③ 人格/情绪仅允许：极短开场或过渡（合计 ≤80 字）、小节标题措辞；禁止通篇嘲讽/嘴欠替代内容；',
      '④ 禁止复述「情绪基调」「态度倾向」等元标签；禁止把聊天口吻当成整篇正文。'
    ].join('\n')
  }

  return [
    '【L3 · 表达层 · 必读 — 与当前性格、情绪一致】',
    l3,
    '',
    '聊天气泡必须 **完全** 按上方心理状态说话：用此刻的口吻、亲密度与情绪色彩；',
    '1～3 句，每句说完整；**禁止**在气泡里讲授步骤、清单、定义或事实（即使纸面卡偏短也不补讲）；',
    '禁止复述纸面卡里的条目与事实；禁止推脱式追问；',
    '**禁止评委/第三者口吻**：不得评价「整理得不错/挺全」或打赌式验收；须第一人称，像刚帮用户整理完。'
  ].join('\n')
}
