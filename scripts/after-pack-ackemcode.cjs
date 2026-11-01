/**
 * [after-pack-ackemcode] — 把 Ackem Code 运行时完整放进 .app
 *
 * 为什么不用 extraResources：electron-builder 对 extraResources 里的 node_modules
 * 会被默认忽略规则吃掉，打出来的 resources/ackemcode 只有 dist，daemon 起不来。
 * 这里在打包后直接拷贝 dist / package.json / data / node_modules。
 */
const fs = require('node:fs')
const path = require('node:path')

const KEEP = ['dist', 'package.json', 'data']

function copyDir(from, to, filter) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (filter && !filter(src, entry)) continue
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) copyDir(src, dst, filter)
    else fs.copyFileSync(src, dst)
  }
}

/**
 * 计算运行时落点：
 *   macOS  → <appOutDir>/<Product>.app/Contents/Resources/ackemcode
 *   Windows→ <appOutDir>/resources/ackemcode
 * 以前写死 macOS 布局，Windows 打包时会把运行时放进一个不存在的 .app 目录，
 * 导致安装包里找不到编码运行时。
 */
function resolveAckemcodeDest(context) {
  const productFilename = context.packager.appInfo.productFilename
  const isMac = context.electronPlatformName === 'darwin'
  const resourcesDir = isMac
    ? path.join(context.appOutDir, `${productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources')
  return path.join(resourcesDir, 'ackemcode')
}

exports.resolveAckemcodeDest = resolveAckemcodeDest

exports.default = async function afterPack(context) {
  const projectDir = context.packager.projectDir
  const srcRoot = path.join(projectDir, 'parts', 'ackemcode')
  const destRoot = resolveAckemcodeDest(context)

  if (!fs.existsSync(path.join(srcRoot, 'dist', 'server', 'index.js'))) {
    throw new Error('[after-pack] parts/ackemcode 未构建：先执行 cd parts/ackemcode && npm run build')
  }

  fs.rmSync(destRoot, { recursive: true, force: true })
  fs.mkdirSync(destRoot, { recursive: true })

  for (const name of KEEP) {
    const src = path.join(srcRoot, name)
    if (!fs.existsSync(src)) continue
    const dst = path.join(destRoot, name)
    if (fs.statSync(src).isDirectory()) copyDir(src, dst)
    else fs.copyFileSync(src, dst)
  }

  // 只留 vendors 配置，不带任何本地 settings / 会话数据
  const dataDir = path.join(destRoot, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  for (const entry of fs.readdirSync(dataDir)) {
    if (entry !== 'llm-vendors.json') fs.rmSync(path.join(dataDir, entry), { recursive: true, force: true })
  }

  copyDir(path.join(srcRoot, 'node_modules'), path.join(destRoot, 'node_modules'), (src, entry) => {
    if (entry.name === '.bin') return false
    if (entry.name === 'test' || entry.name === 'tests' || entry.name === '__tests__') return false
    if (entry.name.endsWith('.map')) return false
    return true
  })

  console.log('[after-pack] Ackem Code runtime →', destRoot)
}
