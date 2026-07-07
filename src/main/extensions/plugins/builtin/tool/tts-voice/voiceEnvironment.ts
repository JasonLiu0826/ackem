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
      message: '宸蹭娇鐢?Ackem 鍐呯疆 Python锛堥殢瀹夎鍖呴檮甯︼紝鏃犻渶鍗曠嫭瀹夎锛?
    }
  } else {
    const system = resolvePythonLaunchSpec()
    if (probePythonSpec(system)) {
      python = {
        ok: true,
        source: 'system',
        path: [system.command, ...system.argsPrefix].join(' '),
        version: await readPythonVersion(system),
        message: '宸叉娴嬪埌鏈満 Python锛堝皢鐢ㄤ簬璇煶鏈嶅姟锛?
      }
    } else {
      python = {
        ok: false,
        source: 'missing',
        message:
          platform() === 'win32'
            ? '鏈壘鍒?Python銆傚彲鐐瑰嚮涓嬫柟銆屼竴閿噯澶囪闊崇幆澧冦€嶏紝Ackem 浼氳嚜鍔ㄤ笅杞藉苟閰嶇疆锛堢害 300MB锛屼粎棣栨锛?
            : '鏈壘鍒?Python 3銆傝鍏堝畨瑁?Python 3.10+锛屾垨鑱旂郴鍙戣鐗堣幏鍙栧唴缃闊冲寘'
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
    summary = '璇煶鐜宸插氨缁紝鍙互鐩存帴浣跨敤'
  } else if (!scriptOk) {
    summary = '璇煶绋嬪簭鏂囦欢缂哄け锛岃閲嶆柊瀹夎 Ackem'
  } else if (!python.ok) {
    summary = '闇€瑕佸噯澶?Python 杩愯鐜锛堝彲涓€閿畬鎴愶級'
  } else if (!dependenciesOk) {
    summary = '闇€瑕佸畨瑁呰闊充緷璧栵紙鍙竴閿畬鎴愶紝绾?3鈥?0 鍒嗛挓锛?
  } else {
    summary = '渚濊禆宸插畨瑁咃紝璇煶鏈嶅姟鏈繍琛屸€斺€旇鐐瑰嚮銆屽惎鍔ㄨ闊虫湇鍔°€?
  }

  const detailParts: string[] = []
  if (!scriptOk) detailParts.push('server.py 缂哄け')
  if (!python.ok) detailParts.push('Python 鏈氨缁?)
  if (python.ok && !dependenciesOk) {
    detailParts.push(`缂哄皯渚濊禆: ${missingDependencies.join(', ')}`)
  }
  if (python.ok && dependenciesOk && !serviceRunning) {
    detailParts.push('鏈嶅姟杩涚▼鏈惎鍔?)
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
    detail: detailParts.join(' 路 ')
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
    onLog('鍐呯疆 Python 宸插瓨鍦紝璺宠繃涓嬭浇')
    return true
  }

  const ps1 = getVoicePackageScriptPath()
  if (!existsSync(ps1)) {
    onLog('鏈壘鍒?package-python.ps1锛屽皢灏濊瘯鐢ㄦ湰鏈?Python 瀹夎渚濊禆')
    return false
  }

  onLog('姝ｅ湪涓嬭浇骞堕厤缃唴缃?Python锛堥娆＄害 300MB锛岃鑰愬績绛夊緟锛夆€?)
  const result = await runProcessWithLogs(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
    getVoiceServiceRoot(),
    onLog
  )
  if (!result.ok) {
    onLog('鍐呯疆 Python 閰嶇疆澶辫触')
    return false
  }

  return Boolean(getBundledPythonExe() && probePythonSpec(bundledSpec()!))
}

async function pipInstallRequirements(spec: PythonLaunchSpec, onLog: (line: string) => void): Promise<boolean> {
  const req = getVoiceRequirementsPath()
  if (!existsSync(req)) {
    onLog('requirements.txt 鏈壘鍒?)
    return false
  }

  onLog('姝ｅ湪瀹夎璇煶渚濊禆锛坒aster-whisper銆乪dge-tts 绛夛級鈥?)
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

  log('prepare', '寮€濮嬪噯澶囪闊崇幆澧冣€?)

  if (!existsSync(getVoiceServiceScriptPath())) {
    return { ok: false, error: '璇煶绋嬪簭鏂囦欢缂哄け锛岃閲嶆柊瀹夎 Ackem' }
  }

  let spec = bundledSpec()
  if (!spec || !probePythonSpec(spec)) {
    const system = resolvePythonLaunchSpec()
    if (probePythonSpec(system)) {
      spec = system
      log('prepare', '浣跨敤鏈満 Python 瀹夎渚濊禆')
    } else if (platform() === 'win32') {
      log('embed', '鏈満鏃?Python锛屽紑濮嬮厤缃唴缃幆澧冣€?)
      const embedded = await ensureEmbeddedPython((line) => log('embed', line))
      spec = bundledSpec()
      if (!embedded || !spec || !probePythonSpec(spec)) {
        return {
          ok: false,
          error: '鏃犳硶閰嶇疆 Python銆傝妫€鏌ョ綉缁滆繛鎺ュ悗閲嶈瘯锛屾垨鎵嬪姩瀹夎 Python 3.11+'
        }
      }
      log('embed', '鍐呯疆 Python 閰嶇疆瀹屾垚')
    } else {
      return { ok: false, error: '鏈壘鍒?Python 3锛岃鍏堝畨瑁?Python 3.10 鎴栨洿楂樼増鏈? }
    }
  } else {
    log('prepare', '浣跨敤 Ackem 鍐呯疆 Python')
  }

  const deps = await checkDependencies(spec)
  if (!deps.ok) {
    const pipOk = await pipInstallRequirements(spec, (line) => log('pip', line))
    if (!pipOk) {
      return { ok: false, error: '渚濊禆瀹夎澶辫触銆傝妫€鏌ョ綉缁滃悗閲嶈瘯' }
    }
    const recheck = await checkDependencies(spec)
    if (!recheck.ok) {
      return { ok: false, error: `浠嶇己灏戜緷璧? ${recheck.missing.join(', ')}` }
    }
    log('pip', '璇煶渚濊禆瀹夎瀹屾垚')
  } else {
    log('pip', '璇煶渚濊禆宸查綈鍏紝璺宠繃瀹夎')
  }

  log('done', '姝ｅ湪鍚姩璇煶鏈嶅姟鈥?)
  const started = await voiceService.restart({ ttsEngine: voiceManager.runtimeConfig.ttsEngine })
  if (!started) {
    const err = voiceService.lastError ?? '璇煶鏈嶅姟鍚姩澶辫触'
    log('error', err)
    return { ok: false, error: err }
  }

  log('done', '璇煶鐜宸插氨缁?)
  return { ok: true }
}
