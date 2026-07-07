import type { SkillManifest } from '../skills/types'
import type { UskilConfig } from './loader'

/** 鏋勫缓娉ㄥ叆 LLM 鐨勪笂涓嬫枃鍧楋紙Dispatch 鎵ц鍚庤繘鍏ョ瀹跺眰鈫掕〃杈惧眰锛?*/
export function buildUskillContextInjection(manifest: SkillManifest, config: UskilConfig): string {
  const fromTemplate = config.promptTemplates?.contextInjection?.trim()
  if (fromTemplate) return fromTemplate

  const reply = config.onKeyword?.reply?.trim()
  if (reply) {
    return `銆?{manifest.name} 宸茶Е鍙戙€?{reply}銆傜敤 Ackem 浼翠荆鐨勮嚜鐒惰姘斿洖搴旓紝骞惰惤瀹炶鑳藉姏鎻忚堪鐨勮涓恒€俙
  }

  return ''
}

/** 鐢ㄦ埛鍙鐨勭煭鍙嶉锛坱oast / trace锛?*/
export function buildUskillUserFacing(manifest: SkillManifest, config: UskilConfig): string {
  return (
    config.promptTemplates?.userFacing?.trim() ||
    config.onKeyword?.reply?.trim() ||
    `${manifest.name} 宸茶Е鍙慲
  )
}

/** autonomous tick 鍒扮偣鏃剁殑 proactive 鏂囨锛堜笉缁?LLM / EmotionPanel锛?*/
export function buildUskillProactiveMessage(manifest: SkillManifest, config: UskilConfig): string {
  const fromUserFacing = config.promptTemplates?.userFacing?.trim()
  if (fromUserFacing) return fromUserFacing

  const fromReply = config.onKeyword?.reply?.trim()
  if (fromReply) return fromReply

  const desc = manifest.description?.trim()
  if (desc) return desc

  return `${manifest.name} 鎻愰啋`
}

/** manifest + skill.json 鏄惁鍚敤 scheduler autonomous tick */
export function isUskillAutonomousEnabled(manifest: SkillManifest, config: UskilConfig): boolean {
  return manifest.dispatch?.mode === 'autonomous' && config.onProactive?.enabled === true
}
