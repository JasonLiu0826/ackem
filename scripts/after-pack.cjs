/**
 * electron-builder 会从 extraResources 里丢掉 node_modules。
 * AckemCode 运行时依赖 tsx / express，打包后再把 node_modules 补进 resources/ackemcode。
 */
const { cpSync, existsSync, lstatSync, realpathSync } = require('node:fs')
const { join } = require('node:path')

function resolveRealNodeModules(root) {
  const candidates = [
    join(root, 'ackemcode', 'node_modules'),
    join(root, 'parts', 'ackemcode', 'node_modules'),
    join(root, 'vendor', 'ackemcode', 'node_modules')
  ]
  for (const c of candidates) {
    if (!existsSync(join(c, 'tsx', 'dist', 'cli.mjs'))) continue
    try {
      const st = lstatSync(c)
      if (st.isSymbolicLink()) return realpathSync(c)
      return c
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

module.exports = async function afterPack(context) {
  const root = join(context.appOutDir, '..', '..')
  const src = resolveRealNodeModules(root)
  const dest = join(context.appOutDir, 'resources', 'ackemcode', 'node_modules')
  if (!src) {
    console.warn('[after-pack] AckemCode node_modules not found, skip')
    return
  }
  if (existsSync(dest)) {
    console.log('[after-pack] ackemcode node_modules already present, skip')
    return
  }
  console.log(`[after-pack] copying AckemCode runtime node_modules from ${src} …`)
  cpSync(src, dest, {
    recursive: true,
    filter: (srcPath) => !srcPath.includes('.git') && !srcPath.includes('.cache')
  })
  console.log('[after-pack] ackemcode runtime node_modules copied')
}
