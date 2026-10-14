import { TIER_TO_MODEL_ID } from './catalog'
import { SpeechModelManager } from './modelManager'
import { resolveWorkerNode } from './resolveNode'

export async function installSherpaStack(onLog: (line: string) => void): Promise<void> {
  const modelId = TIER_TO_MODEL_ID.standard
  const mgr = new SpeechModelManager(onLog)
  const node = resolveWorkerNode()
  onLog(`使用 Node: ${node}`)
  await mgr.ensureRuntime(node)
  await mgr.download('vad-silero')
  await mgr.download(modelId)
  await mgr.activate(modelId)
}
