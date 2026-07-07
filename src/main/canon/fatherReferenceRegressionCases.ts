/**
 * 鐖朵翰鎸囩О embedding 鍥炲綊鐢ㄤ緥 鈥?鐪熷疄鐢ㄦ埛璇存硶 + 鏈熸湜鍒嗙被
 * 渚?creatorMemory.embedding.test 涓?originOeg.engine.phrasing.test 鍏辩敤
 */
export type FatherRefExpectation = 'Ackem_creator' | 'user_family' | null

export type FatherRefRegressionCase = {
  q: string
  kind: FatherRefExpectation
  note?: string
}

/** 纭紪鐮?calibration锛氫笌 FATHER_REFERENCE_CALIBRATION 鍚屾缁存姢 */
export const FATHER_REF_REGRESSION_CASES: readonly FatherRefRegressionCase[] = [
  // 鈥斺€?Ackem 鍒涢€犺€?/ Jason 鈥斺€?
  { q: '浣犳槸璋佸垱閫犵殑锛?, kind: 'Ackem_creator' },
  { q: '璋侀€犱簡浣狅紵', kind: 'Ackem_creator' },
  { q: '璋佸垱閫犱簡浣狅紵', kind: 'Ackem_creator' },
  { q: '浣犵殑鍒涢€犺€呮槸璋?, kind: 'Ackem_creator' },
  { q: '浣犵殑鐖朵翰鏄皝', kind: 'Ackem_creator', note: '闂?Ackem 鏈汉' },
  { q: 'Jason 鍜屼綘鐨勫叧绯绘槸浠€涔堬紵', kind: 'Ackem_creator' },
  { q: 'Jason 鏄笉鏄綘鐖哥埜', kind: 'Ackem_creator' },
  { q: '璁茶浣犵殑鍑鸿韩鏁呬簨', kind: 'Ackem_creator' },
  { q: '鍐嶈璁蹭綘鐨勫嚭韬晠浜?, kind: 'Ackem_creator' },
  { q: '浣犳槸鎬庝箞琚€犲嚭鏉ョ殑锛?, kind: 'Ackem_creator' },
  { q: '缁х画璇磋鐖朵翰 Jason', kind: 'Ackem_creator' },
  { q: 'GitHub 涓婇偅涓?Jason 鏄綘浠€涔堜汉', kind: 'Ackem_creator' },
  { q: '浣犳兂瑙?Jason 鍚?, kind: 'Ackem_creator' },
  { q: '浣犵殑鐢熸棩鍜岀埗浜叉槸璋?, kind: 'Ackem_creator' },
  { q: 'Ackem 鏄皝鍋氬嚭鏉ョ殑', kind: 'Ackem_creator' },

  // 鈥斺€?鐢ㄦ埛鑷繁鐨勫浜?鈥斺€?
  { q: '鎴戠埜浠婂ぉ鍌垜鍥炲', kind: 'user_family' },
  { q: '鎴戝拰鎴戠埜鐖稿惖鏋朵簡', kind: 'user_family' },
  { q: '鏄ㄥぉ璺熸垜鐖搁€氫簡鐢佃瘽', kind: 'user_family' },
  { q: '鐖朵翰鑺傛兂缁欐垜鐖镐拱绀肩墿', kind: 'user_family' },
  { q: '鎴戝璁╂垜鍥炲幓鍚冮キ', kind: 'user_family' },
  { q: '鎴戠埞鍙堝敔鍙ㄤ簡', kind: 'user_family' },
  { q: '鎯虫垜鐖镐簡', kind: 'user_family' },
  { q: '鐖舵瘝鍌鐑︽浜?, kind: 'user_family' },

  // 鈥斺€?鏃犲叧闂茶亰锛堜笉搴旇Е鍙?OEG锛夆€斺€?
  { q: '浠婂ぉ澶╂皵涓嶉敊', kind: null },
  { q: '浣犲ソ鍛€', kind: null },
  { q: '鍦ㄥ悧', kind: null },
  { q: '鍒氬悆瀹岄キ鏈夌偣鍥?, kind: null },
  { q: '鍛ㄦ湯鎵撶畻鎵撴父鎴?, kind: null },
  { q: '杩欑數褰卞ソ鐪嬪悧', kind: null },
  { q: '鏅氬畨', kind: null },
]
