import type { AppSettings } from '../../../settings'
import { buildOpenForULlmSettings, clampOpenForUTemperature, OPENFORU_QUALITY } from '../../../../shared/openforuConfig'
import { createLlmJsonClient } from '../../../llmClient'
import type { UpluginArtifactBundle } from '../agent/bundleTypes'
import type { UpluginMeta } from '../loader'
import { buildWidgetHtml } from '../surface/widgets/buildWidgetHtml'
import {
  defaultWidgetConfig,
  inferWidgetIdFromText,
  widgetRequiredLevel
} from '../../../../shared/openforuWidgets'
import { buildInteractionScriptForWidget } from '../../../../shared/openforuInteraction'
import type { PlanUiDesignBrief } from '../../../../shared/planDesignSpec'
import { applyManifestVersionBump } from '../agent/loadInstalledBundle'

export type UpluginEvolveResult = {
  bundle: UpluginArtifactBundle
  diffPreview: string
  summary: string
}

type UpluginEvolveJson = {
  summary?: string
  manifestDescription?: string
  injectTemplate?: string
  addKeywords?: string[]
  addSlash?: string[]
  surfaceHtml?: string
  primaryActions?: string[]
  userGoal?: string
}

function parseJson<T>(raw: string): T | null {
  const trimmed = raw.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fence ? fence[1].trim() : trimmed
  try {
    return JSON.parse(body) as T
  } catch {
    return null
  }
}

function applyKeywordPatch(
  manifest: UpluginArtifactBundle['manifest'],
  add: string[]
): UpluginArtifactBundle['manifest'] {
  const keywords = [...new Set([...(manifest.keywords ?? []), ...add])]
  const dispatch = manifest.dispatch
    ? {
        ...manifest.dispatch,
        keywords: [...new Set([...(manifest.dispatch.keywords ?? []), ...add])]
      }
    : manifest.dispatch
  return { ...manifest, keywords, dispatch }
}

/** uplugin Evolve — LLM patch manifest / meta / surface */
export async function evolveUpluginBundle(
  base: UpluginArtifactBundle,
  instruction: string,
  settings: AppSettings
): Promise<UpluginEvolveResult> {
  const ofs = buildOpenForULlmSettings(settings)
  if (!ofs) throw new Error('OpenForU LLM 未配置')

  const llm = createLlmJsonClient(ofs)
  const raw = await llm.chatCompletionJson({
    messages: [
      {
        role: 'system',
        content: [
          '你是 OpenForU uplugin Evolve 助手。只输出 JSON，不要 markdown 说明。',
          '字段：summary, manifestDescription, injectTemplate, addKeywords[], addSlash[],',
          'primaryActions[], userGoal。',
          '禁止修改 id 前缀 u/、禁止改 slug。Surface 须走 OID Widget，不要输出 surfaceHtml。',
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `用户优化指令：${instruction}`,
          '',
          '## manifest.json',
          base.files['manifest.json'],
          '',
          '## plugin.meta.json',
          base.files['plugin.meta.json'] ?? JSON.stringify(base.meta, null, 2),
          '',
          '## surface.html',
          base.files['surface.html'] ?? '(无)'
        ].join('\n')
      }
    ],
    temperature: clampOpenForUTemperature(0.15),
    max_tokens: OPENFORU_QUALITY.upluginEvolveMaxTokens
  })

  const parsed = parseJson<UpluginEvolveJson>(raw)
  if (!parsed) throw new Error('Evolve 未能解析 LLM 输出')

  let manifest = { ...base.manifest }
  if (parsed.manifestDescription?.trim()) {
    manifest = { ...manifest, description: parsed.manifestDescription.trim() }
  }
  const addKw = (parsed.addKeywords ?? []).map((k) => k.trim()).filter((k) => k.length >= 2)
  if (addKw.length) manifest = applyKeywordPatch(manifest, addKw)

  if (parsed.addSlash?.length && manifest.dispatch) {
    const slash = [...new Set([...(manifest.dispatch.slash ?? []), ...parsed.addSlash])]
    manifest = { ...manifest, dispatch: { ...manifest.dispatch, slash } }
  }

  manifest = applyManifestVersionBump(manifest)

  let meta: UpluginMeta = base.meta
  if (base.files['plugin.meta.json']) {
    try {
      meta = JSON.parse(base.files['plugin.meta.json']) as UpluginMeta
    } catch {
      meta = base.meta
    }
  }
  if (parsed.injectTemplate?.trim()) {
    meta = { ...meta, injectTemplate: parsed.injectTemplate.trim() }
  }

  const files = { ...base.files, 'manifest.json': `${JSON.stringify(manifest, null, 2)}\n` }

  const brief: PlanUiDesignBrief | undefined =
    parsed.userGoal && parsed.primaryActions?.length
      ? {
          userGoal: parsed.userGoal,
          layout: 'single_column',
          sections: [{ id: 'main', label: manifest.name, content: parsed.userGoal }],
          states: [{ id: 'idle', label: '默认', visible: parsed.primaryActions }],
          interactions: parsed.primaryActions.map((c) => ({
            control: c,
            when: 'idle',
            effect: c
          })),
          feedback: ['按钮点击后状态文案更新']
        }
      : undefined

  if (brief || parsed.primaryActions?.length) {
    const actions = parsed.primaryActions?.length ? parsed.primaryActions : ['开始', '重置']
    const widgetId = inferWidgetIdFromText(parsed.userGoal ?? manifest.name)
    const widgetConfig = defaultWidgetConfig(widgetId, actions)
    const interactionScript = buildInteractionScriptForWidget(widgetId, actions)
    const html = buildWidgetHtml(widgetId, manifest.name, widgetConfig, actions)
    files['surface.html'] = html
    meta = {
      ...meta,
      surface: {
        enabled: true,
        title: manifest.name,
        widget: widgetId,
        widgetConfig,
        interactionScript,
        requiredLevel: widgetRequiredLevel(widgetId),
        html
      }
    }
  } else if (parsed.surfaceHtml?.trim()) {
    const actions = ['开始', '重置']
    const widgetId = inferWidgetIdFromText(instruction)
    const widgetConfig = defaultWidgetConfig(widgetId, actions)
    const interactionScript = buildInteractionScriptForWidget(widgetId, actions)
    const html = buildWidgetHtml(widgetId, manifest.name, widgetConfig, actions)
    files['surface.html'] = html
    meta = {
      ...meta,
      surface: {
        enabled: true,
        title: manifest.name,
        widget: widgetId,
        widgetConfig,
        interactionScript,
        requiredLevel: widgetRequiredLevel(widgetId),
        html
      }
    }
  }

  files['plugin.meta.json'] = `${JSON.stringify(meta, null, 2)}\n`

  return {
    bundle: {
      ...base,
      manifest,
      meta,
      files,
      generationLog: [...base.generationLog, `evolve: uplugin LLM — ${parsed.summary ?? instruction.slice(0, 40)}`]
    },
    diffPreview: parsed.summary ?? addKw.join(', ') ?? 'uplugin updated',
    summary: parsed.summary?.trim() ?? 'uplugin 已优化'
  }
}
