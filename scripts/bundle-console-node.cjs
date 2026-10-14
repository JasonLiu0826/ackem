const { existsSync, mkdirSync, copyFileSync } = require('node:fs')
const { join, basename } = require('node:path')
const { execFileSync } = require('node:child_process')
module.exports = function bundleConsoleNode(resourcesDir) {
  if (process.platform !== 'win32') return
  const source = process.env.ACKEM_NODE_PATH || process.execPath
  if (!existsSync(source) || basename(source).toLowerCase() !== 'node.exe') throw Error('Windows release requires a console Node.js runtime')
  const version = execFileSync(source, ['--version'], { encoding:'utf8', windowsHide:true, timeout:5000 }).trim()
  if (!/^v(\d+)\./.test(version) || Number(version.match(/^v(\d+)\./)[1]) < 20) throw Error('Windows release requires Node.js 20 or newer')
  const target = join(resourcesDir, 'node')
  mkdirSync(target, {recursive:true})
  copyFileSync(source,join(target,'node.exe'))
}
