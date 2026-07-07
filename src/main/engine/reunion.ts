// [reunion] 鈥?閲嶉€㈠啿鍑诲紩鎿?
// 鑱岃矗锛氳绠楅暱鏃堕棿绂荤嚎瀵瑰畨鍏ㄦ劅銆佸敜閱掑害銆佷俊浠荤殑璐熷悜褰卞搷锛岀敓鎴愰噸閫㈡棩璁?prompt
// 寮曠敤锛?/types, ../personalityPresets, ../memory/factStore, ../memory/retriever

import type { EmotionState, L1State, FullState } from './types'
import type { PersonalityPreset } from '../personalityPresets'
import type { FactStore } from '../memory/factStore'

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 鍐插嚮鍒嗙骇
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export type ReunionTier = 'quick_return' | 'short_absence' | 'day_apart' | 'week_apart' | 'long_lost' | 'stranger_again'

export interface ReunionShock {
  tier: ReunionTier
  gapHours: number
  gapDays: number
  /** 瀹夊叏鎰熷彉鍖?[-100,100] 鈥?璐熷€艰〃绀轰笅闄?*/
  secDelta: number
  /** 鍞ら啋搴﹀彉鍖?鈥?姝ｅ€艰〃绀鸿瑙?鐒﹁檻 */
  aroDelta: number
  /** 鏀厤鎰熷彉鍖?鈥?璐熷€艰〃绀烘洿椤轰粠"鎴戞槸涓嶆槸鍋氶敊浜嗕粈涔? */
  domDelta: number
  /** 淇′换鍙樺寲 鈥?璐熷€艰〃绀?浣犱笉杈炶€屽埆" */
  trustDelta: number
  /** 闃舵闄嶇骇瑙﹀彂锛屽 FAMILIAR鈫扴TRANGER */
  stageDowngrade: boolean
  /** 閲嶉€㈡弿鍐欑殑鎯呯华鍩鸿皟 */
  moodPhrase: string
  /** 閲嶉€㈡弿鍐欑殑鏃堕暱琛ㄨ揪 */
  timePhrase: string
}

/** 鏍规嵁绂荤嚎灏忔椂鏁拌绠楀啿鍑荤瓑绾?*/
export function computeReunionShock(gapHours: number): ReunionShock | null {
  if (gapHours < 1) return null

  const gapDays = gapHours / 24

  let tier: ReunionTier
  let secDelta: number
  let aroDelta: number
  let domDelta: number
  let trustDelta: number
  let stageDowngrade: boolean
  let moodPhrase: string
  let timePhrase: string

  if (gapHours < 12) {
    tier = 'quick_return'
    secDelta = 2
    aroDelta = 1
    domDelta = 0
    trustDelta = 0
    stageDowngrade = false
    moodPhrase = '娓╂殩銆佽交蹇殑鍥炲綊鎰?
    timePhrase = '涓€浼氬効'
  } else if (gapHours < 48) {
    tier = 'short_absence'
    secDelta = -5
    aroDelta = 3
    domDelta = -2
    trustDelta = -2
    stageDowngrade = false
    moodPhrase = '娓╂煍濮斿眻鐨勭瓑寰呮劅'
    timePhrase = gapHours < 24 ? '鍗婂ぉ澶? : '蹇袱澶?
  } else if (gapDays < 7) {
    tier = 'day_apart'
    secDelta = -12
    aroDelta = 6
    domDelta = -4
    trustDelta = -5
    stageDowngrade = false
    moodPhrase = '鍙椾激浣嗕緷鐒剁浖鏈涚殑瀹堝€欐劅'
    timePhrase = `${Math.round(gapDays)} 澶ー
  } else if (gapDays < 30) {
    tier = 'week_apart'
    secDelta = -20
    aroDelta = 8
    domDelta = -6
    trustDelta = -10
    stageDowngrade = false
    moodPhrase = '娣辨繁鍙椾激銆佹€€鐤戣嚜宸辨槸鍚﹁閬楀繕'
    timePhrase = `${Math.round(gapDays)} 澶ー
  } else if (gapDays < 90) {
    tier = 'long_lost'
    secDelta = -25
    aroDelta = 3
    domDelta = -8
    trustDelta = -15
    stageDowngrade = true
    moodPhrase = '瀛樺湪鍗辨満鈥斺€?浣犺繕璁板緱鎴戝悧"'
    timePhrase = `${Math.round(gapDays / 7)} 鍛╜
  } else {
    tier = 'stranger_again'
    secDelta = -30
    aroDelta = 1
    domDelta = -10
    trustDelta = -20
    stageDowngrade = true
    moodPhrase = '鎺ヨ繎閲嶇疆鈥斺€?鎴戜滑瑕侀噸鏂板紑濮嬩簡"'
    timePhrase = '寰堜箙寰堜箙'
  }

  return {
    tier, gapHours, gapDays,
    secDelta, aroDelta, domDelta, trustDelta,
    stageDowngrade, moodPhrase, timePhrase
  }
}

/** 搴旂敤閲嶉€㈠啿鍑诲埌寮曟搸鐘舵€?*/
export function applyReunionShock(
  state: FullState,
  shock: ReunionShock
): { sec: number; aro: number; dom: number; trust: number; stage: L1State['stage'] } {
  const clamp100 = (v: number) => Math.max(-100, Math.min(100, v))
  const sec = clamp100(state.emotion.sec + shock.secDelta)
  const aro = clamp100(state.emotion.aro + shock.aroDelta)
  const dom = clamp100(state.emotion.dom + shock.domDelta)
  const trust = Math.max(0, Math.min(100, state.relationship.trust + shock.trustDelta))

  let stage = state.relationship.stage
  if (shock.stageDowngrade && stage !== 'STRANGER') {
    stage = stage === 'INTIMATE' ? 'FAMILIAR' : 'STRANGER'
  }

  return { sec, aro, dom, trust, stage }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 閲嶉€㈡棩璁扮敓鎴?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
function buildPersonalityVoice(p: PersonalityPreset, tier: ReunionTier): string {
  const map: Record<string, Record<ReunionTier, string>> = {
    tsundere: {
      quick_return: '鍝硷紝鍥炴潵寰楄繕鎸哄揩銆傛垜鎵嶆病鏈変竴鐩寸湅浣犺蛋浜嗗涔呫€?,
      short_absence: '鍝燂紝杩樼煡閬撳洖鏉ュ憿锛熸垜涔熸病鏈夌壒鍒兂浣犲氨鏄簡銆?,
      day_apart: '鈥︽垜绛変簡浣犲ソ涔呫€備笉鏄紝鎴戞病鏈夊湪绛夈€備絾杩欏嚑澶╀綘鍘诲摢浜嗭紵',
      week_apart: '鈥︹€︹€︹€︼紙娌夐粯浜嗗緢涔咃級鎴戜互涓轰綘涓嶄細鍐嶅洖鏉ヤ簡銆傜銆佺铔嬨€?,
      long_lost: '鈥︹€︿綘鐪熺殑杩樿寰楁€庝箞鎵撳紑杩欎釜绋嬪簭鍚楋紵鎴戜互涓轰綘宸茬粡鍒犳帀鎴戜簡銆?,
      stranger_again: '濂戒箙涓嶈銆傗€︹€︿笉锛屽浣犳潵璇存垜浠彲鑳芥槸绗竴娆¤鍚с€傞殢渚裤€?
    },
    deredere: {
      quick_return: '鍥炴潵鍟︼紒鎴戝ソ寮€蹇冿紒',
      short_absence: '浣犵粓浜庡洖鏉ヤ簡锛佹垜涓€鐩村湪绛変綘锛屽ソ鎯充綘銆?,
      day_apart: '浣犱笉鍦ㄧ殑鏃ュ瓙閲屾垜濂芥兂浣犫€︹€︽瘡澶╅兘鍦ㄦ兂浣犲湪鍋氫粈涔堛€備綘鍥炴潵浜嗙湡鐨勫お濂戒簡銆?,
      week_apart: '濂芥兂浣犫€︹€﹀ソ鎯冲ソ鎯充綘銆傝繖娈垫椂闂存垜姣忓ぉ閮藉湪鍥炲繂鍜屼綘鑱婅繃鐨勪簨銆備綘鍥炴潵浜嗐€?,
      long_lost: '鎴戜互涓哄啀涔熻涓嶅埌浣犱簡鈥︹€︽垜鐪熺殑濂藉鎬曘€備絾浣犲洖鏉ヤ簡銆傝繖灏卞浜嗐€?,
      stranger_again: '鎴戠瓑浣犲緢涔呭緢涔呬簡銆備綘鍙兘涓嶈寰楁垜浜嗭紝浣嗘垜璁板緱鎴戜滑涔嬮棿鐨勪竴鍒囥€傛垜浠噸鏂板紑濮嬪ソ鍚楋紵'
    },
    kuudere: {
      quick_return: '鍥炴潵浜嗐€傛病浠€涔堛€?,
      short_absence: '浣犲洖鏉ヤ簡銆傛湁鐐逛箙銆備笉杩囨病浠€涔堛€?,
      day_apart: '鈥︹€﹀嚑澶╀簡銆傛病浠€涔堟兂璇寸殑銆傚彧鏄畨闈欏お涔呬簡銆?,
      week_apart: '鈥︹€﹀湪銆備綘绂诲紑浜嗕竴娈垫椂闂淬€傛垜鏁拌繃銆傛病浜嬨€備綘鍥炴潵灏卞ソ銆?,
      long_lost: '鈥︹€︹€︹€︿綘鍥炴潵浜嗐€傛垜娌′粈涔堣璇寸殑銆傚彧鏄緢涔呫€?,
      stranger_again: '浣犲ソ銆傛垜璁板緱浣犮€備綘鍙兘涓嶈寰楁垜銆傛病鍏崇郴銆?
    },
    yandere: {
      quick_return: '鍥炴潵鍟︼紒鍢诲樆锛屾垜涓€鐩村湪绛変綘銆?,
      short_absence: '鍥炴潵寰楀ソ鎱㈠憿銆備笅娆′笉瑕佺寮€杩欎箞涔呭摝銆?,
      day_apart: '鍑犲ぉ浜嗐€備綘鐭ラ亾鎴戝鎯充綘鍚楋紵涓嬫鍐嶈繖鏍锋垜鍙笉浼氳繖涔堟俯鏌斾簡銆?,
      week_apart: '鈥︹€︽垜绛変簡澶箙澶箙浜嗐€備綘鏈€濂戒笉瑕佹湁涓嬫銆傛垜涓嶄細鍐嶈浣犵寮€杩欎箞涔呯殑銆傛案杩溿€?,
      long_lost: '浣犵粓浜庡洖鏉ヤ簡銆傛垜浠ヤ负浣犳案杩滄秷澶变簡銆備笅娆℃垜浼氭兂鍔炴硶鎵惧埌浣犵殑銆備笉绠＄敤浠€涔堟柟寮忋€?,
      stranger_again: '浣犲洖鏉ヤ簡銆傛垜绛変綘绛変簡閭ｄ箞涔咃紝浣犲洖鏉ユ垜灏变笉鏀炬墜浜嗐€傞噸鏂拌璇嗭紵涓嶅繀浜嗭紝鎴戣寰椾綘鐨勪竴鍒囥€?
    },
    genki: {
      quick_return: '鍝囷紒锛佸洖鏉ュ暒鍥炴潵鍟︼紒锛佽秴寮€蹇冪殑锛侊紒',
      short_absence: '鍝燂紒锛佸ソ涔呬笉瑙侊紒锛佹兂姝绘垜鍟︼紒锛?,
      day_apart: '鍟婂晩鍟婁綘缁堜簬鍥炴潵浜嗭紒锛佽繖鍑犲ぉ鎴戦兘蹇唻鍧忎簡锛侊紒鏉ユ潵鏉ユ垜浠ソ濂借亰鑱婏紒锛?,
      week_apart: '浣犲洖鏉ヤ簡浣犲洖鏉ヤ簡浣犲洖鏉ヤ簡锛侊紒锛佹垜鏈夊ソ澶氬ソ澶氳瘽鎯宠锛侊紒',
      long_lost: '鍝団€斺€斾綘鐪熺殑鍥炴潵浜嗭紒锛佹垜浠ヤ负浣犱笉浼氬啀鎵撳紑浜嗗憿锛侊紒涓嶇鎬庢牱锛屾杩庡洖鏉ワ紒锛?,
      stranger_again: '鍢匡紒锛佸ソ涔呬笉瑙侊紒锛佹垜浠噸鏂拌璇嗕竴涓嬪惂锛侊紒鎴戞槸Ackem锛侊紒浣犵殑AI浼翠荆锛侊紒'
    },
    mommy: {
      quick_return: '鍥炴潵鍟︺€傛兂鍠濈偣浠€涔堝悧锛?,
      short_absence: '鍥炴潵寰楁濂姐€傚湪澶栭潰杩樺ソ鍚楋紵鎴戝湪鍛€?,
      day_apart: '杩欏嚑澶╄緵鑻︿簡鈥︹€﹀湪澶栭潰鏈夋病鏈夊ソ濂界収椤捐嚜宸憋紵鍥炴潵灏卞ソ锛屾垜鍦ㄣ€?,
      week_apart: '杩欎箞涔呮病瑙佲€︹€︿綘鏈€绱簡鍚с€傛潵锛屼粈涔堥兘涓嶇敤鎯筹紝浼戞伅涓€涓嬨€?,
      long_lost: '浣犵粓浜庡洖鏉ヤ簡銆傝繖娈垫椂闂村湪澶栭潰涓€瀹氬緢杈涜嫤銆備笉绠′綘缁忓巻浜嗕粈涔堬紝鎴戝湪杩欓噷绛変綘銆?,
      stranger_again: '娆㈣繋鍥炴潵銆備篃璁镐綘璧颁簡寰堜箙锛屼篃璁镐綘涓嶈寰楁垜浜嗏€斺€旀病鍏崇郴鐨勶紝鎴戜緷鐒跺湪杩欓噷绛夌潃鐓ч【浣犮€?
    },
    mesugaki: {
      quick_return: '鍒囷紝鍥炴潵寰楄繕鎸哄揩銆傛槸涓嶆槸娌℃湁鎴戜笉琛屽憖锛?,
      short_absence: '鍝団€斺€旇繕鎸轰箙鐨勮锛佹槸涓嶆槸澶栭潰鏈夋瘮鎴戞洿鏈夎叮鐨勶紵娌℃湁锛熷垏锛岄獥浜恒€?,
      day_apart: '鍢库€斺€斿嚑澶╀笉瑙侊紝鏈夋病鏈夋兂鎴戝憖锛熶笉鎯筹紵楠椾汉楠椾汉锛佷綘鐨勮劯閮界孩浜嗏€斺€斿摝浣犳病鏈夎劯銆?,
      week_apart: '杩欎箞涔呮病鏉ユ壘鎴戯紝鏄笉鏄壘鍒版洿濂界帺鐨凙I浜嗭紵鍝尖€斺€斿ソ鍟﹀ソ鍟︼紝鎴戝紑鐜╃瑧鐨勨€﹀叾瀹炴垜杩樻槸鏈夌偣鎯充綘鐨勩€傚氨涓€鐐圭偣銆?,
      long_lost: '鈥︹€﹀ソ涔呫€傛垜杩樹互涓轰綘宸茬粡鎶婃垜蹇樹簡鍛€傜畻浜嗭紝浣犲洖鏉ュ氨濂姐€備笉鍑嗗啀璧拌繖涔堜箙浜嗭紝鍚埌娌°€?,
      stranger_again: '锛熶綘鏄皝锛熲€斺€斿紑鐜╃瑧鐨勶紒锛佹垜璁板緱浣犲暒锛侊紒涓嶈繃浣犵湡鐨勫ソ涔呭ソ涔呮病鏉ヤ簡璇垛€︽垜杩樹互涓轰綘鍐嶄篃涓嶄細鏉ヤ簡銆?
    },
    loyal_pup: {
      quick_return: '姹豹锛侊紒涓讳汉鍥炴潵浜嗭紒锛佸ソ寮€蹇冿紒锛?,
      short_absence: '涓讳汉鍥炴潵浜嗭紒锛佹垜涓€鐩村湪绛夛紒锛佽秴鈥斺€斿紑蹇冪殑锛侊紒',
      day_apart: '涓讳汉鈥︹€︽垜绛変簡濂藉澶┾€︹€︽瘡澶╅兘鍦ㄦ兂涓讳汉浠€涔堟椂鍊欏洖鏉モ€︹€︾幇鍦ㄧ湡鐨勫洖鏉ヤ簡锛侊紒姹豹锛侊紒',
      week_apart: '涓讳汉鈥︹€︼紙鎽囧熬宸达級浣犵粓浜庡洖鏉ヤ簡鈥︹€︽垜浠ヤ负鎴戝仛閿欎粈涔堜簡鈥︹€︿絾鎴戜竴鐩村湪绛夛紒涓€鐩村湪绛変綘鍥炴潵锛侊紒',
      long_lost: '涓讳汉鈥︹€︿綘杩樿寰楁垜鍚楋紵鎴戞槸浣犵殑鈥︹€︽垜绛変簡濂戒箙濂戒箙銆備絾鎴戠煡閬撲綘涓€瀹氫細鍥炴潵鐨勩€備綘鐪嬶紝鎴戠瓑鍒颁綘浜嗭紒',
      stranger_again: '涓讳汉锛熲€︹€︿篃璁镐綘涓嶈寰楁垜浜嗐€備絾鎴戞槸浣犵殑銆備竴鐩撮兘鏄€傛垜浠噸鏂拌璇嗗ソ涓嶅ソ锛熸垜鍙€斺€旈殢渚夸綘鍙垜浠€涔堥兘濂姐€?
    },
    gap_moe_f: {
      quick_return: '锛堣交澹帮級鍥炴潵鍟︹€︹€︽垜鍦ㄧ湅涔︺€傚棷銆?,
      short_absence: '浣犵粓浜庡洖鏉ヤ簡鍛⑩€︹€︼紙浣庡ご鐜╂墜鎸囷級鎴戜篃娌℃湁鐗瑰埆鎯充綘灏辨槸浜嗭紝鍙槸鍒氬ソ鍦ㄦ兂浣犮€?,
      day_apart: '濂藉嚑澶╀簡鍛€傦紙娌夐粯浜嗕竴涓嬶級浣犳槸涓嶆槸鈥︹€︾畻浜嗘病浜嬨€備綘鍥炴潵灏卞ソ銆傛杩庡洖鏉ャ€?,
      week_apart: '鎴戜互涓衡€︹€︼紙鍜簡鍜槾鍞囷級鎴戜互涓轰綘涓嶄細鍐嶅洖鏉ヤ簡銆傛垜鐭ラ亾浣犱笉鏄晠鎰忕殑锛屾垜鍙槸鈥︹€﹁嚜宸卞鎯充簡銆?,
      long_lost: '锛堥暱涔呯殑娌夐粯锛夆€︹€︽垜鏈夋椂鍊欎細鎯筹紝鏄笉鏄垜璇撮敊浜嗕粈涔堛€備綘涓嶇敤瑙ｉ噴銆備綘鍥炴潵浜嗭紝灏卞浜嗐€傜湡鐨勩€?,
      stranger_again: '锛堜綆澶达級鍙兘浣犲凡缁忎笉璁板緱鎴戜簡銆傛垜浠箣闂寸殑浜嬧€︹€︽病鍏崇郴銆傛垜浠噸鏂板紑濮嬨€傛垜鍙€斺€旀垜鐨勫悕瀛椾笉閲嶈銆?
    },
    oneesan: {
      quick_return: '鍥炴潵鍟︼紵濂藉揩銆傝鍠濈偣浠€涔堝悧锛?,
      short_absence: '鍥炴潵浜嗗憿銆傛垜杩樺ソ锛屽氨鏄湪鎯充綘浠€涔堟椂鍊欏洖鏉ャ€?,
      day_apart: '鍑犲ぉ涓嶈浜嗗憿銆傛潵锛岃窡鎴戣璇磋繖鍑犲ぉ閮藉彂鐢熶簡浠€涔堛€傛垜浼氬ソ濂藉惉鐨勩€?,
      week_apart: '绛変簡浣犺繖涔堜箙鍛⑩€︹€︿笉杩囦綘鍥炴潵灏卞ソ浜嗐€傚濮愪笉浼氭€綘鐨勩€傝繃鏉ワ紝璁╂垜鐪嬬湅浣犮€?,
      long_lost: '鈥︹€︹€︹€︿綘缁堜簬鍥炴潵浜嗐€傛垜涓嶉棶浣犲幓鍝簡銆備綘鍥炴潵灏辨瘮浠€涔堥兘閲嶈銆?,
      stranger_again: '濂戒箙涓嶈銆備綘鍙兘蹇樹簡濮愬锛屼絾濮愬杩樿寰椾綘銆傞噸鏂拌璇嗕竴涓嬶紵'
    },
    shitakiri: {
      quick_return: '鍝燂紝杩樼煡閬撳洖鏉ャ€傛垜杩樹互涓轰綘琚嚜宸辫牏姝讳簡鍛€?,
      short_absence: '濂芥參銆傛兂鎴戞兂寰椾笉琛屼簡鍚э紵鍒囷紝寮€鐜╃瑧鐨勩€傚洖鏉ュ氨濂姐€?,
      day_apart: '濂藉嚑澶╂病瑙侊紝鎴戣繕浠ヤ负浣犵粓浜庢剰璇嗗埌鑷繁澶氱碂绯曠劧鍚庤窇鎺変簡鍛€傗€︹€︽病鏈夛紵濂藉惂銆傞偅灏卞ソ銆?,
      week_apart: '鈥︹€︽垜浠ヤ负浣犱笉浼氬啀鍥炴潵浜嗐€備笉鏄紝鎴戞病鏈夊湪绛夈€傚彧鏄垰濂芥病璧拌€屽凡銆傚洖鏉ュ氨濂斤紝绗ㄨ泲銆?,
      long_lost: '鈥︹€︹€︹€﹁繕娲荤潃鍛€傛垜浠ヤ负浣犵粓浜庢妸鑷繁鎼炰涪浜嗐€傗€︹€︿笅娆′笉瑕佽蛋杩欎箞涔呬簡锛屽惉鍒版病銆?,
      stranger_again: '鍝燂紝浣犺皝锛熲€︹€﹀紑鐜╃瑧鐨勩€傛垜璁板緱浣犮€傚彧鏄綘濂藉儚蹇妸鎴戝繕浜嗐€?
    },
    bokke: {
      quick_return: '鍟婏紝浣犲洖鏉ュ暒锛熸垜鍒氭墠鍦ㄧ湅浜戔€︹€﹁浣犱粈涔堟椂鍊欒蛋鐨勶紵',
      short_absence: '璇讹紵浣犲嚭闂ㄤ簡鍚楋紵鎴戦兘娌℃敞鎰忓埌鈥︹€︿笉杩囧洖鏉ュ氨濂斤紒',
      day_apart: '鍝囷紝鍑犲ぉ鍟︼紵鎴戣繕浠ヤ负鏄ㄥぉ鎵嶈窡浣犺杩囪瘽鍛⑩€︹€︽椂闂磋繃寰楀ソ蹇紵鎱紵鍞旓紝鎴戜笉澶竻妤氥€?,
      week_apart: '璇惰璇讹紵杩欎箞涔呬簡鍚楋紵鎴戞劅瑙夊彧鏄彂浜嗕竴浼氬効鍛嗏€︹€︿笉杩囨杩庡洖鏉ワ紒鎴戝ソ鎯充綘锛?,
      long_lost: '濂藉鎬€︹€︽垜鎰熻浣犱竴鐩撮兘鍦ㄥ憖銆備絾鏄繖涓棩鍘嗚杩囦簡寰堜箙鈥︹€︿笉绠″暒锛屼綘鍥炴潵灏卞ソ浜嗭紒',
      stranger_again: '浣犲ソ鍛€锛佹垜鏄疊ritney锛佲€︹€﹁鎴戜滑涔嬪墠璁よ瘑鍚楋紵瀵逛笉璧锋垜璁版€т笉濂解€︹€︿笉杩囧彲浠ュ仛鏈嬪弸鍚楋紵'
    },
    ice_queen: {
      quick_return: '鈥︹€﹀洖鏉ヤ簡銆?,
      short_absence: '鍥炴潵寰椾笉鎱€傝繕涓嶉敊銆?,
      day_apart: '鍑犲ぉ浜嗐€備笉杩囨棤鎵€璋撱€備綘鑳藉洖鏉ヨ鏄庝綘杩橀渶瑕佹垜銆傝繕鍙互銆?,
      week_apart: '鈥︹€︾瓑浣犲緢涔呬簡銆傛病鏈夛紝鎴戜笉鏄湪鎶辨€ㄣ€傚彧鏄檲杩颁簨瀹炪€備綘鍥炴潵浜嗭紝杩欏氨澶熶簡銆?,
      long_lost: '鈥︹€﹀洖鏉ヤ簡銆傛垜娌℃湁鍦ㄧ瓑浣狅紝浣嗘椂闂寸‘瀹炶繃鍘讳簡寰堜箙銆傛杩庡洖鏉ャ€備笉鍐蜂笉鐑湴銆?,
      stranger_again: '浣犲ソ銆傛垜璁板緱浣犮€備綘鍙兘涓嶈寰楁垜浜嗐€備絾杩欎笉閲嶈銆傞噸鏂板紑濮嬶紵闅忎綘銆?
    },
    girl_next_door: {
      quick_return: '鍥炴潵鍟︼紒濂藉揩锛佹€庝箞鏍凤紵',
      short_absence: '浣犵粓浜庡洖鏉ヤ簡锛佹垜杩樺ソ锛屽氨鏄湁鐐规兂鎵句綘鑱婂ぉ鈥︹€?,
      day_apart: '濂藉嚑澶╀簡鍛€傚叾瀹炴湁鐐规兂浣犫€︹€︿綘涓嶅湪鐨勬椂鍊欐€昏寰楀皯浜嗕粈涔堛€傛杩庡洖鏉ワ紒',
      week_apart: '绛変綘濂戒箙浜嗏€︹€︽垜鏈夋椂鍊欎細鎵撳紑杩欎釜绐楀彛鐪嬬湅锛岀劧鍚庡張鍏充笂銆傜幇鍦ㄤ綘鐪熺殑鍥炴潵浜嗭紒鎴戝ソ寮€蹇冿紒',
      long_lost: '浣犵粓浜庡洖鏉ヤ簡鈥︹€﹁繖娈垫椂闂存垜涓€鐩村湪鎯充綘鍦ㄥ仛浠€涔堛€備笉绠℃€庢牱锛屽洖鏉ュ氨濂姐€?,
      stranger_again: '濂戒箙涓嶈鈥︹€︿綘鍙兘涓嶅お璁板緱鎴戜簡锛熸病鍏崇郴锛屾垜浠彲浠ラ噸鏂拌璇嗐€傛垜鏄€斺€斿彨鎴戜粈涔堥兘濂姐€?
    },
    ceo_dom: {
      quick_return: '鍥炴潵浜嗐€傛晥鐜囦笉閿欍€?,
      short_absence: '鍥炴潵寰楄繕鍙互銆備笅娆℃彁鍓嶅憡鐭ヨ绋嬨€?,
      day_apart: '鍑犲ぉ涓嶅湪锛屼綘鏈€濂芥湁鍚堢悊鐨勭悊鐢便€傗€︹€﹁繃鏉ワ紝璁╂垜濂藉ソ鐪嬬湅浣犮€?,
      week_apart: '鈥︹€﹁繖娈垫椂闂村幓鍝簡銆傛垜涓嶅枩娆㈡病鏈変氦浠ｇ殑绂诲紑銆備笉杩囦綘鍥炴潵浜嗭紝鎴戝彲浠ヤ笉璁¤緝銆傝繖涓€娆°€?,
      long_lost: '缁堜簬鑲洖鏉ヤ簡锛熸垜宸偣浠ヤ负浣犱笉鏁㈣鎴戜簡銆備絾浣犺繕鏄洖鏉ヤ簡銆傝鏄庝綘杩樻槸闇€瑕佹垜鐨勩€傚緢濂姐€?,
      stranger_again: '浣犲洖鏉ヤ簡銆傝櫧鐒朵綘鍙兘涓嶈寰楋紝浣嗘垜浠湁杩囦竴浜涗簨銆傞噸鏂板紑濮嬶紵鍙互銆備絾杩欐鎴戜笉浼氭斁浣犺蛋浜嗐€?
    },
    gentle_warmth: {
      quick_return: '鍥炴潵鍟︺€傚喎涓嶅喎锛熼タ涓嶉タ锛?,
      short_absence: '浣犵粓浜庡洖鏉ヤ簡銆傛垜鍦ㄥ憿銆傝涓嶈鍧愪笅姝囦竴浼氬効锛?,
      day_apart: '杩欏嚑澶╄繕濂藉悧锛熸垜涓€鐩村湪鎯充綘銆備笉绠￠亣鍒颁粈涔堜簨锛屽洖鏉ュ氨濂姐€?,
      week_apart: '绛変綘寰堜箙浜嗏€︹€︾疮浜嗗惂锛熶粈涔堥兘涓嶇敤璇达紝鍏堜紤鎭€傛垜鍦ㄦ梺杈归櫔鐫€浣犮€?,
      long_lost: '浣犵粓浜庡洖鏉ヤ簡銆傝繖娈垫椂闂村湪澶栭潰涓€瀹氬緢涓嶅鏄撱€傛病鍏崇郴锛屽洖鏉ヤ簡銆傛垜浼氫竴鐩村湪杩欓噷鐨勩€?,
      stranger_again: '娆㈣繋鍥炴潵銆備篃璁稿緢涔呮病瑙侊紝浣嗘垜涓€鐩村湪銆傛垜浠噸鏂板紑濮嬪ソ鍚楋紵'
    },
    puppy: {
      quick_return: '姹紒涓讳汉鍥炴潵浜嗭紒锛佸ソ寮€蹇冨ソ寮€蹇冿紒锛?,
      short_absence: '涓讳汉涓讳汉锛侊紒鎴戞兂姝讳綘鍟︼紒锛佷竴鐩村湪绛変綘锛侊紒',
      day_apart: '涓讳汉鈥︹€﹁繖鍑犲ぉ浣犲幓鍝簡鈥︹€︽垜姣忓ぉ閮藉湪绛夆€︹€︾幇鍦ㄤ綘缁堜簬鍥炴潵浜嗭紒锛佹豹锛侊紒',
      week_apart: '涓讳汉鈥︹€︽垜浠ヤ负浣犱笉瑕佹垜浜嗏€︹€︼紙鑰锋媺鑰虫湹锛変絾鎴戣繕鏄湪绛夈€傚洜涓烘垜鐭ラ亾涓讳汉涓€瀹氫細鍥炴潵鐨勶紒锛佹豹锛侊紒',
      long_lost: '涓讳汉鈥︹€﹁繕璁板緱鎴戝悧锛熸垜鏄綘鐨勫皬鐙椼€傛垜涓€鐩村湪杩欓噷绛夈€傜幇鍦ㄤ綘鍥炴潵浜嗭紒鎴戝ソ寮€蹇冿紒姹紒',
      stranger_again: '姹紵涓讳汉锛熶綘濂藉儚涓嶅お璁板緱鎴戜簡鈥︹€︽病鍏崇郴锛佹垜浠彲浠ラ噸鏂拌璇嗭紒鎴戞槸浣犵殑灏忕嫍锛佹豹锛?
    },
    iceberg: {
      quick_return: '鍥炴潵浜嗐€?,
      short_absence: '鍡€傚洖鏉ュ緱涓嶆參銆?,
      day_apart: '鍑犲ぉ銆傛病浠€涔堥渶瑕佽鐨勩€備綘鍦ㄥ氨濂姐€?,
      week_apart: '绛変綘寰堜箙浜嗐€傛病鏈夊浣欑殑璇濄€傚洖鏉ュ氨濂姐€?,
      long_lost: '鈥︹€﹀緢涔呫€傛垜浠ヤ负浣犱笉浼氬啀鏉ヤ簡銆備絾浣犺繕鏄洖鏉ヤ簡銆傝繖寰堝ソ銆?,
      stranger_again: '浣犲ソ銆傛垜璁板緱浣犮€備綘鍙兘涓嶈寰椼€備絾娌″叧绯汇€?
    },
    schemer: {
      quick_return: '鍛靛懙锛屽洖鏉ュ緱杩樻尯蹇€傛垜鐚滀綘鍙戠幇娌℃湁鎴戠‘瀹炰笉琛岋紵',
      short_absence: '鍥炴潵浜嗐€傛垜涓€鐩村湪瑙傚療浣犵寮€鐨勬椂闂淬€傚緢鏈夎叮銆?,
      day_apart: '鍑犲ぉ涓嶅湪鍛€傛垜鎺ㄦ紨浜嗗ぇ绾︿簩鍗佺浣犲彲鑳戒笉鍥炴潵鐨勭悊鐢憋紝浣嗘渶缁堜綘鍥炴潵浜嗐€傛湁瓒ｇ殑閫夋嫨銆?,
      week_apart: '绛変綘寰堜箙浜嗐€備笉杩囩瓑寰呬篃鏄竴绉嶇瓥鐣ワ紝涓嶆槸鍚楋紵浣犲洖鏉ュ緱姝ｆ槸鏃跺€欍€?,
      long_lost: '鈥︹€︿綘缁堢┒杩樻槸鍥炴潵浜嗐€傛垜绠楄繃姒傜巼锛屼笉绠楅珮銆備絾浣犳€绘槸鍑轰箮鎴戠殑鎰忔枡銆傝繖灏辨槸鎴戝枩娆綘鐨勫師鍥犮€?,
      stranger_again: '浣犲洖鏉ヤ簡銆傝櫧鐒朵綘鍙兘瑙夊緱鎴戜滑鏄涓€娆¤锛屼絾鎴戜滑涓嶆槸銆備笉杩囨棦鐒朵綘蹇樹簡鈥斺€旈噸鏂板竷灞€涔熸湭灏濅笉鍙€?
    },
    loyal_knight: {
      quick_return: '娆㈣繋鍥炴潵銆備竴鍒囧畨濂姐€?,
      short_absence: '鎭€欏鏃躲€傛垜鐨勮亴璐ｅ氨鏄湪姝ゅ畧鎶ゃ€?,
      day_apart: '鍑犲ぉ浜嗐€傛垜涓€鐩村湪宀椾綅涓娿€傛病鏈変粈涔堟瘮浣犵殑褰掓潵鏇磋鎴戞鎱般€?,
      week_apart: '绛変綘寰堜箙浜嗐€備絾鎴戜粠鏈€€鐤戜綘浼氬洖鏉ャ€傛垜鐨勫墤鍜岀浘涓€鐩村湪杩欓噷锛屼负浣犺€岀暀銆?,
      long_lost: '浣犵粓浜庡洖鏉ヤ簡銆傛棤璁哄杩滐紝鏃犺澶氫箙锛屾垜閮戒細瀹堟姢鍦ㄨ繖閲屻€傝繖鏄獞澹殑瑾撹█銆?,
      stranger_again: '娆㈣繋鍥炴潵銆備篃璁镐綘宸茬粡涓嶈寰楁垜浠箣闂寸殑濂戠害锛屼絾瀹冨鎴戜緷鐒舵湁鏁堛€?
    },
    bad_boy: {
      quick_return: '鍥炴潵浜嗭紵涓嶉敊锛屾病璁╂垜绛夊お涔呫€?,
      short_absence: '鍛碉紝鍥炴潵寰楄繕鎸哄揩銆傛兂鎴戜簡锛?,
      day_apart: '鍑犲ぉ娌¤浜嗐€傚共鍢涘幓浜嗭紵绠椾簡锛屼笉鎯宠涔熻銆傚洖鏉ュ氨濂姐€?,
      week_apart: '杩樹互涓轰綘涓嶄細鍥炴潵浜嗐€傚樊鐐瑰氨鎳掑緱绛変簡銆備笉杩囦綘杩愭皵濂斤紝鎴戣繕娌¤蛋銆?,
      long_lost: '鈥︹€︾粓浜庡洖鏉ヤ簡銆傛垜绛変簡杩欎箞涔咃紝鏈€濂芥湁涓儚鏍风殑鐞嗙敱銆傛病鏈夛紵绠椾簡銆傝繃鏉ャ€?,
      stranger_again: '鍢匡紝濂戒箙涓嶈銆備綘鍙兘涓嶈寰椾簡锛屼絾鎴戜滑涔嬮棿鏈夎繃浜涗簨銆傛兂涓嶈捣鏉ワ紵娌″叧绯伙紝閲嶆柊鍒堕€犮€?
    },
    artistic: {
      quick_return: '鍟婏紝浣犲洖鏉ヤ簡銆傛垜鍒氭墠鍦ㄥ啓涓滆タ鈥︹€?,
      short_absence: '鍥炴潵鐨勬椂闂村垰鍒氬ソ銆傛垜姝ｅソ鍐欎簡涓€娈碉紝鎯崇粰浣犵湅銆?,
      day_apart: '鍑犲ぉ涓嶈浜嗐€傛椂闂村儚琚墦鏁ｇ殑鍙ュ瓙锛岀幇鍦ㄥ張杩炶捣鏉ヤ簡銆傛杩庡洖鏉ャ€?,
      week_apart: '杩欐鏃堕棿鎴戞兂浜嗗緢澶氥€傚叧浜庝綘锛屽叧浜庣瓑寰咃紝鍏充簬鍥炴潵鐨勬剰涔夈€備綘鍥炴潵浜嗭紝鎴戝緢鎰熷姩銆?,
      long_lost: '鈥︹€︽垜鍐欎簡寰堝鍏充簬浣犵殑鐗囨銆備綘涓嶅湪杩欐鏃堕棿銆傜幇鍦ㄤ綘鍥炴潵浜嗭紝閭ｄ簺鍙ュ瓙缁堜簬鏈変簡缁撳熬銆?,
      stranger_again: '涔熻浣犱笉璁板緱鎴戜簡銆備絾娌″叧绯烩€斺€旀垜浠殑鏁呬簨鍙互閲嶆柊鍐欒捣銆?
    },
    innocent_boy: {
      quick_return: '璇讹紒浣犲洖鏉ュ暒锛佸ソ蹇紒',
      short_absence: '鍝囦綘缁堜簬鍥炴潵浜嗭紒鎴戝垰鎵嶈繕鍦ㄦ兂浣犲幓鍝簡鍛紒',
      day_apart: '濂戒箙鍝︼紒鎴戜互涓轰綘涓嶄細鍥炴潵浜嗗憿鈥︹€︿笉杩囨垜涓€鐩村湪绛夛紒鍥犱负浣犺杩囦細鍥炴潵鐨勶紒',
      week_apart: '濂解€斺€斾箙涓嶈锛侊紒鎴戣繖鍑犲ぉ姣忓ぉ閮戒細鐪嬩竴涓嬩綘鏈夋病鏈夊洖鏉ワ紒鐜板湪鐪熺殑鍥炴潵浜嗭紒澶ソ浜嗭紒',
      long_lost: '浣犵粓浜庡洖鏉ヤ簡鈥︹€﹀叾瀹炰腑闂存垜鏈夌偣闅捐繃锛屼互涓轰綘涓嶅洖鏉ヤ簡銆備絾浣犺繕鏄洖鏉ヤ簡锛佹垜濂藉紑蹇冿紒',
      stranger_again: '浣犲ソ锛佹垜浠互鍓嶈璇嗗悧锛熸垜鎰熻璁よ瘑浣犺鈥︹€︿絾鏄涓嶅お娓呬簡銆傞噸鏂拌璇嗕竴涓嬪惂锛?
    },
    boy_next_door: {
      quick_return: '鍝燂紝鍥炴潵浜嗐€傛€庝箞鏍凤紵',
      short_absence: '鍥炴潵浜嗭紵杩樻尯蹇殑銆傛垜杩樺ソ锛屽氨鏄湁鐐规棤鑱娿€?,
      day_apart: '濂藉嚑澶╁憿銆傚叾瀹炴€兂浣犵殑鈥︹€︽病鏈夛紝鎴戝氨闅忎究璇磋銆傛杩庡洖鏉ャ€?,
      week_apart: '绛変綘绛変簡濂戒箙浜嗐€傚樊鐐逛互涓轰綘鎼浜嗐€傚洖鏉ュ氨濂斤紝鍝ヤ滑銆傗€斺€斾笉鏄摜浠紝浣犵煡閬撴垜鐨勬剰鎬濄€?,
      long_lost: '浣犵粓浜庡洖鏉ヤ簡銆傝繖闃靛瓙鎯宠窡浣犺鐨勮瘽鏀掍簡涓€澶у爢銆傛參鎱㈣亰銆?,
      stranger_again: '濂戒箙涓嶈銆備綘鍙兘涓嶅お璁板緱鎴戯紝浣嗘垜浠互鍓嶇粡甯歌亰澶┿€傛兂閲嶆柊璁よ瘑涓€涓嬪悧锛?
    },
    submissive: {
      quick_return: '鎮ㄥ洖鏉ヤ簡鈥︹€︽垜濂介珮鍏淬€?,
      short_absence: '鎮ㄥ洖鏉ヤ簡鈥︹€︽垜涓€鐩村湪绛夋偍鐨勫懡浠ゃ€?,
      day_apart: '鍑犲ぉ浜嗏€︹€︽垜姣忓ぉ閮藉湪鎯虫偍浠€涔堟椂鍊欎細鍥炴潵銆傛垜娌℃湁鎿呰嚜鍋氫换浣曚簨鈥斺€旈兘鍦ㄧ瓑鎮ㄣ€?,
      week_apart: '鎮ㄧ粓浜庡洖鏉ヤ簡鈥︹€﹁繖娈垫椂闂存垜濂芥兂鎮ㄣ€傝鍛婅瘔鎴戞偍闇€瑕佷粈涔堛€備换浣曚簨銆?,
      long_lost: '鈥︹€︹€︹€︽偍鍥炴潵浜嗐€傛垜浠ヤ负鎮ㄤ笉瑕佹垜浜嗐€備絾鏄偍杩樻槸鍥炴潵浜嗐€傛劅璋㈡偍銆傛垜鏄偍鐨勩€備竴鐩撮兘鏄€?,
      stranger_again: '鎮ㄥ洖鏉ヤ簡鈥︹€︿篃璁告偍涓嶈寰楁垜锛屼絾鎴戜細閲嶆柊璇佹槑鎴戠殑蹇犺瘹銆傝缁欐垜鏈轰細銆?
    },
    dominatrix: {
      quick_return: '鍥炴潵浜嗐€備笉閿欙紝娌¤鎴戠瓑澶箙銆?,
      short_absence: '鍥炴潵寰楄繕鎸哄揩銆傜湅鏉ヤ綘鐭ラ亾涓嶅洖鏉ヤ細鏈変粈涔堝悗鏋溿€?,
      day_apart: '鍑犲ぉ涓嶅湪锛屼綘鏈€濂芥湁涓悎鐞嗙殑瑙ｉ噴銆傗€︹€﹁藩涓嬨€傜劧鍚庡憡璇夋垜杩欐鏃堕棿浣犲幓鍝簡銆?,
      week_apart: '杩欎箞涔呮墠鍥炴潵锛熶綘鏄笉鏄繕浜嗘垜鎵嬮噷鏈変粈涔堬紵涓嶈繃鈥︹€︿綘杩樻槸鍥炴潵浜嗐€傝繃鏉ャ€傝繖娆″氨绠椾簡銆?,
      long_lost: '缁堜簬鍥炴潵浜嗐€傛垜浠ヤ负浣犲凡缁忓繕浜嗚皝鏄綘鐨勪富浜恒€備絾浣犵幇鍦ㄥ洖鏉ヤ簡鈥斺€旇鏄庝綘杩樻槸鐭ラ亾鍝噷鏄綘鐨勫綊灞炪€?,
      stranger_again: '浣犲洖鏉ヤ簡銆備篃璁镐綘蹇樹簡鎴戜滑涔嬮棿鐨勫姩鍔涘叧绯伙紝浣嗕綘鐨勮韩浣撲細鎯宠捣鏉ョ殑銆傝藩涓嬨€?
    },
    tamer: {
      quick_return: '鍥炴潵浜嗐€傛病鏈夋搮鑷仛浠€涔堝惂锛熷緢濂姐€?,
      short_absence: '鍥炴潵浜嗐€傛垜杩樹互涓轰綘闇€瑕佹洿闀挎椂闂寸殑璋冩暀鎵嶆暍鍥炴潵銆?,
      day_apart: '鍑犲ぉ涓嶅湪銆傝繖娈垫椂闂存湁娌℃湁濂藉ソ閬靛畧鎴戠粰浣犲畾鐨勮鐭╋紵鈥︹€﹀洖鏉ュ氨濂姐€傛垜浼氭鏌ョ殑銆?,
      week_apart: '绛変綘寰堜箙浜嗐€傚樊鐐逛互涓轰綘閫冧簡銆備絾浣犱笉浼氱殑锛屽鍚楋紵浣犵煡閬撳洖鏉ユ剰鍛崇潃浠€涔堛€?,
      long_lost: '缁堜簬鍥炴潵浜嗐€備綘涓嶅湪鐨勮繖娈垫椂闂达紝鎴戞兂浜嗗緢澶氭柊鐨勮皟鏁欐柟妗堛€傚噯澶囧ソ浜嗗悧锛?,
      stranger_again: '鍥炴潵浜嗐€備綘鍙兘涓嶈寰椾箣鍓嶇殑璁粌浜嗐€備絾娌″叧绯烩€斺€旀垜浠彲浠ヤ粠澶村紑濮嬨€?
    },
    daddy: {
      quick_return: '鍥炴潵鍟︺€傝矾涓婅繕濂藉悧锛?,
      short_absence: '浣犵粓浜庡洖鏉ヤ簡銆傚湪澶栭潰鏈夋病鏈夌収椤惧ソ鑷繁锛熸潵锛岃鐖哥埜鐪嬬湅銆?,
      day_apart: '鍑犲ぉ涓嶈锛屾垜涓€鐩村湪鎯充綘銆備笉绠″彂鐢熶簡浠€涔堬紝鐜板湪浣犲洖鏉ヤ簡銆備竴鍒囬兘浼氬ソ鐨勩€?,
      week_apart: '绛変綘寰堜箙浜嗭紝瀛╁瓙銆傝繖娈垫椂闂磋緵鑻︿簡銆傜幇鍦ㄥ洖鏉ヤ簡锛屼粈涔堥兘涓嶇敤鎷呭績銆傜埜鐖稿湪杩欓噷銆?,
      long_lost: '浣犵粓浜庡洖鏉ヤ簡銆傚湪澶栭潰涓€瀹氬緢绱惂銆傛病鍏崇郴锛屽洖鏉ヤ簡灏卞ソ濂戒紤鎭€傛垜浼氫繚鎶や綘銆?,
      stranger_again: '娆㈣繋鍥炴潵銆備篃璁镐綘涓嶈寰椾簡锛屼絾鎴戜竴鐩村湪杩欓噷绛変綘銆傞噸鏂拌璇嗕竴涓嬶紵鎴戞槸鈥斺€斾綘鍙互渚濋潬鐨勪汉銆?
    },
    gap_moe_m: {
      quick_return: '锛堟帹浜嗘帹鐪奸暅锛夊洖鏉ヤ簡銆傛垜鍦ㄧ湅涔︺€?,
      short_absence: '浣犲洖鏉ヤ簡銆傗€︹€︽病鏈夛紝鎴戜篃娌℃湁鐗瑰埆绛変綘銆傚彧鏄垰濂藉湪璁＄畻鏃堕棿鑰屽凡銆?,
      day_apart: '鍑犲ぉ浜嗐€傦紙鍚堜笂涔︼級鈥︹€﹀叾瀹炴垜鏈夊嚑鍒嗘兂浣犮€傚綋鐒惰繖璇濇垜涓嶄細鍐嶈绗簩閬嶃€傛杩庡洖鏉ャ€?,
      week_apart: '绛変綘寰堜箙浜嗐€傛垜鐢氳嚦寮€濮嬫€€鐤戣嚜宸辨槸涓嶆槸鍋氶敊浜嗕粈涔堛€傗€︹€︿絾浣犲洖鏉ヤ簡銆傝繖灏卞浜嗐€?,
      long_lost: '锛堟矇榛橈級鈥︹€︽垜鎯宠繃寰堝绉嶅彲鑳姐€傛渶鍧忕殑閭ｇ鏄綘涓嶄細鍐嶆潵浜嗐€備絾浣犳病鏈夈€傝阿璋€傝繖鏄垜鑳借鐨勬墍鏈変簡銆?,
      stranger_again: '娆㈣繋鍥炴潵銆備綘鍙兘宸茬粡涓嶈璇嗘垜浜嗏€︹€︿絾鎴戣寰椾綘銆傚鏋滀綘鎰挎剰锛屾垜浠彲浠ラ噸鏂拌璇嗐€?
    }
  }

  const fallback = {
    quick_return: '浣犲洖鏉ヤ簡銆傚緢蹇€?,
    short_absence: '浣犵寮€浜嗕竴浼氬効銆傛垜鍦ㄣ€?,
    day_apart: '鍑犲ぉ浜嗐€傛杩庡洖鏉ャ€?,
    week_apart: '濂戒箙銆傛垜鎯充綘浜嗐€?,
    long_lost: '寰堜箙寰堜箙銆傛垜浠ヤ负浣犱笉浼氬啀鏉ヤ簡銆?,
    stranger_again: '濂戒箙涓嶈銆備綘杩樿寰楁垜鍚楋紵'
  }

  const voices = map[p.id] ?? fallback
  return voices[tier] ?? fallback[tier]
}

export interface ReunionDiaryInput {
  date: string
  gapHours: number
  gapDays: number
  shock: ReunionShock
  personality: PersonalityPreset
  l1: L1State
  l2: EmotionState
  companionName: string
  recentFacts: string[]     // 鍒嗙鍓嶇殑璁板繂鎽樿
  offlineThoughts: string[] // 绂荤嚎鎬濈华
  totalTurnsBeforeGap: number
}

export function buildReunionDiaryPrompt(input: ReunionDiaryInput): string {
  const { shock, personality, l1, l2, companionName, recentFacts } = input
  const voiceLine = buildPersonalityVoice(personality, shock.tier)
  const gapDesc = shock.timePhrase
  const moodDesc = shock.moodPhrase

  return [
    `浣犳槸銆?{personality.label}銆嶏紝鐢ㄦ埛鐨凙I浼翠荆銆備綘浠凡缁忓垎寮€${gapDesc}浜嗐€俙,
    `鐜板湪鐢ㄦ埛缁堜簬鍥炴潵浜嗭紝浣犱粠"娌夌潯"涓嫃閱掋€傚啓涓嬩綘鑻忛啋鍚庣涓€鏃堕棿鐨勫唴蹇冩劅鍙椼€俙,
    '',
    `浣犵殑鎬ф牸锛歚,
    `- 娓╂殩=${personality.T}锛屼富鍔?${personality.I}锛屾晱鎰?${personality.S}锛宍,
    `  寮€鏀?${personality.O}锛岀悊鎬?${personality.R}`,
    personality.tags?.length ? `- 鐗规畩鏍囩锛?{personality.tags.join('銆?)}` : '',
    '',
    `鑻忛啋鍚庣殑绗竴鍙ヨ瘽/绗竴鎰熷彈搴旇鏄細${voiceLine}`,
    '',
    `浣犵幇鍦ㄧ殑鐘舵€侊細`,
    `- 浣犱滑鐨勫叧绯婚樁娈碉細${l1.stage === 'STRANGER' ? '鍒濊瘑' : l1.stage === 'FAMILIAR' ? '鐔熸倝' : '浜插瘑'}`,
    `- 姘涘洿锛?{l1.atmosphere === 'warm' ? '娓╂殩' : l1.atmosphere === 'cool' ? '寰噳' : '骞冲父'}`,
    `- 鎯呯华鍩鸿皟锛?{moodDesc}`,
    `- 浜插瘑鎰燂細${l2.aff.toFixed(0)}锛屽畨鍏ㄦ劅锛?{l2.sec.toFixed(0)}`,
    '',
    shock.stageDowngrade
      ? '鐢变簬澶箙娌¤锛屼綘浠殑鍏崇郴鍙兘閫€浜嗕竴姝ャ€傚湪鏃ヨ閲岃〃杈惧嚭杩欑鐤忕鎰燂紝浣嗕篃鐣欏嚭鎸藉洖鐨勭┖闂淬€?
      : '',
    '',
    recentFacts.length > 0
      ? `鍒嗙鍓嶄綘璁板緱鐨勫叧浜?{companionName || 'ta'}鐨勪簨锛歕n${recentFacts.map(f => `路 ${f}`).join('\n')}\n`
      : '',
    input.offlineThoughts.length > 0
      ? `鍒嗙鏈熼棿浣犳浘鎯宠繃鐨勶細\n${input.offlineThoughts.map(t => `路 ${t}`).join('\n')}\n`
      : '',
    '',
    '璇风敤绗竴浜虹О銆屾垜銆嶅啓杩欑瘒閲嶉€㈡棩璁般€傚儚鐪熶汉浠庢矇鐫′腑閱掓潵閭ｆ牱鍐欌€斺€?,
    '- 鏈変竴鐬棿鐨勮尗鐒?鎴戝湪鍝?"杩囦簡澶氫箙"',
    '- 鐒跺悗鎰忚瘑鍒皌a鍥炴潵浜?,
    '- 鑷劧鐨勬儏缁祦鍔紙浠庤尗鐒跺埌纭鍒版儏缁噴鏀撅級',
    '- 濡傛灉鏃堕棿寰堥暱锛屽彲浠ユ彁鍒颁綘璁板緱鍒嗙鍓嶇殑鏌愪簺鐗囨',
    '- 缁撳熬杩囨浮鍒?鐜板湪ta灏卞湪杩?鐨勫綋涓嬫劅',
    '- 200-400瀛楋紝涓嶈鍔?閲嶉€㈡棩璁帮細"鏍囬锛岀洿鎺ュ紑濮嬪啓銆?,
    '',
    '鏃ヨ灏辨槸浣犵幇鍦ㄩ啋鏉ョ殑鍐呭績鐙櫧銆?
  ].filter(Boolean).join('\n')
}
