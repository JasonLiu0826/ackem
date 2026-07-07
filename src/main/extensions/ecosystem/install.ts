// [ecosystem/install] 鈥?绀惧尯鎵╁睍鍖呭畨瑁?

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExtensionOpResult } from '../protocols'
import { COMMUNITY_EXTENSIONS_REL, SIGNATURE_SIDECAR_FILENAME } from './constants'
import { parseExtensionId } from './extensionId'
import type { AckemExtensionPackage } from './packageFormat'
import { parseAckemExtensionPackage, verifyAckemExtensionPackage } from './packageFormat'
import {
  COMMUNITY_EXTENSIONS_CLOSED_ZH,
  isCommunityExtensionsOpen
} from '../../../shared/communityExtensionFeature'

export function communitySkillsDir(dataRoot: string): string {
  return join(dataRoot, COMMUNITY_EXTENSIONS_REL, 'skills')
}

export function communityPluginsDir(dataRoot: string): string {
  return join(dataRoot, COMMUNITY_EXTENSIONS_REL, 'plugins')
}

export function installCommunityPackage(
  dataRoot: string,
  rawPackage: unknown
): ExtensionOpResult<{ id: string; dirPath: string }> {
  if (!isCommunityExtensionsOpen()) {
    return { ok: false, error: COMMUNITY_EXTENSIONS_CLOSED_ZH }
  }

  let pkg: AckemExtensionPackage
  try {
    pkg = parseAckemExtensionPackage(rawPackage)
  } catch (err) {
    return { ok: false, error: String(err) }
  }

  const verify = verifyAckemExtensionPackage(dataRoot, pkg)
  if (!verify.ok) {
    return { ok: false, error: verify.errors.join('; ') }
  }

  const parsed = parseExtensionId(pkg.manifest.id)
  if (!parsed) return { ok: false, error: `鏃犳晥鎵╁睍 id: ${pkg.manifest.id}` }

  const category = pkg.manifest.category
  const baseDir =
    category === 'skill'
      ? communitySkillsDir(dataRoot)
      : category === 'plugin'
        ? communityPluginsDir(dataRoot)
        : null
  if (!baseDir) {
    return { ok: false, error: `涓嶆敮鎸佺殑 category: ${String(category)}` }
  }

  const targetDir = join(baseDir, parsed.slug)
  mkdirSync(targetDir, { recursive: true })

  for (const [relPath, content] of Object.entries(pkg.files)) {
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
    if (normalized.includes('..')) {
      return { ok: false, error: `闈炴硶鏂囦欢璺緞: ${relPath}` }
    }
    const outPath = join(targetDir, normalized)
    mkdirSync(join(outPath, '..'), { recursive: true })
    writeFileSync(outPath, content, 'utf-8')
  }

  writeFileSync(
    join(targetDir, SIGNATURE_SIDECAR_FILENAME),
    JSON.stringify(pkg.signature, null, 2),
    'utf-8'
  )

  return { ok: true, data: { id: pkg.manifest.id, dirPath: targetDir } }
}

export function installCommunityPackageFromFile(
  dataRoot: string,
  filePath: string
): ExtensionOpResult<{ id: string; dirPath: string }> {
  if (!existsSync(filePath)) {
    return { ok: false, error: `鏂囦欢涓嶅瓨鍦? ${filePath}` }
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
    return installCommunityPackage(dataRoot, raw)
  } catch (err) {
    return { ok: false, error: `瑙ｆ瀽 .Ackem-ext 澶辫触: ${String(err)}` }
  }
}

export function listInstalledCommunityIds(dataRoot: string): string[] {
  const ids: string[] = []
  for (const base of [communitySkillsDir(dataRoot), communityPluginsDir(dataRoot)]) {
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const manifestPath = join(base, entry.name, 'manifest.json')
      if (!existsSync(manifestPath)) continue
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { id?: string }
        if (manifest.id) ids.push(manifest.id)
      } catch {
        // skip corrupt
      }
    }
  }
  return ids
}
