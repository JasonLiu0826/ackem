import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type EpicGameEntry = {
  displayName: string
  path: string
  manifestPath: string
}

function epicManifestDirs(): string[] {
  const pd = process.env.ProgramData
  if (!pd) return []
  return [
    join(pd, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'),
    join(pd, 'Epic', 'UnrealEngineLauncher', 'Data', 'Manifests')
  ]
}

function readDisplayNameFromManifest(filePath: string): { name: string; installLocation: string } {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      DisplayName?: string
      InstallLocation?: string
    }
    return {
      name: (parsed.DisplayName ?? '').trim(),
      installLocation: (parsed.InstallLocation ?? '').trim()
    }
  } catch {
    return { name: '', installLocation: '' }
  }
}

export function parseEpicManifests(): EpicGameEntry[] {
  const games: EpicGameEntry[] = []
  const seen = new Set<string>()

  for (const dir of epicManifestDirs()) {
    if (!existsSync(dir)) continue
    let files: string[]
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.item'))
    } catch {
      continue
    }
    for (const f of files) {
      const manifestPath = join(dir, f)
      const { name, installLocation } = readDisplayNameFromManifest(manifestPath)
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      games.push({
        displayName: name,
        path: installLocation || manifestPath,
        manifestPath
      })
    }
  }

  return games
}
