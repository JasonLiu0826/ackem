import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { OpenForULoader } from '../loader'
import type { UpluginMeta } from '../loader'
import type { ArtifactBundle, UpluginArtifactBundle, UskillArtifactBundle } from './bundleTypes'

function readDirFiles(dir: string): Record<string, string> {
  const files: Record<string, string> = {}
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    try {
      if (!statSync(full).isFile()) continue
    } catch {
      continue
    }
    if (name.startsWith('.')) continue
    files[name] = readFileSync(full, 'utf-8')
  }
  return files
}

/** JE-2a：从已安装扩展读盘重建 ArtifactBundle */
export function loadInstalledBundle(
  loader: OpenForULoader,
  extensionId: string
): ArtifactBundle | null {
  const uskill = loader.getUskil(extensionId)
  if (uskill) {
    const files = readDirFiles(uskill.dirPath)
    const skillConfig = uskill.config
    return {
      kind: 'uskill',
      manifest: uskill.manifest,
      skillConfig,
      dirName:
        uskill.dirPath.split(/[/\\]/).pop() ??
        extensionId.replace(/^u\//, '').replace(/@.*$/, ''),
      files: {
        'manifest.json': files['manifest.json'] ?? `${JSON.stringify(uskill.manifest, null, 2)}\n`,
        'skill.json': files['skill.json'] ?? `${JSON.stringify(skillConfig, null, 2)}\n`
      },
      generationLog: ['loadInstalledBundle: uskill from disk'],
      suggestedPermissions: uskill.manifest.permissions ?? [],
      permissionReasons: {}
    } satisfies UskillArtifactBundle
  }

  const uplugin = loader.getUplugin(extensionId)
  if (uplugin) {
    const files = readDirFiles(uplugin.dirPath)
    const meta = uplugin.meta ?? ({ version: '1.0.0', injectTemplate: '' } as UpluginMeta)
    return {
      kind: 'uplugin',
      manifest: uplugin.manifest,
      meta,
      dirName:
        uplugin.dirPath.split(/[/\\]/).pop() ??
        extensionId.replace(/^u\//, '').replace(/@.*$/, ''),
      files,
      generationLog: ['loadInstalledBundle: uplugin from disk']
    } satisfies UpluginArtifactBundle
  }

  return null
}

export function bumpPatchVersion(version: string): string {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return version
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

export function applyManifestVersionBump<T extends { version: string; id: string }>(manifest: T): T {
  const next = bumpPatchVersion(manifest.version)
  return { ...manifest, version: next, id: manifest.id.replace(/@\d+\.\d+\.\d+$/, `@${next}`) as T['id'] }
}
