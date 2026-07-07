import type { DesktopAgentSettingsSlice } from './desktopAgent'
import { buildDesktopAgentModeRulesBlock } from './desktopAgentModePolicy'

export type DesktopAgentCapabilityLine = {
  /** 鐢ㄦ埛鍚戣〃杩扮殑鍒嗙粍鍚?*/
  label: string
  /** 褰撳墠璁剧疆涓嬫槸鍚﹀彲鐢?*/
  enabled: boolean
  /** 鍏蜂綋鑳藉仛浠€涔?/ 濡備綍寮€鍚?*/
  detail: string
}

function on(settings: DesktopAgentSettingsSlice, key: keyof DesktopAgentSettingsSlice): boolean {
  return settings[key] === true
}

/** 鎸夌敤鎴疯缃敓鎴愮數鑴戝姪鎵嬭兘鍔涙潯鐩紙涓昏繘绋嬩笌鎻愮ず娉ㄥ叆鍏辩敤锛?*/
export function listDesktopAgentCapabilities(
  settings: DesktopAgentSettingsSlice
): DesktopAgentCapabilityLine[] {
  const fileWrite = on(settings, 'desktopAgentAllowFileWrite')
  const fileWriteDetail = fileWrite
    ? [
        '澶嶅埗/绉诲姩/閲嶅懡鍚?,
        '鏂板缓鏂囦欢澶?,
        '鍐欏叆鏂囨湰',
        on(settings, 'desktopAgentAllowDelete') ? '鍒犻櫎' : '鍒犻櫎锛堟湭鍦ㄨ缃腑鍏佽锛?
      ].join('銆?)
    : '闇€鍦ㄨ缃?鈫?妯″瀷涓庤繛鎺?鈫?鐢佃剳鍔╂墜涓紑鍚€屽厑璁稿啓鍏ユ枃浠躲€?

  const download = on(settings, 'desktopAgentAllowDownload')
  const downloadDetail = download
    ? [
        '浠?HTTPS 涓嬭浇鍒伴粯璁ゆ垨鎸囧畾鐩綍',
        on(settings, 'desktopAgentAllowInstall')
          ? '涓嬭浇骞惰繍琛屽畨瑁呭寘锛堥渶鐢ㄦ埛纭锛?
          : '杩愯瀹夎鍖咃紙鏈湪璁剧疆涓厑璁革級'
      ].join('锛?)
    : '闇€鍦ㄨ缃腑寮€鍚€屽厑璁镐笅杞姐€?

  return [
    {
      label: '娴忚涓庢煡鎵?,
      enabled: true,
      detail: '鍒楀嚭鏂囦欢澶瑰唴瀹广€佹寜鍚嶇О鎼滅储鏂囦欢銆佹煡鐪嬫枃浠朵俊鎭€佸湪鐩綍鍐呮悳绱㈡枃瀛椼€佽鍙栫函鏂囨湰'
    },
    {
      label: '鎵撳紑涓庢煡鐪?,
      enabled: true,
      detail: '鎵撳紑鏂囦欢澶广€佺敤绯荤粺榛樿绋嬪簭鎵撳紑鏂囦欢'
    },
    {
      label: '璇诲彇鏂囨。涓庡浘鐗?,
      enabled: on(settings, 'desktopAgentAllowDocumentRead'),
      detail: on(settings, 'desktopAgentAllowDocumentRead')
        ? '璇诲彇 Office/PDF 绛夋枃妗ｄ笌鍥剧墖锛岀敤浜庣悊瑙ｅ唴瀹瑰悗鍥炵瓟鐢ㄦ埛'
        : '闇€鍦ㄨ缃腑寮€鍚€屽厑璁歌鍙栨枃妗?鍥剧墖銆?
    },
    {
      label: '搴旂敤绋嬪簭',
      enabled: on(settings, 'desktopAgentAllowAppControl'),
      detail: on(settings, 'desktopAgentAllowAppControl')
        ? '鎵撳紑/鍏抽棴杞欢銆佸皢绐楀彛甯﹀埌鍓嶅彴'
        : '闇€鍦ㄨ缃腑寮€鍚€屽厑璁告帶鍒跺簲鐢ㄧ▼搴忋€?
    },
    {
      label: '鏁寸悊涓庝慨鏀规枃浠?,
      enabled: fileWrite,
      detail: fileWriteDetail
    },
    {
      label: '涓嬭浇涓庡畨瑁?,
      enabled: download,
      detail: downloadDetail
    },
    {
      label: '瀵煎叆 Ackem',
      enabled: true,
      detail: '灏嗘湰鍦版枃浠跺鍏?Ackem 鐭ヨ瘑搴?
    }
  ]
}

function formatCapabilityLines(lines: DesktopAgentCapabilityLine[]): string {
  return lines
    .map((line) =>
      line.enabled
        ? `- ${line.label}锛?{line.detail}`
        : `- ${line.label}锛堝綋鍓嶆湭寮€锛夛細${line.detail}`
    )
    .join('\n')
}

/** 鐢佃剳鍔╂墜妯″紡寮€鍚椂锛屾瘡杞敞鍏ョ殑绯荤粺鎻愮ず */
export function buildDesktopAgentModeSystemHint(settings: DesktopAgentSettingsSlice): string {
  const capabilities = formatCapabilityLines(listDesktopAgentCapabilities(settings))
  const rules = buildDesktopAgentModeRulesBlock('zh')
  return [
    '銆愮數鑴戝姪鎵嬫ā寮?路 宸插紑鍚€?,
    '鐢ㄦ埛鍦ㄦ湰浼氳瘽寮€鍚簡瀹為獙鎬х數鑴戝姪鎵嬨€傛妯″紡涓嬪彧澶勭悊鏈満鏂囦欢涓庡簲鐢紝涓嶈皟鐢ㄨ仈缃戞悳绱㈡垨鍏跺畠鎵╁睍鎶€鑳斤紱涓庣敤鎴风殑瀵硅瘽璁板繂锛坋mbedding锛変粛鍙娇鐢ㄣ€?,
    '',
    '妯″紡瑙勫垯锛?,
    rules,
    '',
    '浣犲彲閫氳繃宸ュ叿 use_computer 鍦ㄧ敤鎴?Windows 鐢佃剳涓婃墽琛屼笅鍒楁搷浣溿€?,
    '浜や簰瑙勫垯锛?,
    '1) 淇濇寔 Ackem 浼翠荆璇皵锛涚敤鎴烽棶銆岃兘鍋氫粈涔?浣犱細浠€涔堛€嶆椂锛岀敤鑷劧涓枃姒傛嫭涓嬪垪宸插紑鏀捐兘鍔涘苟缁?1~2 涓緥瀛愶紝涓嶈鍫嗚矾寰勩€佸懡浠ゅ悕鎴?action 鏋氫妇銆?,
    '2) 鐢ㄦ埛鎻愬嚭鍏蜂綋浠诲姟鏃讹紝鍏堟緞娓呯己澶变俊鎭紙璺緞銆佹枃浠跺悕銆佽鎵撳紑鐨勫簲鐢ㄧ瓑锛夛紝鍐嶈皟鐢?use_computer锛涙瘡娆″疄闄呮搷浣滃墠鐢ㄦ埛浼氬湪寮圭獥涓‘璁わ紙鍙€夈€屽厑璁告湰杞叏閮ㄣ€嶈烦杩囧悗缁彧璇绘搷浣滅‘璁わ級銆?,
    '3) 闂€岀數鑴戦噷鏈夊摢浜涙父鎴?鏂囨。銆嶆椂锛屼紭鍏堜緷鎹湰鏈烘煡鎵剧粨鏋滃洖绛旓紝涓嶈缂栭€犳湭鎵弿鍒扮殑鏉＄洰锛屼笉瑕佹敼鐢ㄨ仈缃戞悳绱€?,
    '4) 鏍囨敞銆屽綋鍓嶆湭寮€銆嶇殑鑳藉姏涓嶈鍋囩О鍙敤锛涘彲鎻愮ず鐢ㄦ埛鍒拌缃噷寮€鍚搴旀潈闄愩€?,
    '5) 绂佹鎿嶄綔 Windows 绯荤粺鐩綍锛涘叧闂?explorer 绛夌郴缁熻繘绋嬩細琚嫤鎴紱鏁忔劅璺緞鐢ㄦ埛浼氱湅鍒伴澶栬鍛娿€?,
    '6) 澶嶆潅浠诲姟锛堝鎵炬父鎴忋€佹暣鐞嗘枃浠跺す锛夊簲杩炵画澶氭璋冪敤 use_computer 鑷鎺㈢储锛屾眹鎬诲悗鍐嶅洖绛旓紝涓嶈姣忔煡涓€涓洰褰曞氨鍋滀笅鏉ラ棶鐢ㄦ埛銆?,
    '',
    '褰撳墠鍙敤鑳藉姏锛?,
    capabilities,
    '',
    '涓句緥锛堝嬁鐓ф妱锛夛細銆屽府鎴戞妸妗岄潰涓婄殑 PDF 鎵惧嚭鏉ャ€嶃€岃涓€涓嬭繖浠?Word 鐨勫ぇ绾层€嶃€屾墦寮€ Chrome銆嶃€屾妸杩欎釜鏂囦欢澶归噷鐨?txt 鍚堝苟銆?
  ].join('\n')
}

/** 鑳藉姏娓呭崟绫婚棶棰樹笓鐢細宓屽叆鎵╁睍 catalog 鍧楃殑鐢佃剳鍔╂墜灏忚妭 */
export function buildDesktopAgentCatalogSection(settings: DesktopAgentSettingsSlice): string {
  const capabilities = formatCapabilityLines(listDesktopAgentCapabilities(settings))
  return [
    '銆愮數鑴戝姪鎵?路 鏈細璇濆凡寮€鍚€?,
    '闄や笅鍒楁墿灞曞锛屾湰杞敤鎴疯繕寮€鍚簡瀹為獙鎬х數鑴戝姪鎵嬶紙use_computer锛夈€備粙缁嶈兘鍔涙椂鍔″繀鍖呭惈鐢佃剳鍔╂墜锛屽苟鎸夈€屽綋鍓嶅彲鐢ㄨ兘鍔涖€嶅瀹炶鏄庯紱鏈紑鏀鹃」璇存槑闇€鍦ㄨ缃腑寮€鍚€?,
    '',
    capabilities
  ].join('\n')
}
