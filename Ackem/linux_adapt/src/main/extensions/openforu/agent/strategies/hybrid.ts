import type { AppSettings } from '../../../../settings'
import {
  buildOpenForULlmSettings,
  buildPlanDialogueExcerpt,
  clampOpenForUTemperature,
  OPENFORU_QUALITY
} from '../../../../../shared/openforuConfig'
import { createLlmJsonClient } from '../../../../llmClient'
import type { PlanSession } from '../../../../../shared/planSession'
import { resolvePlanArtifactKind } from '../../../../../shared/planArtifact'
import type { UskilConfig } from '../../loader'
import type { ArtifactBundle } from '../bundleTypes'
import { GENERATED_BY_AC1 } from '../bundleTypes'
import { buildGenerateContextPack } from '../contextPack'
import { generateDeterministicBundleForKind } from './deterministic'

const HYBRID_GENERATE_TEMP = 0.2

type UskillPolishJson = {
  manifestDescription?: string
  keywordReply?: string
  contextInjection?: string
}

type UpluginPolishJson = {
  manifestDescription?: string
  injectTemplate?: string
}

function parseJsonObject<T>(raw: string): T | null {
  const trimmed = raw.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fence ? fence[1].trim() : trimmed
  try {
    return JSON.parse(body) as T
  } catch {
    return null
  }
}

async function polishUskillBundle(
  session: PlanSession,
  base: Extract<ArtifactBundle, { kind: 'uskill' }>,
  settings: AppSettings,
  abortSignal?: AbortSignal
): Promise<ArtifactBundle> {
  if (abortSignal?.aborted) {
    throw new DOMException('操作已取消', 'AbortError')
  }
  const ofs = buildOpenForULlmSettings(settings)
  if (!ofs) return base

  const pack = buildGenerateContextPack(session, 'uskill')
  const llm = createLlmJsonClient(ofs)
  const raw = await llm.chatCompletionJson({
    messages: [
      {
        role: 'system',
        content: [
          '你是 OpenForU 扩展文案润色助手。只输出一个 JSON 对象，不要 markdown 包裹以外的说明。',
          '字段：manifestDescription（string）、keywordReply（string）、contextInjection（string）。',
          '禁止修改 dispatch、keywords、权限、id。语气贴近 Ackem 伴侣，落实 Plan 方案中的具体行为。',
          '用简体中文。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          '## 方案摘要',
          pack.dispatchSummary,
          '',
          '## 习惯 / 场景 / 关键词',
          `habits: ${pack.habits.join(' · ')}`,
          `scenarios: ${pack.scenarios.join(' · ')}`,
          `keywords: ${pack.keywords.join(' · ')}`,
          '',
          '## Plan 对话摘录',
          buildPlanDialogueExcerpt(session),
          '',
          '## 当前模板文案（请润色得更贴方案，但保持可执行）',
          `description: ${base.manifest.description}`,
          `reply: ${base.skillConfig.onKeyword?.reply ?? ''}`,
          `contextInjection: ${base.skillConfig.promptTemplates?.contextInjection ?? ''}`
        ].join('\n')
      }
    ],
    temperature: clampOpenForUTemperature(HYBRID_GENERATE_TEMP),
    max_tokens: OPENFORU_QUALITY.polishMaxTokens,
    signal: abortSignal
  })

  const parsed = parseJsonObject<UskillPolishJson>(raw)
  if (!parsed) {
    base.generationLog.push('hybrid: LLM 润色解析失败，保留 deterministic 文案')
    return base
  }

  const manifest = { ...base.manifest }
  if (parsed.manifestDescription?.trim()) {
    manifest.description = parsed.manifestDescription.trim()
  }

  const skillConfig: UskilConfig = JSON.parse(base.files['skill.json']) as UskilConfig
  if (parsed.keywordReply?.trim() && skillConfig.onKeyword) {
    skillConfig.onKeyword.reply = parsed.keywordReply.trim()
  }
  if (parsed.contextInjection?.trim() && skillConfig.promptTemplates) {
    skillConfig.promptTemplates.contextInjection = parsed.contextInjection.trim()
  }

  const files = {
    'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'skill.json': `${JSON.stringify(skillConfig, null, 2)}\n`
  }

  base.generationLog.push('hybrid: LLM 已润色 manifest.description / skill.json 话术')

  return {
    ...base,
    manifest,
    skillConfig,
    files
  }
}

export async function polishUpluginBundle(
  session: PlanSession,
  base: Extract<ArtifactBundle, { kind: 'uplugin' }>,
  settings: AppSettings,
  abortSignal?: AbortSignal
): Promise<ArtifactBundle> {
  if (abortSignal?.aborted) {
    throw new DOMException('操作已取消', 'AbortError')
  }
  const ofs = buildOpenForULlmSettings(settings)
  if (!ofs) return base

  const pack = buildGenerateContextPack(session, 'uplugin')
  const llm = createLlmJsonClient(ofs)
  const raw = await llm.chatCompletionJson({
    messages: [
      {
        role: 'system',
        content: [
          '你是 OpenForU uplugin 文案润色助手。只输出 JSON：manifestDescription、injectTemplate。',
          'injectTemplate 是注入主聊天的短提示，说明 Plugin 已触发及用户应得到的行为。',
          'v1 仅为上下文注入，不要承诺真实系统 API。简体中文。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          '## 方案',
          pack.dispatchSummary,
          `keywords: ${pack.keywords.join(' · ')}`,
          '',
          buildPlanDialogueExcerpt(session),
          '',
          '## 当前 injectTemplate',
          base.meta.injectTemplate
        ].join('\n')
      }
    ],
    temperature: clampOpenForUTemperature(HYBRID_GENERATE_TEMP),
    max_tokens: OPENFORU_QUALITY.polishMaxTokens,
    signal: abortSignal
  })

  const parsed = parseJsonObject<UpluginPolishJson>(raw)
  if (!parsed) {
    base.generationLog.push('hybrid: LLM 润色解析失败，保留 deterministic 文案')
    return base
  }

  const manifest = { ...base.manifest }
  if (parsed.manifestDescription?.trim()) {
    manifest.description = parsed.manifestDescription.trim()
  }

  const meta = { ...base.meta, generatedBy: GENERATED_BY_AC1 }
  if (parsed.injectTemplate?.trim()) {
    meta.injectTemplate = parsed.injectTemplate.trim()
  }

  const files = {
    ...base.files,
    'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'plugin.meta.json': `${JSON.stringify(meta, null, 2)}\n`
  }

  base.generationLog.push('hybrid: LLM 已润色 manifest.description / injectTemplate')

  return {
    ...base,
    manifest,
    meta,
    files
  }
}

export async function generateHybridBundle(
  session: PlanSession,
  settings: AppSettings,
  kind: 'uskill' | 'uplugin',
  abortSignal?: AbortSignal
): Promise<ArtifactBundle> {
  const base = generateDeterministicBundleForKind(session, kind)
  if (base.kind === 'uskill') {
    const polished = await polishUskillBundle(session, base, settings, abortSignal)
    polished.generationLog.unshift(`strategy: hybrid_skill (${GENERATED_BY_AC1})`)
    return polished
  }
  const polished = await polishUpluginBundle(session, base, settings, abortSignal)
  polished.generationLog.unshift(`strategy: hybrid_inject (${GENERATED_BY_AC1})`)
  return polished
}

export async function generateHybridBundleAuto(
  session: PlanSession,
  settings: AppSettings
): Promise<ArtifactBundle> {
  const kind = resolvePlanArtifactKind(session)
  if (kind !== 'uskill' && kind !== 'uplugin') {
    throw new Error('请先在 Plan 中明确产物类型为 uskill 或 uplugin')
  }
  return generateHybridBundle(session, settings, kind)
}
