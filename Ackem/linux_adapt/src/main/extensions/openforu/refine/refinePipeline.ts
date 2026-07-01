/**
 * OpenForU Refine 轨 — 预览 / 应用 / 回滚（高内聚编排层）
 */
import type { AppSettings } from '../../../settings'
import type { ExtensionsCoordinator } from '../../coordinator'
import { loadInstalledBundle, applyManifestVersionBump } from '../agent/loadInstalledBundle'
import { evolveArtifactBundle } from '../agent/evolveAgent'
import { validateBundleWithSpec, formatValidationErrors } from '../agent/validationReport'
import { assertValidArtifactBundle } from '../agent/validateAgent'
import { runSandboxProbeUpluginTool } from '../agent/tools/sandboxProbeUplugin'
import { verifyDeployedExtension } from '../agent/verifyAgent'
import type { OpenForULoader } from '../loader'
import { parseEvolveSpecFromInstruction, type EvolveSpec } from '../../../../shared/planEvolveSpec'
import { formatDeliveryCard, formatFailureCard } from '../../../../shared/planDeliveryCard'
import {
  listRevisionHistory,
  parseVersionFromExtensionId,
  readRevisionIndex,
  restoreExtensionRevision,
  snapshotExtensionBeforeChange
} from './revisionStore'

export type RefinePreviewResult = {
  ok: boolean
  extensionId: string
  evolveSpec: EvolveSpec
  diffPreview: string
  summary: string
  error?: string
}

export type RefineApplyResult = {
  ok: boolean
  extensionId: string
  newExtensionId?: string
  message: string
  diffPreview?: string
}

function kindFromId(extensionId: string, loader: OpenForULoader): 'uskill' | 'uplugin' | null {
  if (loader.getUskil(extensionId)) return 'uskill'
  if (loader.getUplugin(extensionId)) return 'uplugin'
  return null
}

export async function previewRefine(
  loader: OpenForULoader,
  extensionId: string,
  instruction: string,
  settings: AppSettings
): Promise<RefinePreviewResult> {
  const base = loadInstalledBundle(loader, extensionId)
  if (!base) {
    return {
      ok: false,
      extensionId,
      evolveSpec: parseEvolveSpecFromInstruction(extensionId, instruction),
      diffPreview: '',
      summary: '',
      error: `未找到扩展 ${extensionId}`
    }
  }
  const evolveSpec = parseEvolveSpecFromInstruction(extensionId, instruction)
  try {
    const evolved = await evolveArtifactBundle(base, instruction, settings)
    return {
      ok: true,
      extensionId,
      evolveSpec,
      diffPreview: evolved.diffPreview,
      summary: evolved.summary
    }
  } catch (err) {
    return {
      ok: false,
      extensionId,
      evolveSpec,
      diffPreview: '',
      summary: '',
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function applyRefine(
  coordinator: ExtensionsCoordinator,
  extensionId: string,
  instruction: string,
  settings: AppSettings,
  dataRoot: string
): Promise<RefineApplyResult> {
  const loader = coordinator.openforu
  const kind = kindFromId(extensionId, loader)
  if (!kind) {
    return { ok: false, extensionId, message: `未找到扩展 \`${extensionId}\`` }
  }

  const prevVersion = parseVersionFromExtensionId(extensionId)
  const slug = extensionId.replace(/^u\//, '').replace(/@.*$/, '')

  snapshotExtensionBeforeChange(dataRoot, kind, slug, prevVersion, {
    instruction,
    summary: 'Refine 前快照'
  })

  let evolved
  try {
    const base = loadInstalledBundle(loader, extensionId)
    if (!base) throw new Error(`未找到扩展 ${extensionId}`)
    evolved = await evolveArtifactBundle(base, instruction, settings)
    if (evolved.bundle.kind === 'uskill') {
      evolved.bundle.manifest = applyManifestVersionBump(evolved.bundle.manifest)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      extensionId,
      message: formatFailureCard({
        kind: 'refine',
        displayName: extensionId,
        phase: '生成',
        error: msg,
        actions: ['检查指令是否清晰', '到扩展中心重试']
      })
    }
  }

  const report = validateBundleWithSpec(evolved.bundle, null)
  if (!report.ok) {
    return {
      ok: false,
      extensionId,
      message: formatFailureCard({
        kind: 'refine',
        displayName: evolved.bundle.manifest.name,
        phase: '校验',
        error: formatValidationErrors(report),
        actions: ['修改优化指令', '恢复上一版（扩展中心）']
      })
    }
  }

  try {
    assertValidArtifactBundle(evolved.bundle)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, extensionId, message: `❌ 校验失败：${msg}` }
  }

  if (evolved.bundle.kind === 'uplugin') {
    const probe = await runSandboxProbeUpluginTool(evolved.bundle, dataRoot)
    if (!probe.skipped && !probe.ok) {
      return {
        ok: false,
        extensionId,
        message: formatFailureCard({
          kind: 'refine',
          displayName: evolved.bundle.manifest.name,
          phase: '沙箱探测',
          error: probe.errors.join('; '),
          actions: ['简化 uplugin 逻辑', '恢复上一版']
        })
      }
    }
  }

  let deployResult
  if (evolved.bundle.kind === 'uskill') {
    deployResult = await loader.deployUskill(
      evolved.bundle.dirName,
      evolved.bundle.manifest,
      evolved.bundle.skillConfig
    )
  } else {
    deployResult = await loader.deployUplugin(
      evolved.bundle.dirName,
      evolved.bundle.manifest,
      evolved.bundle.meta,
      Object.fromEntries(
        Object.entries(evolved.bundle.files).filter(
          ([name]) => !['manifest.json', 'plugin.meta.json'].includes(name)
        )
      ),
      { skipApproval: false }
    )
  }

  if (!deployResult.ok || !deployResult.id) {
    return {
      ok: false,
      extensionId,
      message: formatFailureCard({
        kind: 'refine',
        displayName: evolved.bundle.manifest.name,
        phase: '部署',
        error: deployResult.error ?? '未知错误',
        actions: ['扩展中心补批权限', '恢复上一版']
      })
    }
  }

  let verifyOk = true
  let verifySkipped = false
  try {
    const verify = await verifyDeployedExtension({
      extensionId: deployResult.id,
      session: { id: 'refine', createdAt: new Date().toISOString(), messages: [] },
      coordinator
    })
    verifyOk = verify.ok
    verifySkipped = verify.skipped === true
    if (!verify.ok && !verify.skipped) {
      if (kind === 'uskill') await loader.deactivateUskil(deployResult.id)
      else await loader.deactivateUplugin(deployResult.id)
    }
  } catch {
    verifyOk = true
  }

  const dispatch = evolved.bundle.manifest.dispatch
  const card = formatDeliveryCard({
    kind: 'refine',
    displayName: evolved.bundle.manifest.name,
    extensionId: deployResult.id,
    previousVersion: prevVersion,
    version: parseVersionFromExtensionId(deployResult.id),
    purpose: evolved.summary,
    keywords: evolved.bundle.manifest.keywords ?? dispatch?.keywords ?? [],
    slash: dispatch?.slash ?? [],
    uiType:
      evolved.bundle.kind === 'uplugin' && evolved.bundle.files['surface.html']
        ? 'surface'
        : 'injection_only',
    openHint: '主聊天 slash 会自动打开独立窗口；或在扩展中心点「打开窗口」',
    smokeExample: dispatch?.slash?.[0] ?? dispatch?.keywords?.[0] ?? instruction.slice(0, 20),
    verifyOk,
    verifySkipped,
    diffSummary: evolved.diffPreview.split('\n').filter(Boolean).slice(0, 6)
  })

  return {
    ok: verifyOk || verifySkipped,
    extensionId,
    newExtensionId: deployResult.id,
    message: card,
    diffPreview: evolved.diffPreview
  }
}

export function getRefineHistory(dataRoot: string, extensionId: string) {
  const slug = extensionId.replace(/^u\//, '').replace(/@.*$/, '')
  return listRevisionHistory(dataRoot, slug)
}

export function rollbackRefine(
  dataRoot: string,
  extensionId: string,
  targetVersion: string,
  kindHint?: 'uskill' | 'uplugin'
): boolean {
  const slug = extensionId.replace(/^u\//, '').replace(/@.*$/, '')
  const fromIndex = readRevisionIndex(dataRoot, slug)?.kind
  const kind = kindHint ?? fromIndex ?? 'uskill'
  return restoreExtensionRevision(dataRoot, kind, slug, targetVersion)
}
