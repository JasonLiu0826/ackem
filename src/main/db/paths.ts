import { join, resolve } from 'node:path'

/** 涓?settings 瑙ｆ瀽鐨?dataRoot 涓€鑷达細渚挎惡妯″紡涓?`{cwd|exe}/data`锛屾垨 %LOCALAPPDATA%/Ackem */
export const ACKEM_DB_FILENAME = 'ackem.db'

export function databasePath(dataRoot: string): string {
  return join(dataRoot, ACKEM_DB_FILENAME)
}

/** memory/facts/facts.v2.json 鈫?dataRoot锛坮esolve 淇濊瘉涓?initDatabase 璺緞 pool 閿竴鑷达級 */
export function dataRootFromFactsPath(factsPath: string): string {
  return resolve(factsPath, '..', '..', '..')
}
