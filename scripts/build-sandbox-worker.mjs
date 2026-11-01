#!/usr/bin/env node
/**
 * 单独编译 openforu sandbox worker。
 *
 * 为什么不用 electron-vite 的第二个 entry：
 *   两个 entry 会让 rollup 抽出共享 chunk，主进程变成 index.js + chunks/*.js。
 *   Electron 33（内置 Node 20）用 ESM 加载这些 chunk 时会崩在
 *   `cjsPreparseModuleExports` —— 表现为进程启动即静默退出。
 *   主进程必须保持单文件（与 v1.0.0 发行版一致：2.7MB 单 index.js）。
 *
 * 用法：node scripts/build-sandbox-worker.mjs
 * 产物：out/main/upluginSandboxWorker.js（getWorkerScriptPath 的 PREBUILT_NAME）
 */
import * as esbuild from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

await esbuild.build({
  entryPoints: [join(root, 'src/main/extensions/openforu/sandbox/workerEntry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  outfile: join(root, 'out/main/upluginSandboxWorker.js'),
  external: ['electron'],
  logLevel: 'info'
})

console.log('[build-sandbox-worker] out/main/upluginSandboxWorker.js 已生成')
