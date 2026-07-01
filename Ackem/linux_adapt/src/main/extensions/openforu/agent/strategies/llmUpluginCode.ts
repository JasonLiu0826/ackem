import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AppSettings } from '../../../../settings'
import { createLlmJsonClient } from '../../../../llmClient'
import type { PlanSession } from '../../../../../shared/planSession'
import type { ArtifactBundle, UpluginArtifactBundle } from '../bundleTypes'
import { GENERATED_BY_AC1 } from '../bundleTypes'
import { buildGenerateContextPack } from '../contextPack'
import { bundlePluginMainSource } from '../../sandbox/bundlePluginMain'
import { staticScan } from '../../sandbox/staticScan'
import {
  buildOpenForULlmSettings,
  buildPlanDialogueExcerpt,
  clampOpenForUTemperature,
  OPENFORU_QUALITY
} from '../../../../../shared/openforuConfig'
import { generateDeterministicBundleForKind } from './deterministic'
import { polishUpluginBundle } from './hybrid'

const LLM_UPLUGIN_CODE_TEMP = 0.15

/** 从 LLM 回复提取 main.ts 源码 */
export function parseMainTsFromLlmResponse(raw: string): string | null {
  const trimmed = raw.trim()
  const fence = trimmed.match(/```(?:typescript|ts)?\s*([\s\S]*?)```/i)
  if (fence?.[1]?.trim()) return fence[1].trim()
  if (/export\s+default/.test(trimmed)) return trimmed
  return null
}

async function requestMainTsFromLlm(
  session: PlanSession,
  settings: AppSettings,
  base: UpluginArtifactBundle,
  abortSignal?: AbortSignal
): Promise<string | null> {
  if (abortSignal?.aborted) {
    throw new DOMException('操作已取消', 'AbortError')
  }
  const ofs = buildOpenForULlmSettings(settings)
  if (!ofs) return null

  const pack = buildGenerateContextPack(session, 'uplugin')
  const keywords = pack.keywords.length
    ? pack.keywords
    : (base.manifest.dispatch?.keywords ?? [])
  const llm = createLlmJsonClient(ofs)
  const raw = await llm.chatCompletionJson({
    messages: [
      {
        role: 'system',
        content: [
          '你是 OpenForU uplugin main.ts 代码生成助手（Worker 沙箱）。',
          '只输出一个 TypeScript 代码块（```typescript），不要其他说明。',
          '必须 export default factory(api) 或 export default () => hooks 对象。',
          '优先实现 beforeUserMessage(userMessage) → { contextInjections: string[] }。',
          '当用户消息匹配 Plan 关键词/习惯时注入方案约定的上下文；否则返回空数组。',
          '禁止：import/require Node 内置模块、eval、new Function、process.exit、global/globalThis。',
          '禁止 import 项目内路径；不要 class 继承引擎类型，只用内联 async 函数。',
          '可用 api.log / api.readOwnFile / api.writeOwnFile；若 manifest 声明 system_notification / network_outbound 则可用 api.notify / api.fetch；可实现 onEngineUpdate 定时 tick。',
          '代码须能直接被 esbuild 打成单文件 CJS。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          '## uplugin main.ts 代码生成',
          `扩展名: ${base.manifest.name}`,
          `description: ${base.manifest.description}`,
          `keywords: ${keywords.join(' · ')}`,
          `habits: ${pack.habits.join(' · ')}`,
          `scenarios: ${pack.scenarios.join(' · ')}`,
          `期望行为: ${pack.dispatchSummary || pack.planSummary || base.meta.injectTemplate}`,
          '',
          '## Plan 对话摘录',
          buildPlanDialogueExcerpt(session),
          '',
          '## 参考（安全最小示例）',
          '```typescript',
          'export default () => ({',
          '  beforeUserMessage: async (userMessage: string) => {',
          '    const hit = ["关键词1", "关键词2"].some((k) => userMessage.includes(k))',
          '    if (!hit) return { contextInjections: [] }',
          '    return { contextInjections: ["【Plugin】按方案注入的上下文"] }',
          '  }',
          '})',
          '```'
        ].join('\n')
      }
    ],
    temperature: clampOpenForUTemperature(LLM_UPLUGIN_CODE_TEMP),
    max_tokens: OPENFORU_QUALITY.upluginCodeMaxTokens,
    signal: abortSignal
  })

  return parseMainTsFromLlmResponse(raw)
}

async function validateGeneratedMainTs(
  mainTs: string,
  pluginDir: string
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const scanErrors = staticScan(mainTs)
  if (scanErrors.length) {
    return { ok: false, errors: scanErrors.map((e) => `static: ${e}`) }
  }
  const bundled = await bundlePluginMainSource(mainTs, pluginDir)
  if (!bundled.ok) {
    return { ok: false, errors: bundled.errors.map((e) => `esbuild: ${e}`) }
  }
  return { ok: true }
}

function attachMainTsToBundle(base: UpluginArtifactBundle, mainTs: string): UpluginArtifactBundle {
  const manifest = { ...base.manifest, main: 'main.ts' }
  const meta = { ...base.meta, generatedBy: GENERATED_BY_AC1 }
  const files = {
    ...base.files,
    'main.ts': `${mainTs.trim()}\n`,
    'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'plugin.meta.json': `${JSON.stringify(meta, null, 2)}\n`
  }
  return { ...base, manifest, meta, files }
}

async function fallbackInjectBundle(
  session: PlanSession,
  base: UpluginArtifactBundle,
  settings: AppSettings,
  reason: string,
  abortSignal?: AbortSignal
): Promise<ArtifactBundle> {
  base.generationLog.push(`llm_uplugin_code: ${reason}，回退 inject`)
  const polished = await polishUpluginBundle(session, base, settings, abortSignal)
  polished.generationLog.unshift('strategy: llm_uplugin_code → hybrid_inject fallback')
  return polished
}

/** LLM 写 uplugin main.ts；校验失败则回退 inject-only（D3 双轨） */
export async function generateLlmUpluginCodeBundle(
  session: PlanSession,
  settings: AppSettings,
  abortSignal?: AbortSignal
): Promise<ArtifactBundle> {
  const base = generateDeterministicBundleForKind(session, 'uplugin') as UpluginArtifactBundle

  const ofs = buildOpenForULlmSettings(settings)
  if (!ofs) {
    return fallbackInjectBundle(session, base, settings, 'OpenForU LLM 未配置', abortSignal)
  }

  let mainTs: string | null
  try {
    mainTs = await requestMainTsFromLlm(session, settings, base, abortSignal)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    const msg = err instanceof Error ? err.message : String(err)
    return fallbackInjectBundle(session, base, settings, `LLM 调用失败 (${msg})`, abortSignal)
  }

  if (!mainTs?.trim()) {
    return fallbackInjectBundle(session, base, settings, 'LLM 未返回 main.ts', abortSignal)
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'ackem-uplugin-gen-'))
  const check = await validateGeneratedMainTs(mainTs, tmpDir)
  if (!check.ok) {
    return fallbackInjectBundle(
      session,
      base,
      settings,
      `main.ts 校验失败 (${check.errors.join('; ')})`,
      abortSignal
    )
  }

  const withMain = attachMainTsToBundle(base, mainTs)
  const polished = await polishUpluginBundle(session, withMain, settings, abortSignal)
  polished.generationLog.unshift('strategy: llm_uplugin_code (Worker main.ts)')
  polished.generationLog.push('llm_uplugin_code: main.ts 通过 staticScan + esbuild')
  return polished
}
