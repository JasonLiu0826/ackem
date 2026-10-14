/**
 * ABI switching for better-sqlite3 (route v2 E2E validation 发现的时序坑).
 *
 * Vitest/Node 集成测试与 Electron 运行时需要不同的 native ABI。两条命令:
 *   npm run abi:test  — rebuild for system Node (跑 node scripts/vitest-sqlite.mjs 前)
 *   npm run abi:dev   — rebuild for Electron (npm start / dev 前)
 *
 * 唯一正确判据: 模块能否在目标运行时下 require。
 * 注意: install-app-deps 会被旧 prebuild 缓存骗过 (声称完成实不重编),
 * 因此 abi:dev 走 electron-rebuild -f。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'

const BINARY = 'node_modules/better-sqlite3/build/Release/better_sqlite3.node'
const mode = process.argv[2]

function sh(cmd) {
  const r = spawnSync(cmd, { stdio: 'inherit', shell: true })
  return r.status ?? 1
}

if (mode === 'test') {
  process.exit(sh('npm rebuild better-sqlite3'))
}

if (mode === 'dev') {
  // electron-rebuild 有缓存陷阱: 删掉旧二进制强制重编。
  try {
    if (existsSync(BINARY)) {
      const sizeBefore = statSync(BINARY).size
      console.log(`[abi] removing stale binary (${sizeBefore} bytes) to force rebuild`)
      require('node:fs').rmSync(BINARY)
      void sizeBefore
    }
  } catch {
    /* ignore */
  }
  const code = sh('npx electron-rebuild -f -w better-sqlite3')
  if (code !== 0) process.exit(code)
  // Verify: run a probe script under the Electron binary and read the result
  // from a temp file (GUI app suppresses stdout on Windows).
  const electronExe = existsSync('node_modules/electron/dist/electron.exe')
    ? 'node_modules/electron/dist/electron.exe'
    : 'node_modules/electron/dist/electron'
  const probeFile = 'abicheck.tmp.cjs'
  const resultFile = 'abicheck.result'
  writeFileSync(
    probeFile,
    "const fs=require('fs');try{const D=require('better-sqlite3');const d=new D(':memory:');d.prepare('SELECT 1').get();d.close();fs.writeFileSync(" + JSON.stringify(resultFile) + ",'ABI-OK')}catch(e){fs.writeFileSync(" + JSON.stringify(resultFile) + ",'ABI-FAIL:'+String(e.message).slice(0,80))}process.exit(0)"
  )
  spawnSync(electronExe, [probeFile], { stdio: 'ignore' })
  rmSync(probeFile, { force: true })
  let ok = false
  try {
    ok = readFileSync(resultFile, 'utf8').startsWith('ABI-OK')
  } catch {
    /* no result = fail */
  }
  try {
    rmSync(resultFile, { force: true })
  } catch {
    /* ignore */
  }
  console.log(ok ? '[abi] dev ABI verified (loads + opens DB under Electron)' : '[abi] WARNING: could not verify Electron ABI')
  process.exit(ok ? 0 : 1)
}

console.error('usage: node scripts/abi-switch.mjs test|dev')
process.exit(2)
