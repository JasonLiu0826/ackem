import type { AppSettings } from '../../../settings'
import { buildOpenForULlmSettings, clampOpenForUTemperature, OPENFORU_QUALITY } from '../../../../shared/openforuConfig'
import { createLlmJsonClient } from '../../../llmClient'
import type { ArtifactBundle, UpluginArtifactBundle, UskillArtifactBundle } from './bundleTypes'
import type { UskilConfig } from '../loader'
import { evolveUpluginBundle } from '../refine/evolveUpluginAgent'
export type EvolveResult = {
  bundle: ArtifactBundle
  diffPreview: string
  summary: string
}

type EvolveJson = {
  summary?: string
  addKeywords?: string[]
  keywordReply?: string
  manifestDescription?: string
}

const EVOLVE_TEMP = 0.15

/** 从用户指令抽取要添加的关键词（deterministic 兜底） */
export function extractKeywordsFromEvolveInstruction(instruction: string): string[] {
  const out: string[] = []
  const patterns = [
    /添加(?:关键词|触发词)\s*[「"']?([^「」"'\s，,。！？]{2,24})/u,
    /触发词(?:改为|换成|为)\s*[「"']?([^「」"'\s，,。！？]{2,24})/u,
    /关键词(?:改为|换成|为)\s*[「"']?([^「」"'\s，,。！？]{2,24})/u,
    /[「"']([^「」"']{2,24})[」"']/u
  ]
  for (const re of patterns) {
    const m = instruction.match(re)
    if (m?.[1]) {
      const kw = m[1].trim()
      if (kw.length >= 2 && !out.includes(kw)) out.push(kw)
    }
  }
  return out
}

function buildTextDiff(before: string, after: string, label: string): string[] {
  if (before === after) return []
  return [`- ${label}: ${before.slice(0, 120)}`, `+ ${label}: ${after.slice(0, 120)}`]
}

function applyDeterministicUskillEvolve(
  base: UskillArtifactBundle,
  instruction: string
): EvolveResult | null {
  const add = extractKeywordsFromEvolveInstruction(instruction)
  if (!add.length) return null

  const manifest = { ...base.manifest }
  const keywords = [...new Set([...(manifest.keywords ?? []), ...add])]
  const dispatch = manifest.dispatch
    ? {
        ...manifest.dispatch,
        keywords: [...new Set([...(manifest.dispatch.keywords ?? []), ...add])]
      }
    : manifest.dispatch

  const skillConfig: UskilConfig = JSON.parse(base.files['skill.json']) as UskilConfig
  const nextSkill: UskilConfig = {
    ...skillConfig,
    onKeyword: skillConfig.onKeyword ? {
      ...skillConfig.onKeyword,
      reply: skillConfig.onKeyword.reply
    } : undefined
  }

  const nextManifest = { ...manifest, keywords, dispatch }
  const files = {
    ...base.files,
    'manifest.json': `${JSON.stringify(nextManifest, null, 2)}\n`,
    'skill.json': `${JSON.stringify(nextSkill, null, 2)}\n`
  }

  const diffLines = [
    ...buildTextDiff((base.manifest.keywords ?? []).join(','), keywords.join(','), 'manifest.keywords'),
    ...buildTextDiff(
      (base.manifest.dispatch?.keywords ?? []).join(','),
      (dispatch?.keywords ?? []).join(','),
      'dispatch.keywords'
    )
  ]

  return {
    bundle: {
      ...base,
      manifest: nextManifest,
      skillConfig: nextSkill,
      files,
      generationLog: [...base.generationLog, `evolve: deterministic keywords + ${add.join(', ')}`]
    },
    diffPreview: diffLines.join('\n'),
    summary: `已添加触发词：${add.join('、')}`
  }
}

function parseEvolveJson(raw: string): EvolveJson | null {
  const trimmed = raw.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fence ? fence[1].trim() : trimmed
  try {
    return JSON.parse(body) as EvolveJson
  } catch {
    return null
  }
}

async function applyLlmUskillEvolve(
  base: UskillArtifactBundle,
  instruction: string,
  settings: AppSettings
): Promise<EvolveResult | null> {
  const ofs = buildOpenForULlmSettings(settings)
  if (!ofs) return null

  const llm = createLlmJsonClient(ofs)
  const raw = await llm.chatCompletionJson({
    messages: [
      {
        role: 'system',
        content: [
          '你是 OpenForU Evolve 助手。只输出 JSON，不要 markdown 说明。',
          '字段：summary（string）、addKeywords（string[]）、keywordReply（string 可选）、manifestDescription（string 可选）。',
          '禁止修改 id 前缀 u/、禁止删除已有安全字段。优先优化 keywords / dispatch.keywords。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `用户优化指令：${instruction}`,
          '',
          '## 当前 manifest.json',
          base.files['manifest.json'],
          '',
          '## 当前 skill.json',
          base.files['skill.json']
        ].join('\n')
      }
    ],
    temperature: clampOpenForUTemperature(EVOLVE_TEMP),
    max_tokens: OPENFORU_QUALITY.evolveUskillMaxTokens
  })

  const parsed = parseEvolveJson(raw)
  if (!parsed) return null

  const add = (parsed.addKeywords ?? []).map((k) => k.trim()).filter((k) => k.length >= 2)
  if (!add.length && !parsed.keywordReply?.trim() && !parsed.manifestDescription?.trim()) return null

  const manifest = { ...base.manifest }
  const keywords = [...new Set([...(manifest.keywords ?? []), ...add])]
  const dispatch = manifest.dispatch
    ? {
        ...manifest.dispatch,
        keywords: [...new Set([...(manifest.dispatch.keywords ?? []), ...add])]
      }
    : manifest.dispatch

  if (parsed.manifestDescription?.trim()) {
    manifest.description = parsed.manifestDescription.trim()
  }

  const skillConfig: UskilConfig = JSON.parse(base.files['skill.json']) as UskilConfig
  if (parsed.keywordReply?.trim()) {
    skillConfig.onKeyword = { ...skillConfig.onKeyword, reply: parsed.keywordReply.trim() }
  }

  const nextManifest = { ...manifest, keywords, dispatch }
  const files = {
    ...base.files,
    'manifest.json': `${JSON.stringify(nextManifest, null, 2)}\n`,
    'skill.json': `${JSON.stringify(skillConfig, null, 2)}\n`
  }

  return {
    bundle: {
      ...base,
      manifest: nextManifest,
      skillConfig,
      files,
      generationLog: [...base.generationLog, 'evolve: LLM patch keywords/reply']
    },
    diffPreview: `+ keywords: ${add.join(', ') || '(reply/description only)'}`,
    summary: parsed.summary?.trim() || `Evolve：${add.join('、') || '已更新文案'}`
  }
}

/** JE-2b：审视并优化已安装 bundle（deterministic 优先，LLM 兜底） */
export async function evolveArtifactBundle(
  bundle: ArtifactBundle,
  instruction: string,
  settings: AppSettings
): Promise<EvolveResult> {
  if (bundle.kind === 'uplugin') {
    const result = await evolveUpluginBundle(bundle as UpluginArtifactBundle, instruction, settings)
    return result
  }

  const uskill = bundle as UskillArtifactBundle
  const deterministic = applyDeterministicUskillEvolve(uskill, instruction)
  if (deterministic) return deterministic

  const llm = await applyLlmUskillEvolve(uskill, instruction, settings)
  if (llm) return llm

  throw new Error('无法从指令解析 Evolve 变更；请说明要添加的关键词，例如：添加关键词 je1c进化探针')
}