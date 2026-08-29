import { join, resolve } from 'node:path'

/** 与 settings 解析的 dataRoot 一致：便携模式为 `{cwd|exe}/data`，或 %LOCALAPPDATA%/Britney */
export const BRITNEY_DB_FILENAME = 'britney.db'

export function databasePath(dataRoot: string): string {
  return join(dataRoot, BRITNEY_DB_FILENAME)
}

/** memory/facts/facts.v2.json → dataRoot（resolve 保证与 initDatabase 路径 pool 键一致） */
export function dataRootFromFactsPath(factsPath: string): string {
  return resolve(factsPath, '..', '..', '..')
}
