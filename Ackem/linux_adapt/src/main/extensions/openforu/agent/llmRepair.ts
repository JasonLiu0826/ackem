/**
 * P2：LLM Repair — validate 失败后尝试按 Design Spec 修补 bundle（最多 N 次）
 */
import type { AppSettings } from '../../../settings'
import { createLlmJsonClient } from '../../../llmClient'
import type { PlanSession } from '../../../../shared/planSession'
import {
  buildOpenForULlmSettings,
  buildPlanDialogueExcerpt,
  clampOpenForUTemperature,
  OPENFORU_QUALITY
} from '../../../../shared/openforuConfig'
import type { ArtifactBundle } from './bundleTypes'
import type { ValidationReport } from './validationReport'
import { formatValidationErrors } from './validationReport'
import { syncBundleFiles } from './bundleSync'
import { syncBundleFromDesignSpec } from '../designSpec/syncBundleFromSpec'

type LlmRepairJson = {
  manifestJson?: string
  pluginMetaJson?: string
  skillJson?: string
  surfaceHtml?: string
  mainTs?: string
  summary?: string
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

export async function runLlmBundleRepair(
  bundle: ArtifactBundle,
  session: PlanSession,
  report: ValidationReport,
  settings: AppSettings,
  abortSignal?: AbortSignal
): Promise<{ bundle: ArtifactBundle; ok: boolean; summary?: string }> {
  if (abortSignal?.aborted) {
    throw new DOMException('操作已取消', 'AbortError')
  }
  const ofs = buildOpenForULlmSettings(settings)
  if (!ofs) return { bundle, ok: false }

  const llm = createLlmJsonClient(ofs)
  const specJson = session.designSpec ? JSON.stringify(session.designSpec, null, 2) : '(无 designSpec)'
  const raw = await llm.chatCompletionJson({
    messages: [
      {
        role: 'system',
        content: [
          '你是 OpenForU 制品修复助手。只输出 JSON，不要 markdown 说明。',
          '根据 Design Spec 与校验错误，输出需替换的文件字段（仅填需要改的）：',
          'manifestJson, pluginMetaJson, skillJson, surfaceHtml, mainTs, summary。',
          '禁止修改 manifest.id 的 slug 前缀 u/；Surface 须用 OID widget 字段，不要编造未实装 HTML 交互。',
          'uplugin Worker 禁止 forbidden imports。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `校验错误：${formatValidationErrors(report)}`,
          '',
          '## designSpec',
          specJson,
          '',
          '## 当前 manifest.json',
          bundle.files['manifest.json'],
          '',
          '## 当前 plugin.meta.json / skill.json',
          bundle.files['plugin.meta.json'] ?? bundle.files['skill.json'] ?? '(无)',
          '',
          '## Plan 摘录',
          buildPlanDialogueExcerpt(session)
        ].join('\n')
      }
    ],
    temperature: clampOpenForUTemperature(0.1),
    max_tokens: OPENFORU_QUALITY.upluginEvolveMaxTokens,
    signal: abortSignal
  })

  const parsed = parseJson<LlmRepairJson>(raw)
  if (!parsed) return { bundle, ok: false }

  const next: ArtifactBundle = {
    ...bundle,
    files: { ...bundle.files },
    generationLog: [...bundle.generationLog]
  }

  if (parsed.manifestJson?.trim()) {
    next.files['manifest.json'] = parsed.manifestJson.trim()
    try {
      next.manifest = JSON.parse(parsed.manifestJson) as typeof next.manifest
    } catch {
      return { bundle, ok: false }
    }
  }

  if (parsed.skillJson?.trim() && next.kind === 'uskill') {
    next.files['skill.json'] = parsed.skillJson.trim()
    try {
      next.skillConfig = JSON.parse(parsed.skillJson) as typeof next.skillConfig
    } catch {
      return { bundle, ok: false }
    }
  }

  if (parsed.pluginMetaJson?.trim() && next.kind === 'uplugin') {
    next.files['plugin.meta.json'] = parsed.pluginMetaJson.trim()
    try {
      next.meta = JSON.parse(parsed.pluginMetaJson) as typeof next.meta
    } catch {
      return { bundle, ok: false }
    }
  }

  if (parsed.mainTs?.trim() && next.kind === 'uplugin') {
    next.files['main.ts'] = parsed.mainTs.trim()
  }

  if (parsed.surfaceHtml?.trim() && next.kind === 'uplugin' && !session.designSpec?.ui.widgetId) {
    next.files['surface.html'] = parsed.surfaceHtml.trim()
  }

  if (session.designSpec) {
    const synced = syncBundleFromDesignSpec(next, session.designSpec)
    Object.assign(next, synced.bundle)
  }

  syncBundleFiles(next)
  next.generationLog.push(`[LLM-REPAIR] ${parsed.summary ?? 'patched files'}`)
  return { bundle: next, ok: true, summary: parsed.summary }
}
