import { TIER_TO_MODEL_ID } from './sherpa/catalog'
import { installSherpaStack } from './sherpa/installSherpa'
import { speechModelManager } from './sherpa/modelManager'
import { voiceManager } from './voiceManager'

const STANDARD_MODEL_ID = TIER_TO_MODEL_ID.standard

export type VoiceEnvReport = {
  ready: boolean
  canAutoInstall: boolean
  summary: string
  detail: string
  sherpaReady: boolean
  sherpaModelId: string | null
  sherpaMessage: string
}

export type InstallProgress = {
  phase: 'prepare' | 'sherpa' | 'done' | 'error'
  line: string
}

export async function checkVoiceEnvironment(): Promise<VoiceEnvReport> {
  const sherpaReady =
    speechModelManager.runtimeHasSherpa() && (await speechModelManager.verifyReady(STANDARD_MODEL_ID))
  if (sherpaReady && speechModelManager.activeId() !== STANDARD_MODEL_ID) {
    await speechModelManager.activate(STANDARD_MODEL_ID)
  }
  return {
    ready: sherpaReady,
    canAutoInstall: true,
    summary: sherpaReady
      ? '标准档识别已就绪，可断网说话'
      : '需要下载标准档识别模型（sherpa-onnx）',
    detail: sherpaReady ? `模型 ${STANDARD_MODEL_ID}` : '未安装运行时或标准档模型',
    sherpaReady,
    sherpaModelId: sherpaReady ? STANDARD_MODEL_ID : speechModelManager.activeId(),
    sherpaMessage: sherpaReady ? `标准档 ${STANDARD_MODEL_ID} 已就绪` : '未下载标准档模型或运行时'
  }
}

export async function installVoiceEnvironment(onLog: (p: InstallProgress) => void): Promise<{
  ok: boolean
  error?: string
}> {
  const log = (phase: InstallProgress['phase'], line: string) => onLog({ phase, line })
  log('prepare', '准备标准档识别（模型写入用户目录，不进仓库）…')
  try {
    await installSherpaStack((line) => log('sherpa', line))
    await voiceManager.disposeRecognizer()
    log('done', '标准档已就绪，识别进程将按新模型拉起')
    if (voiceManager.runtimeConfig.enabled) {
      voiceManager.applySettings({ enabled: true })
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log('error', message)
    return { ok: false, error: message }
  }
}
