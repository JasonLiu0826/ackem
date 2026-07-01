/**
 * FIX-037 — W3 打包预检（可在 CI / 打包后本地跑，非完整干净机 E2E）
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type W3PreflightIssue = { code: string; message: string; path?: string }

/** 发行目录下任何 data/ 子树都视为用户数据泄露（不仅 memory/） */
const FORBIDDEN_DIST_SEGMENTS = ['.env', '/data/', '\\data\\']

export function scanBuilderConfig(repoRoot: string): W3PreflightIssue[] {
  const issues: W3PreflightIssue[] = []
  const ymlPath = join(repoRoot, 'electron-builder.yml')
  if (!existsSync(ymlPath)) {
    issues.push({ code: 'missing_builder_yml', message: 'electron-builder.yml not found' })
    return issues
  }
  const yml = readFileSync(ymlPath, 'utf-8')
  if (!yml.includes('!data/**')) {
    issues.push({ code: 'builder_no_data_exclude', message: 'electron-builder.yml must exclude data/**' })
  }
  if (!yml.includes('.env')) {
    issues.push({ code: 'builder_no_env_exclude', message: 'electron-builder.yml must exclude .env patterns' })
  }
  return issues
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walkFiles(p, out)
    else out.push(p)
  }
  return out
}

/** 扫描 dist/ 产物是否误打包 secrets 或 data（dist 不存在时跳过） */
export function scanDistArtifacts(repoRoot: string): W3PreflightIssue[] {
  const distDir = join(repoRoot, 'dist')
  if (!existsSync(distDir)) return []

  const issues: W3PreflightIssue[] = []
  for (const file of walkFiles(distDir)) {
    const norm = file.replace(/\\/g, '/').toLowerCase()
    if (norm.endsWith('.env') || norm.includes('/.env.')) {
      issues.push({ code: 'dist_has_env', message: 'dist contains env file', path: file })
    }
    for (const seg of FORBIDDEN_DIST_SEGMENTS) {
      if (norm.includes(seg.replace(/\\/g, '/').toLowerCase())) {
        issues.push({ code: 'dist_has_data', message: 'dist may contain user data path', path: file })
        break
      }
    }
  }
  return issues
}

export function runW3PackPreflight(repoRoot: string): { ok: boolean; issues: W3PreflightIssue[] } {
  const issues = [...scanBuilderConfig(repoRoot), ...scanDistArtifacts(repoRoot)]
  return { ok: issues.length === 0, issues }
}
