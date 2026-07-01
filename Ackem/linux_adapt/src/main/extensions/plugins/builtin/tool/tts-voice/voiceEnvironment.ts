import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { platform } from 'os'
import {
  getBundledPythonExe,
  getVoicePackageScriptPath,
  getVoiceRequirementsPath,
  getVoiceServiceRoot,
  getVoiceServiceScriptPath
} from './voicePaths'
import {
  probePythonSpec,
  resolvePythonLaunchSpec,
  runPythonCapture,
  type PythonLaunchSpec
} from './pythonResolve'
import { voiceService } from './pythonService'
import { voiceManager } from './voiceManager'

const VOICE_DEPS = [
  'fastapi',
  'uvicorn',
  'faster_whisper',
  'edge_tts',
  'numpy',
  'soundfile',
  'pydantic',
  'opencc',
  'piper',
  ...(platform() === 'win32' ? (['pyttsx3', 'winrt'] as const) : [])
] as const

export type VoiceEnvPython = {
  ok: boolean
  source: 'bundled' | 'system' | 'missing'
  path?: string
  version?: string
  message: string
}

export type VoiceEnvReport = {
  ready: boolean
  python: VoiceEnvPython
  scriptOk: boolean
  scriptPath: string
  dependenciesOk: boolean
  missingDependencies: string[]
  serviceRunning: boolean
  canAutoInstall: boolean
  summary: string
  detail: string
}

export type InstallProgress = {
  phase: 'prepare' | 'embed' | 'pip' | 'done' | 'error'
  line: string
}

function bundledSpec(): PythonLaunchSpec | null {
  const exe = getBundledPythonExe()
  if (!exe) return null
  return { command: exe, argsPrefix: [] }
}

async function readPythonVersion(spec: PythonLaunchSpec): Promise<string | undefined> {
  try {
    const out = await runPythonCapture(spec, '-c', 'import sys; print(sys.version.split()[0])')
    return out.trim() || undefined
  } catch {
    return undefined
  }
}

async function checkDependencies(spec: PythonLaunchSpec): Promise<{ ok: boolean; missing: string[] }> {
  const imports = VOICE_DEPS.join(', ')
  try {
    await runPythonCapture(
      spec,
      '-c',
      `import ${imports}; print("ok")`
    )
    return { ok: true, missing: [] }
  } catch {
    const missing: string[] = []
    for (const mod of VOICE_DEPS) {
      try {
        await runPythonCapture(spec, '-c', `import ${mod}`)
      } catch {
        missing.push(mod)
      }
    }
    return { ok: missing.length === 0, missing }
  }
}

export async function checkVoiceEnvironment(): Promise<VoiceEnvReport> {
  const scriptPath = getVoiceServiceScriptPath()
  const scriptOk = existsSync(scriptPath)

  const bundled = bundledSpec()
  let python: VoiceEnvPython

  if (bundled && probePythonSpec(bundled)) {
    python = {
      ok: true,
      source: 'bundled',
      path: bundled.command,
      version: await readPythonVersion(bundled),
      message: '已使用 Ackem 内置 Python（随安装包附带，无需单独安装）'
    }
  } else {
    const system = resolvePythonLaunchSpec()
    if (probePythonSpec(system)) {
      python = {
        ok: true,
        source: 'system',
        path: [system.command, ...system.argsPrefix].join(' '),
        version: await readPythonVersion(system),
        message: '已检测到本机 Python（将用于语音服务）'
      }
    } else {
      python = {
        ok: false,
        source: 'missing',
        message:
          platform() === 'win32'
            ? '未找到 Python。可点击下方「一键准备语音环境」，Ackem 会自动下载并配置（约 300MB，仅首次）'
            : '未找到 Python 3。请先安装 Python 3.10+，或联系发行版获取内置语音包'
      }
    }
  }

  let dependenciesOk = false
  let missingDependencies: string[] = VOICE_DEPS.slice()
  if (python.ok) {
    const spec = bundled ?? resolvePythonLaunchSpec()
    const dep = await checkDependencies(spec)
    dependenciesOk = dep.ok
    missingDependencies = dep.missing
  }

  const health = python.ok && dependenciesOk ? await voiceService.health() : null
  const serviceRunning = Boolean(health?.asr_ready)

  const ready = scriptOk && python.ok && dependenciesOk && serviceRunning

  let summary: string
  if (ready) {
    summary = '语音环境已就绪，可以直接使用'
  } else if (!scriptOk) {
    summary = '语音程序文件缺失，请重新安装 Ackem'
  } else if (!python.ok) {
    summary = '需要准备 Python 运行环境（可一键完成）'
  } else if (!dependenciesOk) {
    summary = '需要安装语音依赖（可一键完成，约 3–10 分钟）'
  } else {
    summary = '依赖已安装，语音服务未运行——请点击「启动语音服务」'
  }

  const detailParts: string[] = []
  if (!scriptOk) detailParts.push('server.py 缺失')
  if (!python.ok) detailParts.push('Python 未就绪')
  if (python.ok && !dependenciesOk) {
    detailParts.push(`缺少依赖: ${missingDependencies.join(', ')}`)
  }
  if (python.ok && dependenciesOk && !serviceRunning) {
    detailParts.push('服务进程未启动')
  }

  return {
    ready,
    python,
    scriptOk,
    scriptPath,
    dependenciesOk,
    missingDependencies,
    serviceRunning,
    canAutoInstall: scriptOk && platform() === 'win32',
    summary,
    detail: detailParts.join(' · ')
  }
}

function runProcessWithLogs(
  command: string,
  args: string[],
  cwd: string,
  onLog: (line: string) => void
): Promise<{ ok: boolean; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false
    })
    const push = (buf: Buffer) => {
      for (const line of buf.toString().split(/\r?\n/)) {
        const t = line.trim()
        if (t) onLog(t)
      }
    }
    proc.stdout?.on('data', push)
    proc.stderr?.on('data', push)
    proc.on('error', (err) => {
      onLog(String(err))
      resolve({ ok: false, code: null })
    })
    proc.on('close', (code) => resolve({ ok: code === 0, code }))
  })
}

async function ensureEmbeddedPython(onLog: (line: string) => void): Promise<boolean> {
  if (getBundledPythonExe() && probePythonSpec(bundledSpec()!)) {
    onLog('内置 Python 已存在，跳过下载')
    return true
  }

  const ps1 = getVoicePackageScriptPath()
  if (!existsSync(ps1)) {
    onLog('未找到 package-python.ps1，将尝试用本机 Python 安装依赖')
    return false
  }

  onLog('正在下载并配置内置 Python（首次约 300MB，请耐心等待）…')
  const result = await runProcessWithLogs(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
    getVoiceServiceRoot(),
    onLog
  )
  if (!result.ok) {
    onLog('内置 Python 配置失败')
    return false
  }

  return Boolean(getBundledPythonExe() && probePythonSpec(bundledSpec()!))
}

async function pipInstallRequirements(spec: PythonLaunchSpec, onLog: (line: string) => void): Promise<boolean> {
  const req = getVoiceRequirementsPath()
  if (!existsSync(req)) {
    onLog('requirements.txt 未找到')
    return false
  }

  onLog('正在安装语音依赖（faster-whisper、edge-tts 等）…')
  const result = await runProcessWithLogs(
    spec.command,
    [...spec.argsPrefix, '-m', 'pip', 'install', '-r', req],
    getVoiceServiceRoot(),
    onLog
  )
  return result.ok
}

/** One-click: embed Python (if needed) + pip install + restart service. */
export async function installVoiceEnvironment(onLog: (p: InstallProgress) => void): Promise<{
  ok: boolean
  error?: string
}> {
  const log = (phase: InstallProgress['phase'], line: string) => onLog({ phase, line })

  log('prepare', '开始准备语音环境…')

  if (!existsSync(getVoiceServiceScriptPath())) {
    return { ok: false, error: '语音程序文件缺失，请重新安装 Ackem' }
  }

  let spec = bundledSpec()
  if (!spec || !probePythonSpec(spec)) {
    const system = resolvePythonLaunchSpec()
    if (probePythonSpec(system)) {
      spec = system
      log('prepare', '使用本机 Python 安装依赖')
    } else if (platform() === 'win32') {
      log('embed', '本机无 Python，开始配置内置环境…')
      const embedded = await ensureEmbeddedPython((line) => log('embed', line))
      spec = bundledSpec()
      if (!embedded || !spec || !probePythonSpec(spec)) {
        return {
          ok: false,
          error: '无法配置 Python。请检查网络连接后重试，或手动安装 Python 3.11+'
        }
      }
      log('embed', '内置 Python 配置完成')
    } else {
      return { ok: false, error: '未找到 Python 3，请先安装 Python 3.10 或更高版本' }
    }
  } else {
    log('prepare', '使用 Ackem 内置 Python')
  }

  const deps = await checkDependencies(spec)
  if (!deps.ok) {
    const pipOk = await pipInstallRequirements(spec, (line) => log('pip', line))
    if (!pipOk) {
      return { ok: false, error: '依赖安装失败。请检查网络后重试' }
    }
    const recheck = await checkDependencies(spec)
    if (!recheck.ok) {
      return { ok: false, error: `仍缺少依赖: ${recheck.missing.join(', ')}` }
    }
    log('pip', '语音依赖安装完成')
  } else {
    log('pip', '语音依赖已齐全，跳过安装')
  }

  log('done', '正在启动语音服务…')
  const started = await voiceService.restart({ ttsEngine: voiceManager.runtimeConfig.ttsEngine })
  if (!started) {
    const err = voiceService.lastError ?? '语音服务启动失败'
    log('error', err)
    return { ok: false, error: err }
  }

  log('done', '语音环境已就绪')
  return { ok: true }
}
