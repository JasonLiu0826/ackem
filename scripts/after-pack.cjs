/**
 * electron-builder afterPack hook (route v2 链路适配 C):
 * electron-builder 对 extraResources 硬编码排除 node_modules, 但 AckemCode
 * daemon 依赖 tsx/express 等运行时包 —— 本钩子在打包完成后把 AckemCode 的
 * node_modules 补拷进 {appOutDir}/resources/ackemcode/, 使打包发行版的
 * work 通道有完整可运行的 runtime。
 *
 * 注意: parts/ackemcode/node_modules 可能是指向 vendor 的 JUNCTION
 * (导入时为免重复 205 包而建), 必须 lstat 判别并从 realpath 拷贝,
 * 否则 cpSync 会在 junction 内部的链接上 EPERM/成环。
 */
const { cpSync, existsSync, lstatSync, realpathSync } = require('node:fs')
const { join, resolve } = require('node:path')

function resolveRealNodeModules(root) {
  const candidates = [
    join(root, 'parts', 'ackemcode', 'node_modules'),
    join(root, 'vendor', 'ackemcode', 'node_modules'),
  ]
  for (const c of candidates) {
    if (!existsSync(join(c, 'tsx', 'dist', 'cli.mjs'))) continue
    try {
      const st = lstatSync(c)
      if (st.isSymbolicLink()) {
        // junction/symlink → 从真实目录拷, 避免把链接本身搬进产物
        return realpathSync(c)
      }
      return c
    } catch {
      /* fall through to next candidate */
    }
  }
  return null
}

/** Default export is used by electron-builder afterPack. */
module.exports = async function afterPack(context) {
  const root = join(context.appOutDir, '..', '..')
  const src = resolveRealNodeModules(root)
  const dest = join(context.appOutDir, 'resources', 'ackemcode', 'node_modules')
  if (!src) {
    console.warn('[after-pack] AckemCode node_modules not found (parts/vendor), skip')
    return
  }
  if (existsSync(dest)) {
    console.log('[after-pack] ackemcode node_modules already present, skip')
    return
  }
  console.log(`[after-pack] copying AckemCode runtime node_modules from ${src} …`)
  cpSync(src, dest, {
    recursive: true,
    filter: (srcPath) => !srcPath.includes('.git') && !srcPath.includes('.cache'),
  })
  console.log('[after-pack] ackemcode runtime node_modules copied')
}
