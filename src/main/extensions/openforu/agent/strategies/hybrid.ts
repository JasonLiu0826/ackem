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
    throw new DOMException('鎿嶄綔宸插彇娑?, 'AbortError')
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
          '浣犳槸 OpenForU 鎵╁睍鏂囨娑﹁壊鍔╂墜銆傚彧杈撳嚭涓€涓?JSON 瀵硅薄锛屼笉瑕?markdown 鍖呰９浠ュ鐨勮鏄庛€?,
          '瀛楁锛歮anifestDescription锛坰tring锛夈€乲eywordReply锛坰tring锛夈€乧ontextInjection锛坰tring锛夈€?,
          '绂佹淇敼 dispatch銆乲eywords銆佹潈闄愩€乮d銆傝姘旇创杩?Ackem 浼翠荆锛岃惤瀹?Plan 鏂规涓殑鍏蜂綋琛屼负銆?,
          '鐢ㄧ畝浣撲腑鏂囥€?
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          '## 鏂规鎽樿',
          pack.dispatchSummary,
          '',
          '## 涔犳儻 / 鍦烘櫙 / 鍏抽敭璇?,
          `habits: ${pack.habits.join(' 路 ')}`,
          `scenarios: ${pack.scenarios.join(' 路 ')}`,
          `keywords: ${pack.keywords.join(' 路 ')}`,
          '',
          '## Plan 瀵硅瘽鎽樺綍',
          buildPlanDialogueExcerpt(session),
          '',
          '## 褰撳墠妯℃澘鏂囨锛堣娑﹁壊寰楁洿璐存柟妗堬紝浣嗕繚鎸佸彲鎵ц锛?,
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
    base.generationLog.push('hybrid: LLM 娑﹁壊瑙ｆ瀽澶辫触锛屼繚鐣?deterministic 鏂囨')
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

  base.generationLog.push('hybrid: LLM 宸叉鼎鑹?manifest.description / skill.json 璇濇湳')

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
    throw new DOMException('鎿嶄綔宸插彇娑?, 'AbortError')
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
          '浣犳槸 OpenForU uplugin 鏂囨娑﹁壊鍔╂墜銆傚彧杈撳嚭 JSON锛歮anifestDescription銆乮njectTemplate銆?,
          'injectTemplate 鏄敞鍏ヤ富鑱婂ぉ鐨勭煭鎻愮ず锛岃鏄?Plugin 宸茶Е鍙戝強鐢ㄦ埛搴斿緱鍒扮殑琛屼负銆?,
          'v1 浠呬负涓婁笅鏂囨敞鍏ワ紝涓嶈鎵胯鐪熷疄绯荤粺 API銆傜畝浣撲腑鏂囥€?
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          '## 鏂规',
          pack.dispatchSummary,
          `keywords: ${pack.keywords.join(' 路 ')}`,
          '',
          buildPlanDialogueExcerpt(session),
          '',
          '## 褰撳墠 injectTemplate',
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
    base.generationLog.push('hybrid: LLM 娑﹁壊瑙ｆ瀽澶辫触锛屼繚鐣?deterministic 鏂囨')
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

  base.generationLog.push('hybrid: LLM 宸叉鼎鑹?manifest.description / injectTemplate')

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
    throw new Error('璇峰厛鍦?Plan 涓槑纭骇鐗╃被鍨嬩负 uskill 鎴?uplugin')
  }
  return generateHybridBundle(session, settings, kind)
}
