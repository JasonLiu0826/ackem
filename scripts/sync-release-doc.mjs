#!/usr/bin/env node
/**
 * 将 Ackem 全部开源/用户/开发者文档同步到绿色版目录（Ackem-*-win-x64/）。
 * 发版后用户上传/打包的就是该文件夹；后期 npm run dist:green 会自动刷新。
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const releaseRoot = join(root, 'dist', 'release')
const legacyDocArchive = join(releaseRoot, 'doc')
const appVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).version

const ROOT_FILES = [
  'LICENSE',
  'CLA.md',
  'NOTICE.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'SECURITY.zh.md',
  'CONTRIBUTING.md',
  'CONTRIBUTING.zh.md',
  'CONTRIBUTORS.md',
  'CONTRIBUTORS.zh.md',
  'CODE_OF_CONDUCT.md',
  'CODE_OF_CONDUCT.zh.md',
]

const SOURCE_PROTOCOLS = [
  ['src/main/extensions/openforu/PROTOCOL.md', 'developer/openforu-PROTOCOL.md'],
  ['src/main/extensions/README.md', 'developer/extensions-README.md'],
]

const GITHUB_FILES = [
  ['.github/cla.yml', 'github/cla.yml'],
  ['.github/PULL_REQUEST_TEMPLATE.md', 'github/PULL_REQUEST_TEMPLATE.md'],
  ['.github/ISSUE_TEMPLATE/bug_report.md', 'github/ISSUE_TEMPLATE/bug_report.md'],
  ['.github/ISSUE_TEMPLATE/feature_request.md', 'github/ISSUE_TEMPLATE/feature_request.md'],
  ['.github/workflows/ci.yml', 'github/workflows/ci.yml'],
]

const GREEN_README_ZH_HEADER = `# Ackem

**Ackem v${appVersion}** — 本地优先的 AI 伙伴与任务协调应用，使用 AckemCode 通用智能体内核（本文件夹为便携绿色版）。

> **用法**：双击 \`Ackem.exe\` 或 \`启动 Ackem.bat\`；详见 [START.txt](./START.txt)  
> **个人数据**：首次运行后在 **exe 同级的 \`data/\`** 生成（勿随 zip 分享你的 data 文件夹）  
> **文档索引**：[docs/INDEX.md](./docs/INDEX.md) · 源码仓库：[JasonLiu0826/Ackem](https://github.com/JasonLiu0826/Ackem)

English: [README.en.md](./README.en.md) · 用户文档：[使用指南](./docs/usage.zh.md)

`

const GREEN_README_EN_HEADER = `# Ackem

**Ackem v${appVersion}** — A local-first AI companion and task coordinator using the AckemCode general-purpose agent kernel (portable build).

> **Run**: double-click \`Ackem.exe\` or \`启动 Ackem.bat\`; see [START.txt](./START.txt)  
> **Your data**: created on first run in \`data/\` next to the exe (never share your \`data/\` folder in a zip)  
> **Doc index**: [docs/INDEX.md](./docs/INDEX.md) · Source: [JasonLiu0826/Ackem](https://github.com/JasonLiu0826/Ackem)

中文说明：[README.md](./README.md)

`

function copyFile(srcRel, destAbs) {
  const src = join(root, srcRel)
  if (!existsSync(src)) {
    console.warn('skip (missing):', srcRel)
    return false
  }
  mkdirSync(dirname(destAbs), { recursive: true })
  cpSync(src, destAbs)
  return true
}

function listMdFiles(dir, base = dir) {
  const items = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) items.push(...listMdFiles(p, base))
    else if (/\.(md|txt|yml)$/i.test(name) || name === 'LICENSE') {
      items.push(relative(base, p).replace(/\\/g, '/'))
    }
  }
  return items.sort()
}

/** 去掉便携模式试跑产生的 data/（含记忆、对话、日志） */
export function stripShippedUserData(targetDir) {
  const dataDir = join(targetDir, 'data')
  if (!existsSync(dataDir)) return
  console.warn('Removing local data/ from release folder (must not ship):', dataDir)
  rmSync(dataDir, { recursive: true, force: true })
}

export function findGreenReleaseDir(explicit) {
  if (explicit) return explicit
  if (!existsSync(releaseRoot)) return null
  const dirs = readdirSync(releaseRoot)
    .filter((n) => /^Ackem-.*-win-x64$/.test(n))
    .sort()
    .reverse()
  return dirs.length ? join(releaseRoot, dirs[0]) : null
}

function ensureAgplFile() {
  const agpl = join(root, 'legal', 'AGPL-3.0.txt')
  if (existsSync(agpl) && statSync(agpl).size > 10_000) return agpl
  throw new Error(
    `Missing ${agpl} — run: curl -o legal/AGPL-3.0.txt https://www.gnu.org/licenses/agpl-3.0.txt`
  )
}

function adaptReadmeForGreen(srcPath, header, dropUntilSection = '## 项目介绍') {
  let body = readFileSync(srcPath, 'utf-8')
  const idx = body.indexOf(dropUntilSection)
  if (idx >= 0) body = body.slice(idx)
  body = body
    .replace(
      /> \*\*代码库位置\*\*：[\s\S]*?\n\n/,
      ''
    )
    .replace(
      /English README: \[README\.md\]\(\.\/README\.md\)[^\n]*\n/,
      ''
    )
    .replace(/^# [^\n]*\r?\n+/, '')
  return header + body
}

function fixMarkdownLinksInTree(baseDir) {
  const copies = new Map([
    ...SOURCE_PROTOCOLS.map(([source, destination]) => ['docs/' + destination, source]),
    ...GITHUB_FILES.map(([source, destination]) => ['docs/' + destination, source]),
    ['README.md', 'README.md'],
    ['README.en.md', 'README.en.md'],
  ])
  const destinations = new Map([...copies].map(([destination, source]) => [resolve(root, source), destination]))
  for (const rel of listMdFiles(baseDir)) {
    const abs = join(baseDir, rel)
    let text = readFileSync(abs, 'utf-8')
    // These files are generated for the release rather than copied from source.
    if (rel === 'START.txt' || rel === 'docs/INDEX.md' || rel.startsWith('docs/maintainer/')) continue
    const source = resolve(root, copies.get(rel) ?? rel)
    const rewrite = (href) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return href
      const [, pathname, suffix] = href.match(/^([^#?]*)(.*)$/)
      if (!pathname) return href
      const target = resolve(dirname(source), decodeURIComponent(pathname))
      const fromRoot = relative(root, target).replace(/\\/g, '/')
      if (fromRoot.startsWith('../')) return href
      const destination = destinations.get(target) ?? fromRoot
      const packaged = resolve(baseDir, destination)
      if (existsSync(packaged)) return relative(dirname(abs), packaged).replace(/\\/g, '/') + suffix
      return 'https://github.com/JasonLiu0826/ackem/' + (existsSync(target) && statSync(target).isDirectory() ? 'tree/' : 'blob/') + 'main/' + fromRoot.split('/').map(encodeURIComponent).join('/') + suffix
    }
    // Do not rewrite illustrative paths inside fenced code blocks.
    text = text.split(/(^```[^\n]*\r?\n[\s\S]*?^```[^\n]*(?:\r?\n|$))/gm)
      .map((part, index) => index % 2 ? part : part
        .replace(/(!?\[[^\]\n]*\]\()([^)]*)(\))/g, (_, before, href, after) => before + rewrite(href) + after)
        .replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (_, before, href, after) => before + rewrite(href) + after))
      .join('')
    writeFileSync(abs, text, 'utf-8')
  }
}

function writeStartTxt(greenDir) {
  const txt = `Ackem ${appVersion} — 便携绿色版

用法：
  1. 将整个文件夹放在任意位置（建议 SSD，勿放同步盘根目录）
  2. 双击 Ackem.exe，或双击「启动 Ackem.bat」
  3. 首次启动约 10–30 秒；数据保存在 .\\data\\

文档与协议（本文件夹内）：
  - README.md / README.en.md — 项目介绍
  - docs\\INDEX.md — 全部用户/开发者文档索引
  - LICENSE / LICENSE-AGPL-3.0.txt — 开源与商业授权说明
  - NOTICE.md · SECURITY.md · CONTRIBUTING.md 等

若双击后「没反应」：
  - 请看任务栏右下角系统托盘，Ackem 可能已在后台运行
  - 首次启动会加载 embedding 模型，请等待 30 秒再判断
  - 务必完整解压 zip 后再运行，不要直接在 zip 里双击 exe

分享 zip 前请注意：
  - 解压一次即可，每次启动无需再解压
  - 首次运行会自动创建空的 .\\data\\
  - 切勿把个人 data 文件夹打进 zip 再分享（含对话、记忆、API Key）
  - 卸载：运行 Uninstall Ackem.bat，或在 Ackem 设置 → 其他 → 卸载
`
  writeFileSync(join(greenDir, 'START.txt'), txt, 'utf-8')
}

function writeDocsIndex(greenDir, fileCount) {
  const today = new Date().toISOString().slice(0, 10)
  const index = `# Ackem 文档索引

> **版本**：Ackem v${appVersion} · **更新**：${today}

当前文档按六类阅读；模块旁的说明与角色语料按需查阅。

| 类别 | 文档 |
|---|---|
| README | [项目与快速开始](../README.md) · [English](../README.en.md) |
| 使用指南 | [中文](./usage.zh.md) · [English](./usage.md) |
| 架构说明 | [中文](./architecture.zh.md) · [English](./architecture.md) |
| 开发指南 | [中文](./development.zh.md) · [English](./development.md) |
| 模块参考 | [中文](./modules.zh.md) · [English](./modules.md) |
| 记忆、性格情绪与时间引擎 | [中文](./companion-engines.zh.md) · [English](./companion-engines.md) |

[文档导航](./README.md) · [图表](./diagrams/README.md) · [贡献](../CONTRIBUTING.zh.md)

历史文档与本地设计、审计记录不随包分发。需要追溯时查看[仓库归档](https://github.com/JasonLiu0826/ackem/tree/main/docs/%E6%97%A7%E6%96%87%E6%A1%A3)。

本次同步 ${fileCount} 份文档和协议文件；用户无需逐份阅读。
`
  writeFileSync(join(greenDir, 'docs', 'INDEX.md'), index, 'utf-8')
}

/**
 * @param {string} [greenDir] 绝对路径；省略则自动找 dist/release/Ackem-*-win-x64
 */
export function syncGreenReleaseDocs(greenDir) {
  const target = findGreenReleaseDir(greenDir)
  if (!target || !existsSync(target)) {
    throw new Error(
      `Green release folder not found under ${releaseRoot}. Build first: npm run dist:green`
    )
  }

  console.log('Syncing docs →', target)

  stripShippedUserData(target)

  const resDocs = join(target, 'resources', 'docs')
  if (existsSync(resDocs)) {
    console.log('Removing duplicate resources/docs/ (canonical copy is ./docs/)')
    rmSync(resDocs, { recursive: true, force: true })
  }

  const docsDest = join(target, 'docs')
  if (existsSync(docsDest)) rmSync(docsDest, { recursive: true, force: true })
  const sourceDocs = join(root, 'docs')
  cpSync(sourceDocs, docsDest, {
    recursive: true,
    filter: (source) => {
      const rel = relative(sourceDocs, source).split(sep).join('/')
      return rel !== '旧文档' && !rel.startsWith('旧文档/')
    },
  })

  for (const [src, dest] of SOURCE_PROTOCOLS) {
    copyFile(src, join(docsDest, dest))
  }

  const githubDir = join(docsDest, 'github')
  for (const [src, dest] of GITHUB_FILES) {
    copyFile(src, join(docsDest, dest))
  }

  for (const f of ROOT_FILES) {
    copyFile(f, join(target, f))
  }

  const licenseTxtSrc = join(root, 'dist', 'LICENSE.txt')
  if (existsSync(licenseTxtSrc)) {
    cpSync(licenseTxtSrc, join(target, 'LICENSE.txt'))
  } else {
    cpSync(join(root, 'LICENSE'), join(target, 'LICENSE.txt'))
  }

  const agpl = ensureAgplFile()
  cpSync(agpl, join(target, 'LICENSE-AGPL-3.0.txt'))

  if (existsSync(join(root, 'README.md'))) {
    writeFileSync(
      join(target, 'README.md'),
      adaptReadmeForGreen(join(root, 'README.md'), GREEN_README_ZH_HEADER),
      'utf-8'
    )
  }
  if (existsSync(join(root, 'README.en.md'))) {
    writeFileSync(
      join(target, 'README.en.md'),
      adaptReadmeForGreen(join(root, 'README.en.md'), GREEN_README_EN_HEADER, '## What is Ackem?'),
      'utf-8'
    )
  }

  writeStartTxt(target)
  fixMarkdownLinksInTree(target)

  const files = listMdFiles(target).filter((f) => !f.includes('resources/'))
  writeDocsIndex(target, files.length + 1)
  console.log('Synced', files.length + 1, 'doc files into green folder')
  return target
}

/** @deprecated 仅保留别名；文档现以绿色版目录为唯一交付位置 */
export function syncReleaseDoc(greenDir) {
  const target = syncGreenReleaseDocs(greenDir)

  if (existsSync(legacyDocArchive)) {
    try {
      rmSync(legacyDocArchive, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
      console.log('Removed legacy dist/release/doc/ (use green folder docs only)')
    } catch (e) {
      console.warn('Could not remove legacy dist/release/doc/ (folder in use):', e.message)
    }
  }

  return target
}

const isMain =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const arg = process.argv[2]
  syncReleaseDoc(arg ? arg : undefined)
}
