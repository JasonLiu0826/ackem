import { spawn } from 'child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import type { ModelManager, SpeechModelManifest } from '../modelManifest'
import { catalogById, SPEECH_MODEL_CATALOG } from './catalog'
import { downloadFile } from './download'
import { sherpaActiveStatePath, sherpaModelsRoot, sherpaRuntimeRoot } from './workerPaths'

export type ModelLog = (line: string) => void

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkFiles(p, acc)
    else acc.push(p)
  }
  return acc
}

function hasAsrFiles(dir: string): boolean {
  const files = walkFiles(dir).map((p) => p.replace(/\\/g, '/').toLowerCase())
  const has = (re: RegExp) => files.some((f) => re.test(f))
  return has(/encoder.*\.onnx$/) && has(/decoder.*\.onnx$/) && has(/joiner.*\.onnx$/) && has(/tokens\.txt$/)
}

function hasVadFile(dir: string): boolean {
  return walkFiles(dir).some((p) => /silero_vad\.onnx$/i.test(p))
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, shell: process.platform === 'win32' })
    let err = ''
    child.stderr?.on('data', (b: Buffer) => {
      err += b.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(err.trim() || `${command} exited ${code}`))
    })
  })
}

export class SpeechModelManager implements ModelManager {
  constructor(private readonly log: ModelLog = () => undefined) {}

  modelsDir(): string {
    return sherpaModelsRoot()
  }

  async list(): Promise<SpeechModelManifest[]> {
    return SPEECH_MODEL_CATALOG
  }

  activeId(): string | null {
    try {
      const raw = JSON.parse(readFileSync(sherpaActiveStatePath(), 'utf8')) as { id?: string }
      return raw.id ?? null
    } catch {
      return null
    }
  }

  async activate(id: string): Promise<void> {
    if (!(await this.verify(id))) {
      throw new Error(`模型未就绪: ${id}`)
    }
    writeFileSync(sherpaActiveStatePath(), JSON.stringify({ id }, null, 2), 'utf8')
  }

  async delete(id: string): Promise<void> {
    const dir = join(this.modelsDir(), id)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    if (this.activeId() === id) {
      try {
        rmSync(sherpaActiveStatePath(), { force: true })
      } catch {
        // ignore
      }
    }
  }

  async verify(id: string): Promise<boolean> {
    const spec = catalogById(id)
    if (!spec) return false
    const dir = join(this.modelsDir(), id)
    if (spec.type === 'vad') return hasVadFile(dir)
    return hasAsrFiles(dir)
  }

  async verifyReady(modelId: string): Promise<boolean> {
    const vadOk = await this.verify('vad-silero')
    const asrOk = await this.verify(modelId)
    return vadOk && asrOk
  }

  runtimeModuleDir(): string {
    return join(sherpaRuntimeRoot(), 'node_modules')
  }

  runtimeHasSherpa(): boolean {
    return (
      existsSync(join(this.runtimeModuleDir(), 'sherpa-onnx-node')) ||
      existsSync(join(this.runtimeModuleDir(), 'sherpa-onnx'))
    )
  }

  async download(id: string): Promise<void> {
    const spec = catalogById(id)
    if (!spec) throw new Error(`未知模型: ${id}`)
    const destDir = join(this.modelsDir(), id)
    await mkdir(destDir, { recursive: true })
    if (await this.verify(id)) {
      this.log(`${id} 已存在，跳过下载`)
      return
    }

    for (const file of spec.files) {
      if (!file.url) throw new Error(`${id} 缺少下载地址`)
      const archive = join(destDir, file.name)
      this.log(`下载 ${id} …`)
      await downloadFile(file.url, archive, (p) => {
        if (p.total > 0) {
          const pct = Math.floor((p.received / p.total) * 100)
          if (pct % 10 === 0) this.log(`${id} ${pct}%`)
        }
      })
      if (/\.(tar\.bz2|tgz|tar\.gz)$/i.test(file.name)) {
        this.log(`解压 ${id} …`)
        await run('tar', ['-xf', archive, '-C', destDir], destDir)
        try {
          rmSync(archive, { force: true })
        } catch {
          // keep archive if delete fails
        }
      }
    }
    if (!(await this.verify(id))) {
      throw new Error(`${id} 下载后校验失败`)
    }
    this.log(`${id} 就绪`)
  }

  async ensureRuntime(nodeCommand: string): Promise<void> {
    if (this.runtimeHasSherpa()) {
      this.log('sherpa-onnx 运行时已安装')
      return
    }
    const root = sherpaRuntimeRoot()
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'ackem-voice-runtime', private: true }, null, 2),
      'utf8'
    )
    this.log('安装 sherpa-onnx-node（仅写入用户目录，不进仓库）…')
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    try {
      await run(npm, ['install', 'sherpa-onnx-node', '--omit=dev', '--no-fund', '--no-audit'], root)
    } catch {
      this.log('sherpa-onnx-node 安装失败，尝试 sherpa-onnx…')
      await run(npm, ['install', 'sherpa-onnx', '--omit=dev', '--no-fund', '--no-audit'], root)
    }
    if (!this.runtimeHasSherpa()) {
      throw new Error(`无法安装 sherpa-onnx（node=${nodeCommand}）`)
    }
  }
}

export const speechModelManager = new SpeechModelManager()
