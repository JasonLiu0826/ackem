// [embedding/bootstrapBundledModels] — 启动时解压预装 zh/en 模型（FIX-012）
// 职责：首次启动把 resources/models/*.zip 解压到 dataRoot/models/，并激活 locale 默认模型

import { getLocale } from '../../i18n'
import { loadSettings, saveSettings } from '../../settings'
import { createLogger } from '../../logger'
import { app } from 'electron'
import {
  bundledModelZipExists,
  ensureModelExtracted,
  getModelState,
  seedDevExtractedModel,
  switchModel,
} from './modelManager'
import {
  BUNDLED_EMBEDDING_MODEL_IDS,
  type LocalModelId,
} from './types'

const log = createLogger('embedding-bootstrap')

export type BundledEmbeddingBootstrapResult = {
  ready: LocalModelId[]
  missing: LocalModelId[]
  zipPresent: LocalModelId[]
  activeModel: LocalModelId | 'none'
}

/** 幂等：解压全部预装模型，必要时写入默认 activeModel */
export function bootstrapBundledEmbeddingModels(dataRoot: string): BundledEmbeddingBootstrapResult {
  const ready: LocalModelId[] = []
  const missing: LocalModelId[] = []
  const zipPresent: LocalModelId[] = []

  for (const id of BUNDLED_EMBEDDING_MODEL_IDS) {
    if (bundledModelZipExists(id)) zipPresent.push(id)
    seedDevExtractedModel(id, dataRoot)
    const extracted = ensureModelExtracted(id, dataRoot)
    if (extracted) ready.push(id)
    else missing.push(id)
  }

  const settings = loadSettings()
  const localeDefault: LocalModelId = getLocale() === 'en' ? 'bge-small-en' : 'bge-small-zh'
  const preferred = (settings.embeddingActiveModel ?? localeDefault) as LocalModelId | 'none'

  let activeModel: LocalModelId | 'none' = getModelState(dataRoot).activeModel

  if (activeModel === 'none' && ready.length > 0) {
    const target =
      preferred !== 'none' && ready.includes(preferred as LocalModelId)
        ? (preferred as LocalModelId)
        : ready.includes(localeDefault)
          ? localeDefault
          : ready[0]!
    switchModel(target, dataRoot)
    if (!settings.embeddingActiveModel) {
      saveSettings({ embeddingActiveModel: target })
    }
    activeModel = target
  }

  return { ready, missing, zipPresent, activeModel }
}

/** 打包版：缺失模型时尝试在线下载（首次启动友好） */
export async function bootstrapBundledEmbeddingModelsAsync(
  dataRoot: string
): Promise<BundledEmbeddingBootstrapResult> {
  let result = bootstrapBundledEmbeddingModels(dataRoot)
  if (!app.isPackaged || result.missing.length === 0) return result

  const { downloadModel } = await import('./modelManager.js')
  for (const id of [...result.missing]) {
    log.info('attempting online download for bundled model', { model: id })
    const dl = await downloadModel(id, dataRoot, () => {})
    if (dl.ok) {
      result = bootstrapBundledEmbeddingModels(dataRoot)
    } else {
      log.warn('model download failed', { model: id, error: dl.error })
    }
  }
  return result
}
