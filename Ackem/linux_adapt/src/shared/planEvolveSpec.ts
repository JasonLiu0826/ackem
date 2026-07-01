/** OpenForU Refine 轨 — 二次修改增量规格 */

export type EvolveChangeKind =
  | 'trigger'
  | 'behavior'
  | 'ui'
  | 'code'
  | 'permission'
  | 'meta'

export type EvolveChange = {
  kind: EvolveChangeKind
  field?: string
  intent: string
  add?: string[]
  remove?: string[]
}

export type EvolveSpec = {
  version: '1.0.0'
  targetExtensionId: string
  targetSlug: string
  instruction: string
  changes: EvolveChange[]
  acceptance: {
    smokeMessages: string[]
    expectContextInjection?: boolean
    expectSurfaceOpenable?: boolean
  }
  permissionDelta?: {
    add: string[]
    remove: string[]
  }
  uiWireframeApproved?: boolean
}

export function parseEvolveSpecFromInstruction(
  extensionId: string,
  instruction: string
): EvolveSpec {
  const slug = extensionId.replace(/^u\//, '').replace(/@.*$/, '')
  const changes: EvolveChange[] = []
  const addKeywords: string[] = []

  const kwPatterns = [
    /添加(?:关键词|触发词)\s*[「"']?([^「」"'\s，,。！？]{2,24})/u,
    /[「"']([^「」"']{2,24})[」"']/u
  ]
  for (const re of kwPatterns) {
    const m = instruction.match(re)
    if (m?.[1]) {
      const kw = m[1].trim()
      if (kw.length >= 2 && !addKeywords.includes(kw)) addKeywords.push(kw)
    }
  }

  const slashMatch = instruction.match(/\/([a-zA-Z0-9_\u4e00-\u9fff]{1,24})/)
  if (slashMatch?.[0]) addKeywords.push(slashMatch[0])

  if (addKeywords.length) {
    changes.push({
      kind: 'trigger',
      field: 'dispatch.keywords',
      intent: instruction,
      add: addKeywords
    })
  }

  if (/界面|按钮|面板|布局|surface|ui/i.test(instruction)) {
    changes.push({ kind: 'ui', intent: instruction })
  } else if (/注入|文案|回复|行为|分钟|计时/.test(instruction)) {
    changes.push({ kind: 'behavior', intent: instruction })
  } else if (/通知|联网|权限/.test(instruction)) {
    changes.push({ kind: 'permission', intent: instruction })
  } else if (/代码|逻辑|main\.ts|hook/.test(instruction)) {
    changes.push({ kind: 'code', intent: instruction })
  } else if (!changes.length) {
    changes.push({ kind: 'behavior', intent: instruction })
  }

  const smoke = addKeywords.length ? addKeywords : [instruction.slice(0, 24)]

  return {
    version: '1.0.0',
    targetExtensionId: extensionId,
    targetSlug: slug,
    instruction: instruction.trim(),
    changes,
    acceptance: {
      smokeMessages: smoke,
      expectContextInjection: true
    },
    permissionDelta: { add: [], remove: [] }
  }
}
