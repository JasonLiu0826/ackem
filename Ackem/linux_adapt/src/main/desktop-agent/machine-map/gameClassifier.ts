/** 游戏 vs 普通软件 — 证据链分类 */

const NON_GAME_DENY =
  /抖音|douyin|豆包|doubao|剪映|jianying|夸克|quark|cursor|docker|github|codex|visual studio|vscode|node\.?js|python|java|微信|weixin|wechat|chrome|edge(?!.*game)|firefox|zoom|teams|slack|notion|obs|bluetooth|nvidia|geforce experience|microsoft edge|windows|installer|uninstall|epic games launcher|steam link|cc switch|纳米|nanai|管理工具|proxy|代理/i

const GAME_LIKE =
  /game|steamapps|epic games|riot|blizzard|ubisoft|minecraft|bannerlord|empire|warcraft|valorant|league|原神|genshin|崩坏|star rail|鸣潮|wuthering|cyberpunk|elden|fromsoftware|capcom|rockstar|2k|activision|bethesda|xbox|playstation|nintendo|hogwarts|palworld|helldivers|counter-strike|dota|overwatch|apex|pubg|fortnite/i

export type GameSourceKind =
  | 'steam_common'
  | 'epic_manifest'
  | 'shortcut'
  | 'start_menu'
  | 'program_files'
  | 'program_files_x86'
  | 'local_programs'
  | 'heuristic'

export function isDefiniteGameSource(source: string): boolean {
  return source === 'steam_common' || source === 'epic_manifest'
}

export function classifyAsGame(
  displayName: string,
  path: string,
  source: GameSourceKind
): { ok: boolean; confidence: 'high' | 'medium' | 'low' } {
  const name = displayName.trim()
  const p = path.trim()
  if (!name) return { ok: false, confidence: 'low' }

  if (isDefiniteGameSource(source)) {
    return { ok: true, confidence: 'high' }
  }

  const blob = `${name} ${p}`
  if (NON_GAME_DENY.test(blob)) {
    return { ok: false, confidence: 'low' }
  }

  if (/\\steamapps\\common\\/i.test(p)) {
    return { ok: true, confidence: 'high' }
  }

  if (/\\Epic Games\\/i.test(p) && !/Launcher/i.test(p)) {
    return { ok: true, confidence: 'high' }
  }

  if (source === 'shortcut' || source === 'start_menu') {
    if (GAME_LIKE.test(blob)) return { ok: true, confidence: 'high' }
    return { ok: false, confidence: 'low' }
  }

  if (source === 'program_files' || source === 'program_files_x86' || source === 'local_programs') {
    if (GAME_LIKE.test(name)) return { ok: true, confidence: 'medium' }
    return { ok: false, confidence: 'low' }
  }

  if (GAME_LIKE.test(blob)) return { ok: true, confidence: 'medium' }
  return { ok: false, confidence: 'low' }
}
