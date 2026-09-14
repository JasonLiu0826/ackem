import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'

async function runCmd(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve({ code: 1, stdout, stderr: stderr + '\ntimeout' })
    }, timeoutMs)
    child.stdout?.on('data', (d) => {
      stdout += d.toString('utf8')
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString('utf8')
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: 1, stdout, stderr: e instanceof Error ? e.message : String(e) })
    })
  })
}

async function ocrTesseractCli(imagePath: string): Promise<string | null> {
  const langs = ['chi_sim+eng', 'eng']
  for (const lang of langs) {
    const r = await runCmd('tesseract', [imagePath, 'stdout', '-l', lang, '--psm', '6'], 60_000)
    if (r.code === 0 && r.stdout.trim()) return r.stdout
  }
  return null
}

let tessWorker: { recognize: (p: string) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> } | null =
  null
let tessTried = false

async function ocrTesseractJs(imagePath: string): Promise<string | null> {
  if (process.env.ACKEM_DISABLE_JS_OCR === '1') return null
  try {
    if (!tessTried) {
      tessTried = true
      const spec = 'tesseract.js'
      const mod = (await import(spec)) as {
        createWorker: (
          langs?: string,
          oem?: number,
          opts?: { cachePath?: string }
        ) => Promise<{
          recognize: (p: string) => Promise<{ data: { text: string } }>
          terminate: () => Promise<void>
        }>
      }
      const cachePath = path.join(homedir(), '.ackemcode', 'tessdata')
      tessWorker = await mod.createWorker('chi_sim+eng', 1, { cachePath })
    }
  } catch {
    tessTried = true
    tessWorker = null
  }
  if (!tessWorker) return null
  const { data } = await tessWorker.recognize(imagePath)
  return data.text || null
}

export async function ocrImageFile(imagePath: string): Promise<{ text: string; engine: string } | null> {
  const cli = await ocrTesseractCli(imagePath)
  if (cli?.trim()) return { text: cli, engine: 'tesseract' }
  const js = await ocrTesseractJs(imagePath)
  if (js?.trim()) return { text: js, engine: 'tesseract.js' }
  return null
}

export async function ocrImageFiles(
  imagePaths: string[]
): Promise<Array<{ path: string; text: string; engine: string } | { path: string; error: string }>> {
  const out: Array<{ path: string; text: string; engine: string } | { path: string; error: string }> =
    []
  for (const p of imagePaths) {
    try {
      const r = await ocrImageFile(p)
      if (r) out.push({ path: p, text: r.text, engine: r.engine })
      else out.push({ path: p, error: 'no OCR engine (install Tesseract or tesseract.js)' })
    } catch (e) {
      out.push({ path: p, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}
