import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
/** Shared managed workspace for chat dispatch and a workbench without a user-selected folder. */
export function ensureDefaultWorkDirectory(dataRoot: string): string {
  const cwd = resolve(join(dataRoot, 'workspace'))
  mkdirSync(cwd, { recursive: true })
  return cwd
}
