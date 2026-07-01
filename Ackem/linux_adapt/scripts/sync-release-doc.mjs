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
import { join, dirname, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const releaseRoot = join(root, 'dist', 'release')
const legacyDocArchive = join(releaseRoot, 'doc')

const ROOT_FILES = [
  'LICENSE',
  'CLA.md',
  'NOTICE.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'SECURITY.zh.md',
  'CONTRIBUTING.md',
  'CONTRIBUTING.zh.md',
  'CODE_OF_CONDUCT.md',
  'CODE_OF_CONDUCT.zh.md',
]

const DIST_MAINTAINER = [
  '开源文档索引.md',
  'GitHub仓库信息.md',
  '应用内合规文本.md',
  'README-许可证区块.md',
  '协议修订说明.md',
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

**Ackem v1.0.0** — 运行在你 Windows 电脑上的 AI 伴侣应用（本文件夹为便携绿色版）。

> **用法**：双击 \`Ackem.exe\` 或 \`启动 Ackem.bat\`；详见 [START.txt](./START.txt)  
> **个人数据**：首次运行后在 **exe 同级的 \`data/\`** 生成（勿随 zip 分享你的 data 文件夹）  
> **文档索引**：[docs/INDEX.md](./docs/INDEX.md) · 源码仓库：[JasonLiu0826/Ackem](https://github.com/JasonLiu0826/Ackem)

English: [README.en.md](./README.en.md) · 用户文档：[docs/privacy-and-data.zh.md](./docs/privacy-and-data.zh.md)

`

const GREEN_README_EN_HEADER = `# Ackem

**Ackem v1.0.0** — A local-first AI companion for Windows (portable green build in this folder).

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
    .replace(/\.\/README\.md/g, './README.en.md')
  return header + body
}

function fixMarkdownLinksInTree(baseDir) {
  const docsDir = join(baseDir, 'docs')
  for (const rel of listMdFiles(baseDir)) {
    const abs = join(baseDir, rel)
    let text = readFileSync(abs, 'utf-8')
    const inDocs = rel.startsWith('docs/') || rel.startsWith('docs\\')

    if (inDocs) {
      text = text.replace(/\]\(\.\/docs\/([^)]+)\)/g, '](./$1)')
      text = text.replace(
        /\[\.\.\/dist\/开源文档索引\.md\]\(\.\/maintainer\/开源文档索引\.md\)/g,
        '[./maintainer/开源文档索引.md](./maintainer/开源文档索引.md)'
      )
      text = text.replace(
        /\*\*绿色版\*\*：`dist\/release\/Ackem-[^`]+`/g,
        '**绿色版**：本文件夹（便携版根目录）'
      )
      text = text.replace(
        /\*\*源码仓库根\*\*：`Ackem-v0\.0\.0\/`（GitHub: JasonLiu0826\/Ackem）/g,
        '**源码仓库**：[JasonLiu0826/Ackem](https://github.com/JasonLiu0826/Ackem)'
      )
    }

    if (rel === 'docs/developer/extensions-README.md') {
      text = text.replace(
        /\]\(\.\.\/\.\.\/docs\/developer\//g,
        '](./'
      )
    }

    writeFileSync(abs, text, 'utf-8')
  }
}

function writeStartTxt(greenDir) {
  const txt = `Ackem 1.0.0 — 便携绿色版

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

> **版本**：Ackem v1.0.0 · **更新**：${today}  
> 本目录随绿色版分发；修改请至 [GitHub 源码仓库](https://github.com/JasonLiu0826/Ackem) 后重新打包。

---

## 快速入口（用户）

| 文档 | 说明 |
|------|------|
| [privacy-and-data.zh.md](./privacy-and-data.zh.md) | 隐私与数据落盘 |
| [distribution-windows.zh.md](./distribution-windows.zh.md) | Windows 绿色版说明 |
| [memory-format.zh.md](./memory-format.zh.md) | \`data/\` 目录结构 |
| [local-models-windows.zh.md](./local-models-windows.zh.md) | 本地 embedding 模型 |
| [adult-and-safety-policy.zh.md](./adult-and-safety-policy.zh.md) | 安全与 18+ 策略 |
| [sensitive-capabilities.zh.md](./sensitive-capabilities.zh.md) | 高敏能力说明 |
| [perception-layer.zh.md](./perception-layer.zh.md) | 感知层权限 |

English: [privacy-and-data.md](./privacy-and-data.md) · [distribution-windows.md](./distribution-windows.md)

---

## 开发者 / 贡献者

| 文档 | 说明 |
|------|------|
| [OPEN-SOURCE-DOC-MAP.md](./OPEN-SOURCE-DOC-MAP.md) | 文档总地图（维护者） |
| [developer/dev-setup.md](./developer/dev-setup.md) | 开发环境 |
| [developer/DEVELOPER-EXTENSION-PROTOCOL.md](./developer/DEVELOPER-EXTENSION-PROTOCOL.md) | 扩展协议 |
| [developer/extensions-README.md](./developer/extensions-README.md) | 扩展系统指南 |
| [developer/openforu-PROTOCOL.md](./developer/openforu-PROTOCOL.md) | OpenForU 协议 |
| [developer/architecture/](./developer/architecture/) | 六系统架构（10 篇） |
| [github/](./github/) | Issue/PR 模板与 CI 参考 |

仓库根目录还有 CONTRIBUTING、SECURITY、CLA — 见绿色版文件夹根目录。

---

## 维护者参考（随包附带）

| 文档 | 说明 |
|------|------|
| [maintainer/开源文档索引.md](./maintainer/开源文档索引.md) | dist 层协议索引 |
| [maintainer/GitHub仓库信息.md](./maintainer/GitHub仓库信息.md) | 推送 GitHub 清单 |
| [maintainer/应用内合规文本.md](./maintainer/应用内合规文本.md) | 应用内展示文案 |
| [maintainer/协议修订说明.md](./maintainer/协议修订说明.md) | 协议修订记录 |

---

## 全部文件（${fileCount}）

运行 \`npm run sync:release-doc\` 可从此仓库重新生成本目录。
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
  cpSync(join(root, 'docs'), docsDest, { recursive: true })

  for (const [src, dest] of SOURCE_PROTOCOLS) {
    copyFile(src, join(docsDest, dest))
  }

  const maintainerDir = join(docsDest, 'maintainer')
  mkdirSync(maintainerDir, { recursive: true })
  for (const f of DIST_MAINTAINER) {
    const src = join(root, 'dist', f)
    if (existsSync(src)) cpSync(src, join(maintainerDir, f))
    else console.warn('skip maintainer (missing):', f)
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

  if (existsSync(join(root, 'README.zh.md'))) {
    writeFileSync(
      join(target, 'README.md'),
      adaptReadmeForGreen(join(root, 'README.zh.md'), GREEN_README_ZH_HEADER),
      'utf-8'
    )
  }
  if (existsSync(join(root, 'README.md'))) {
    writeFileSync(
      join(target, 'README.en.md'),
      adaptReadmeForGreen(join(root, 'README.md'), GREEN_README_EN_HEADER, '## What is Ackem?'),
      'utf-8'
    )
  }

  writeStartTxt(target)
  fixMarkdownLinksInTree(target)

  const files = listMdFiles(target).filter((f) => !f.includes('resources/'))
  writeDocsIndex(target, files.length)
  console.log('Synced', files.length, 'doc files into green folder')
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
