/** 开发启动器共用：路径与 .env.llm.local 加载 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function loadEnvFile(path, { override = false } = {}) {
  if (!existsSync(path)) return false
  const text = readFileSync(path, 'utf-8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!override && process.env[key] !== undefined) continue
    process.env[key] = val
  }
  return true
}

/** 加载 Ackem-dev/.env.llm.local（LLM 实机测试凭证） */
export function loadLlmLocalEnv() {
  return loadEnvFile(join(ROOT, '.env.llm.local'))
}
