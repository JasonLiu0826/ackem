/**
 * CLI local preferences (theme, etc.) — ~/.ackemcode/cli-prefs.json
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { CliLanguage } from '../app/language.js'
import type { ThemeId } from '../app/themes.js'

const PREFS_FILE = path.join(os.homedir(), '.ackemcode', 'cli-prefs.json')

export type CliPrefs = {
  theme?: ThemeId
  language?: CliLanguage
}

export async function loadCliPrefs(): Promise<CliPrefs> {
  try {
    const raw = await fs.readFile(PREFS_FILE, 'utf8')
    return JSON.parse(raw) as CliPrefs
  } catch {
    return {}
  }
}

export async function saveCliPrefs(patch: CliPrefs): Promise<void> {
  const cur = await loadCliPrefs()
  const next = { ...cur, ...patch }
  await fs.mkdir(path.dirname(PREFS_FILE), { recursive: true })
  await fs.writeFile(PREFS_FILE, JSON.stringify(next, null, 2), 'utf8')
}
