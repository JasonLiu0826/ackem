#!/usr/bin/env node
/**
 * Ackem 开发一键启动器
 * - 解压/准备 embedding（data/models + .test-cache）
 * - 加载 .env.llm.local（LLM 实机测试）
 * - 设置 ACKEMCODE_ROOT=vendor/ackemcode，缺依赖则 npm ci
 * - 启动 electron-vite dev 或运行验收/冒烟脚本
 *
 * 用法:
 *   node scripts/start-ackem-dev.mjs              # 默认：准备 + 启动 dev
 *   node scripts/start-ackem-dev.mjs dev          # 同上
 *   node scripts/start-ackem-dev.mjs prepare      # 仅准备 embedding
 *   node scripts/start-ackem-dev.mjs llm-smoke    # LLM 冒烟
 *   node scripts/start-ackem-dev.mjs acceptance   # v1.1.0 验收（vitest）
 *   node scripts/start-ackem-dev.mjs test-llm     # vitest LLM 套件
 *   node scripts/start-ackem-dev.mjs menu         # 交互菜单
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import readline from 'node:readline'
import { ROOT, loadLlmLocalEnv } from './ackem-env.mjs'
import { prepareEmbeddingDev } from './prepare-embedding-dev.mjs'

const MODES = ['dev', 'prepare', 'llm-smoke', 'acceptance', 'test-llm', 'menu']

function log(section, msg) {
  console.log(`[Ackem/${section}] ${msg}`)
}

function ensureNodeModules() {
  if (existsSync(join(ROOT, 'node_modules'))) return true
  log('setup', '未找到 node_modules，正在 npm install …')
  const r = spawnSync('npm', ['install'], { cwd: ROOT, stdio: 'inherit', shell: true })
  return r.status === 0
}

function ensurePartDeps(dir) {
  if (existsSync(join(dir, 'node_modules', 'tsx'))) return true
  log('ackemcode', `${dir} 安装依赖（npm ci）…`)
  const r = spawnSync('npm', ['ci'], { cwd: dir, stdio: 'inherit', shell: true })
  return r.status === 0
}

function ensureVendorAckemCode() {
  const part = join(ROOT, 'parts', 'ackemcode')
  const vendor = join(ROOT, 'vendor', 'ackemcode')
  if (!existsSync(join(part, 'src', 'server', 'index.ts')) || !existsSync(join(part, 'src', 'client', 'App.tsx'))) {
    log('ackemcode', '未找到 parts/ackemcode，请先 npm run vendor:ackemcode')
    return false
  }
  if (!process.env.ACKEMCODE_ROOT) {
    process.env.ACKEMCODE_ROOT = part
  }
  if (!ensurePartDeps(part)) {
    log('ackemcode', 'parts 依赖安装失败，改用 vendor/ackemcode 的依赖')
    if (!ensurePartDeps(vendor)) return false
  }
  log('ackemcode', `ACKEMCODE_ROOT=${process.env.ACKEMCODE_ROOT}`)
  return true
}

function loadDevEnv() {
  const loaded = loadLlmLocalEnv()
  if (loaded) {
    log('env', '已加载 .env.llm.local')
    if (process.env.LLM_E2E_MODEL) log('env', `LLM 模型: ${process.env.LLM_E2E_MODEL}`)
  } else {
    log('env', '未找到 .env.llm.local（LLM 测试需手动设置环境变量，见 doc/LLM实机测试调用文档.md）')
  }
  process.env.ACKEM_DEV_LAUNCHER = '1'
  ensureVendorAckemCode()
}

function prepareEmbedding() {
  log('embedding', '检查并解压 embedding 模型 …')
  const result = prepareEmbeddingDev({ quiet: false })
  if (result.missing.length > 0) {
    log('embedding', `警告: 未就绪 → ${result.missing.join(', ')}（应用将尝试启动时解压或 TF-IDF 兜底）`)
  } else {
    log('embedding', `就绪: ${result.ready.join(', ')}`)
  }
  return result
}

function runNpm(script, extraArgs = []) {
  return spawn('npm', ['run', script, ...extraArgs], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
}

function runNode(scriptRel, extraArgs = []) {
  return spawn(process.execPath, [join(ROOT, scriptRel), ...extraArgs], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  })
}

async function runMode(mode) {
  if (mode === 'prepare') {
    prepareEmbedding()
    return 0
  }

  if (mode !== 'dev') {
    prepareEmbedding()
  } else {
    prepareEmbedding()
  }

  loadDevEnv()

  switch (mode) {
    case 'dev': {
      log('dev', '启动 Ackem（electron-vite dev）…')
      const child = process.platform === 'win32'
        ? runNpm('dev:win')
        : runNpm('dev')
      return new Promise((resolve) => {
        child.on('exit', (code) => resolve(code ?? 0))
      })
    }
    case 'llm-smoke': {
      log('test', 'LLM 实机冒烟 …')
      const child = runNode('scripts/llm-smoke.mjs')
      return new Promise((resolve) => {
        child.on('exit', (code) => resolve(code ?? 0))
      })
    }
    case 'acceptance': {
      log('test', 'v1.1.0 验收（vitest）…')
      const child = runNpm('test:v1.1.0:acceptance')
      return new Promise((resolve) => {
        child.on('exit', (code) => resolve(code ?? 0))
      })
    }
    case 'test-llm': {
      log('test', 'vitest LLM 套件（可能较慢）…')
      const child = runNpm('test:llm')
      return new Promise((resolve) => {
        child.on('exit', (code) => resolve(code ?? 0))
      })
    }
    default:
      return 1
  }
}

function printMenu() {
  console.log(`
╔══════════════════════════════════════════╗
║       Ackem 开发启动器 (v1.1.0)          ║
╠══════════════════════════════════════════╣
║  1. 启动 Ackem（解压 embedding + dev）   ║
║  2. 仅准备 embedding 模型                ║
║  3. LLM 实机冒烟 (llm-smoke)             ║
║  4. v1.1.0 验收测试                      ║
║  5. vitest LLM 全套                      ║
║  0. 退出                                 ║
╚══════════════════════════════════════════╝
`)
}

async function interactiveMenu() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q) => new Promise((res) => rl.question(q, res))

  printMenu()
  const choice = (await ask('请选择 [1]: ')).trim() || '1'
  rl.close()

  const map = {
    '1': 'dev',
    '2': 'prepare',
    '3': 'llm-smoke',
    '4': 'acceptance',
    '5': 'test-llm',
    '0': null,
  }
  return map[choice] ?? 'dev'
}

async function main() {
  const arg = (process.argv[2] ?? 'dev').toLowerCase()
  const mode = arg === 'menu' || arg === '-m' ? 'menu' : arg

  if (!ensureNodeModules()) {
    console.error('[Ackem] npm install 失败')
    process.exit(1)
  }

  let resolvedMode = mode
  if (mode === 'menu') {
    resolvedMode = await interactiveMenu()
    if (!resolvedMode) process.exit(0)
  } else if (!MODES.includes(resolvedMode) && resolvedMode !== 'help' && resolvedMode !== '-h') {
    console.error(`未知模式: ${resolvedMode}`)
    console.error(`可用: ${MODES.join(', ')}`)
    process.exit(1)
  }

  if (resolvedMode === 'help' || resolvedMode === '-h') {
    console.log(process.argv[1], MODES.join(' | '))
    process.exit(0)
  }

  const code = await runMode(resolvedMode)
  process.exit(code)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
