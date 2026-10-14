import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export function sherpaModelsRoot(): string {
  const dir = join(app.getPath('userData'), 'ackem-models', 'sherpa')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function sherpaRuntimeRoot(): string {
  const dir = join(app.getPath('userData'), 'ackem-voice-runtime')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function sherpaActiveStatePath(): string {
  return join(sherpaModelsRoot(), 'active.json')
}

export function resolveWorkerScript(): string {
  const candidates = [
    join(process.resourcesPath, 'voice-sherpa', 'worker.cjs'),
    join(process.resourcesPath, 'resources', 'voice-sherpa', 'worker.cjs'),
    join(app.getAppPath(), 'src/main/extensions/plugins/builtin/tool/tts-voice/sherpa/worker.cjs'),
    join(app.getAppPath(), 'resources/voice-sherpa/worker.cjs')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[2]
}
