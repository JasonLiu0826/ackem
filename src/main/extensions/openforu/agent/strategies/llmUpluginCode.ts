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

/** 浠?LLM 鍥炲鎻愬彇 main.ts 婧愮爜 */
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
    throw new DOMException('鎿嶄綔宸插彇娑?, 'AbortError')
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
          '浣犳槸 OpenForU uplugin main.ts 浠ｇ爜鐢熸垚鍔╂墜锛圵orker 娌欑锛夈€?,
          '鍙緭鍑轰竴涓?TypeScript 浠ｇ爜鍧楋紙```typescript锛夛紝涓嶈鍏朵粬璇存槑銆?,
          '蹇呴』 export default factory(api) 鎴?export default () => hooks 瀵硅薄銆?,
          '浼樺厛瀹炵幇 beforeUserMessage(userMessage) 鈫?{ contextInjections: string[] }銆?,
          '褰撶敤鎴锋秷鎭尮閰?Plan 鍏抽敭璇?涔犳儻鏃舵敞鍏ユ柟妗堢害瀹氱殑涓婁笅鏂囷紱鍚﹀垯杩斿洖绌烘暟缁勩€?,
          '绂佹锛歩mport/require Node 鍐呯疆妯″潡銆乪val銆乶ew Function銆乸rocess.exit銆乬lobal/globalThis銆?,
          '绂佹 import 椤圭洰鍐呰矾寰勶紱涓嶈 class 缁ф壙寮曟搸绫诲瀷锛屽彧鐢ㄥ唴鑱?async 鍑芥暟銆?,
          '鍙敤 api.log / api.readOwnFile / api.writeOwnFile锛涜嫢 manifest 澹版槑 system_notification / network_outbound 鍒欏彲鐢?api.notify / api.fetch锛涘彲瀹炵幇 onEngineUpdate 瀹氭椂 tick銆?,
          '浠ｇ爜椤昏兘鐩存帴琚?esbuild 鎵撴垚鍗曟枃浠?CJS銆?
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          '## uplugin main.ts 浠ｇ爜鐢熸垚',
          `鎵╁睍鍚? ${base.manifest.name}`,
          `description: ${base.manifest.description}`,
          `keywords: ${keywords.join(' 路 ')}`,
          `habits: ${pack.habits.join(' 路 ')}`,
          `scenarios: ${pack.scenarios.join(' 路 ')}`,
          `鏈熸湜琛屼负: ${pack.dispatchSummary || pack.planSummary || base.meta.injectTemplate}`,
          '',
          '## Plan 瀵硅瘽鎽樺綍',
          buildPlanDialogueExcerpt(session),
          '',
          '## 鍙傝€冿紙瀹夊叏鏈€灏忕ず渚嬶級',
          '```typescript',
          'export default () => ({',
          '  beforeUserMessage: async (userMessage: string) => {',
          '    const hit = ["鍏抽敭璇?", "鍏抽敭璇?"].some((k) => userMessage.includes(k))',
          '    if (!hit) return { contextInjections: [] }',
          '    return { contextInjections: ["銆怭lugin銆戞寜鏂规娉ㄥ叆鐨勪笂涓嬫枃"] }',
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
  base.generationLog.push(`llm_uplugin_code: ${reason}锛屽洖閫€ inject`)
  const polished = await polishUpluginBundle(session, base, settings, abortSignal)
  polished.generationLog.unshift('strategy: llm_uplugin_code 鈫?hybrid_inject fallback')
  return polished
}

/** LLM 鍐?uplugin main.ts锛涙牎楠屽け璐ュ垯鍥為€€ inject-only锛圖3 鍙岃建锛?*/
export async function generateLlmUpluginCodeBundle(
  session: PlanSession,
  settings: AppSettings,
  abortSignal?: AbortSignal
): Promise<ArtifactBundle> {
  const base = generateDeterministicBundleForKind(session, 'uplugin') as UpluginArtifactBundle

  const ofs = buildOpenForULlmSettings(settings)
  if (!ofs) {
    return fallbackInjectBundle(session, base, settings, 'OpenForU LLM 鏈厤缃?, abortSignal)
  }

  let mainTs: string | null
  try {
    mainTs = await requestMainTsFromLlm(session, settings, base, abortSignal)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    const msg = err instanceof Error ? err.message : String(err)
    return fallbackInjectBundle(session, base, settings, `LLM 璋冪敤澶辫触 (${msg})`, abortSignal)
  }

  if (!mainTs?.trim()) {
    return fallbackInjectBundle(session, base, settings, 'LLM 鏈繑鍥?main.ts', abortSignal)
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'Ackem-uplugin-gen-'))
  const check = await validateGeneratedMainTs(mainTs, tmpDir)
  if (!check.ok) {
    return fallbackInjectBundle(
      session,
      base,
      settings,
      `main.ts 鏍￠獙澶辫触 (${check.errors.join('; ')})`,
      abortSignal
    )
  }

  const withMain = attachMainTsToBundle(base, mainTs)
  const polished = await polishUpluginBundle(session, withMain, settings, abortSignal)
  polished.generationLog.unshift('strategy: llm_uplugin_code (Worker main.ts)')
  polished.generationLog.push('llm_uplugin_code: main.ts 閫氳繃 staticScan + esbuild')
  return polished
}
