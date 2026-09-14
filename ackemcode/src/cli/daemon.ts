import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

export function runDaemonForeground(port?: number): void {
  if (port) process.env.ACKEMCODE_PORT = String(port)
  const tsxCli = path.join(ROOT, 'node_modules/tsx/dist/cli.mjs')
  const server = path.join(ROOT, 'src/server/index.ts')
  const child = spawn(process.execPath, [tsxCli, server], {
    stdio: 'inherit',
    cwd: ROOT,
    env: process.env
  })
  child.on('exit', (code) => process.exit(code ?? 0))
}
