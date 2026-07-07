import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/** Root of voice-service (dev: Ackem/voice-service, packaged: resources/voice-service). */
export function getVoiceServiceRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'voice-service')
    : join(app.getAppPath(), 'voice-service')
}

export function getVoiceServiceScriptPath(): string {
  return join(getVoiceServiceRoot(), 'server.py')
}

export function getVoiceRequirementsPath(): string {
  return join(getVoiceServiceRoot(), 'requirements.txt')
}

export function getVoicePackageScriptPath(): string {
  return join(getVoiceServiceRoot(), 'package-python.ps1')
}

export function getVoiceUserModelsDir(): string {
  const dir = join(app.getPath('userData'), 'voice-models', 'piper')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function getGptSovitsUserModelsDir(): string {
  const dir = join(app.getPath('userData'), 'voice-models', 'gpt-sovits')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function getGptSovitsHomeConfigPath(): string {
  const dir = join(app.getPath('userData'), 'voice-models')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'gpt-sovits-home.txt')
}

/** Bundled embedded Python (after package-python.ps1 or release build). */
export function getBundledPythonExe(): string | null {
  const root = getVoiceServiceRoot()
  if (process.platform === 'win32') {
    const win = join(root, 'python-embedded', 'python.exe')
    return existsSync(win) ? win : null
  }
  const unix = join(root, 'python-embedded', 'bin', 'python3')
  return existsSync(unix) ? unix : null
}
