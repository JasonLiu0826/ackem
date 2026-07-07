import { execFile, execFileSync, spawn, type SpawnOptions } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { getBundledPythonExe, getVoiceServiceScriptPath } from './voicePaths'

export type PythonLaunchSpec = {
  command: string
  argsPrefix: string[]
}

/** Probe whether a Python executable responds. */
export function probePythonSpec(spec: PythonLaunchSpec): boolean {
  try {
    execFileSync(spec.command, [...spec.argsPrefix, '-c', 'import sys; print(sys.version)'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 12_000
    })
    return true
  } catch {
    return false
  }
}

/** Resolve system Python (not bundled). Electron PATH may differ from dev shell. */
export function resolvePythonLaunchSpec(): PythonLaunchSpec {
  const candidates: PythonLaunchSpec[] =
    process.platform === 'win32'
      ? [
          { command: 'py', argsPrefix: ['-3'] },
          { command: 'python', argsPrefix: [] },
          { command: 'python3', argsPrefix: [] }
        ]
      : [
          { command: 'python3', argsPrefix: [] },
          { command: 'python', argsPrefix: [] }
        ]

  for (const spec of candidates) {
    if (probePythonSpec(spec)) return spec
  }

  return { command: 'python', argsPrefix: [] }
}

/** Bundled first, then system Python. */
export function resolveVoicePythonLaunchSpec(): PythonLaunchSpec {
  const bundled = getBundledPythonExe()
  if (bundled) {
    const spec = { command: bundled, argsPrefix: [] }
    if (probePythonSpec(spec)) return spec
  }
  return resolvePythonLaunchSpec()
}

export function spawnPythonScript(
  spec: PythonLaunchSpec,
  scriptPath: string,
  scriptArgs: string[],
  options: SpawnOptions
) {
  return spawn(spec.command, [...spec.argsPrefix, scriptPath, ...scriptArgs], options)
}

export function runPythonCapture(
  spec: PythonLaunchSpec,
  ...args: string[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      spec.command,
      [...spec.argsPrefix, ...args],
      { windowsHide: true, maxBuffer: 2 * 1024 * 1024, timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message))
        else resolve(stdout)
      }
    )
  })
}

export function assertVoiceServiceScript(scriptPath?: string): void {
  const path = scriptPath ?? getVoiceServiceScriptPath()
  if (!existsSync(path)) {
    throw new Error(`璇煶绋嬪簭鏈壘鍒? ${path}銆傝閲嶆柊瀹夎 Ackem 鎴栬仈绯绘敮鎸併€俙)
  }
}

export function voiceServiceDirFromScript(scriptPath: string): string {
  return join(scriptPath, '..')
}
