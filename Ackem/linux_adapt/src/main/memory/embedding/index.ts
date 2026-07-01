// [embedding/index] — 模块导出桶文件
// 外部只需 import { createEmbeddingProvider, ... } from './embedding'

export type {
  EmbeddingProvider,
  LocalModelId,
  ModelManifest,
  ModelState,
  RemoteEmbeddingConfig,
  EmbeddingProviderOptions
} from './types'

export {
  MODEL_MANIFESTS,
  getModelManifest
} from './types'

export {
  createEmbeddingProvider,
  getProviderStatus
} from './provider'

export {
  bootstrapBundledEmbeddingModels,
  type BundledEmbeddingBootstrapResult
} from './bootstrapBundledModels'

export {
  ensureModelExtracted,
  getModelState,
  saveModelState,
  switchModel,
  listModelStatus,
  cleanupModel,
  getActiveModelDir,
  downloadModel,
  cancelDownload
} from './modelManager'

export {
  isOnnxRuntimeAvailable,
  createOnnxProvider
} from './onnxProvider'
