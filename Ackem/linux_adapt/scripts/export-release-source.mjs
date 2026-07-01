#!/usr/bin/env node
/**
 * 导出 Ackem 干净发行源码 → ../Ackem-v0.0.0
 * 排除：测试、文档、开发产物、用户 data
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(scriptDir, '..')
const destRoot = join(srcRoot, '..', 'Ackem-v0.0.0')

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'out',
  'dist',
  'dist-build',
  'data',
  'docs',
  '.test-cache',
  '.scratch',
  'fixtures',
  'coverage',
  '.git',
  '.github',
  '.claude',
  '__fixtures__',
])

const SKIP_FILE_PATTERNS = [
  /\.test\.ts$/,
  /\.llm\.test\.ts$/,
  /\.llm\.journey\.test\.ts$/,
  /\.llm\.smoke\.test\.ts$/,
  /\.integration\.test\.ts$/,
  /\.machine\.test\.ts$/,
  /\.e2e\.test\.ts$/,
  /^vitest\./,
  /^test-.*\.log$/,
  /^.*-report\.(log|json|md)$/,
  /^marathon-/,
  /^complex-dialogue-/,
  /^e2e-/,
  /^full-integration-/,
  /^llm-/,
  /^electron\.vite\.config\.\d+\.mjs$/,
]

function shouldSkipFile(name, relPath) {
  if (name.endsWith('.md')) return true
  if (name === 'LICENSE') return false
  if (relPath.startsWith('src/test' + '/') || relPath === 'src/test') return true
  for (const re of SKIP_FILE_PATTERNS) {
    if (re.test(name)) return true
  }
  return false
}

function copyTree(src, dest, rel = '') {
  const st = statSync(src)
  if (st.isFile()) {
    const name = relative(srcRoot, src).split(/[/\\]/).pop() ?? ''
    const relPath = rel.replace(/\\/g, '/')
    if (shouldSkipFile(name, relPath)) return
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(src, dest)
    return
  }

  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue
      if (entry.name === 'test' && rel.replace(/\\/g, '/').startsWith('src/')) continue
      copyTree(join(src, entry.name), join(dest, entry.name), join(rel, entry.name))
    } else if (entry.isFile()) {
      const relPath = join(rel, entry.name).replace(/\\/g, '/')
      if (shouldSkipFile(entry.name, relPath)) continue
      cpSync(join(src, entry.name), join(dest, entry.name))
    }
  }
}

function patchPackageJson() {
  const pkgPath = join(destRoot, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  pkg.version = '0.0.0'
  pkg.private = false
  pkg.scripts = {
    dev: 'electron-vite dev',
    'dev:win': 'set NODE_OPTIONS=--max-old-space-size=8192 && electron-vite dev',
    build: 'set NODE_OPTIONS=--max-old-space-size=8192 && electron-vite build',
    preview: 'electron-vite preview',
    typecheck: 'npm run typecheck:web',
    'typecheck:web': 'tsc --noEmit -p tsconfig.web.json',
    'prepare:embedding-models': 'node scripts/download-embedding-models.mjs',
    'dist:green': 'node scripts/build-green-release.mjs',
    'dist:setup': 'npm run build && electron-builder --config electron-builder.yml --win nsis',
    postinstall: 'electron-builder install-app-deps',
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
}

function writeBuildTxt() {
  writeFileSync(
    join(destRoot, 'BUILD.txt'),
    `Ackem v0.0.0 — Windows 发行构建

1. 安装 Node.js 22 LTS（仅构建时需要；最终用户无需 Node）
2. npm ci
3. npm run prepare:embedding-models
4. powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
5. npm run dist:green   → dist/Ackem-0.0.0-win-x64/ 与 .zip

用户：
- 解压 Ackem-0.0.0-win-x64.zip 一次
- 双击 Ackem.exe 或「启动 Ackem.bat」
- 首次约 10–30 秒；数据在 .\\data\\
`,
    'utf-8'
  )
}

function main() {
  console.log(`Exporting clean source:\n  from ${srcRoot}\n  to   ${destRoot}`)

  if (existsSync(destRoot)) {
    console.log('Removing existing destination…')
    rmSync(destRoot, { recursive: true, force: true })
  }

  const includeTop = [
    'src',
    'scripts',
    'resources',
    'assets',
    'build',
    'voice-service',
    'package.json',
    'package-lock.json',
    'electron-builder.yml',
    'electron.vite.config.ts',
    'tsconfig.json',
    'tsconfig.node.json',
    'tsconfig.web.json',
    'postcss.config.js',
    'tailwind.config.js',
    '.gitignore',
    '.npmrc',
    'LICENSE',
  ]

  mkdirSync(destRoot, { recursive: true })

  for (const item of includeTop) {
    const src = join(srcRoot, item)
    if (!existsSync(src)) {
      console.warn(`[skip] missing ${item}`)
      continue
    }
    const dest = join(destRoot, item)
    const st = statSync(src)
    if (st.isDirectory()) {
      if (item === 'scripts') {
        mkdirSync(dest, { recursive: true })
        for (const f of ['download-embedding-models.mjs', 'sync-icons.ps1', 'export-release-source.mjs']) {
          const s = join(src, f)
          if (existsSync(s)) cpSync(s, join(dest, f))
        }
      } else if (item === 'src') {
        copyTree(src, dest, 'src')
      } else {
        copyTree(src, dest, item)
      }
    } else {
      if (shouldSkipFile(item, item)) continue
      cpSync(src, dest)
    }
  }

  patchPackageJson()
  writeBuildTxt()

  console.log('\nDone. Clean release tree at:', destRoot)
}

main()
