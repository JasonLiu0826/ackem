import type { DispatchCatalogEntry, DispatchConfig } from '../protocols'
import { isCoreExtension } from '../../../shared/coreExtensions'
import {
  DESKTOP_AGENT_GRAYSCALE_BANNER_ZH,
  isDesktopAgentGrayscalePreview
} from '../../../shared/desktopAgentFeature'
import { isDesktopAgentSettingsReady, type DesktopAgentSettingsSlice } from '../../../shared/desktopAgent'

const MIN_LEN = 4

/** 鐢ㄦ埛鍦ㄩ棶銆孊ritney 鑳藉仛浠€涔?/ 鏈変粈涔堝姛鑳姐€嶏紝鑰岄潪璇锋眰鍏蜂綋鑳藉姏鎴栨儏鎰熻瘽棰?*/
const LISTING_PATTERNS: RegExp[] = [
  /(?:浣爘Ackem|杩欒竟|绯荤粺).{0,12}(?:浼殀鑳絴鍙互|閮?.{0,8}(?:骞瞸鍋殀甯?.{0,8}(?:浠€涔坾鍟?/u,
  /(?:浣爘Ackem).{0,8}(?:浼殀鑳絴閮?.{0,6}(?:浜涗粈涔坾鍟浠€涔?(?:鍔熻兘|鑳藉姏)?/u,
  /(?:鏈墊閮芥湁|閮芥湁鍝簺).{0,4}(?:浠€涔坾鍟?(?:鍔熻兘|鑳藉姏|鏈簨|鐗归暱)/u,
  /(?:鍝簺|浠€涔?.{0,8}(?:鎵╁睍|鎻掍欢|[Ss]kill|鎶€鑳?/u,
  /浠嬬粛.{0,10}(?:涓€涓?{0,6})?(?:鍔熻兘|鑳藉姏|鎵╁睍)/u,
  /鑳藉共(?:浜涗粈涔坾鍟浠€涔?/u,
  /(?:鍔熻兘|鑳藉姏|鎵╁睍).{0,6}((?:閮??鏈??:鍝簺|浠€涔坾鍟?|娓呭崟|鍒楄〃)/u
]

/** 鎯呮劅/鍏崇郴/鍋囪绫婚棶鍙ワ紝鍕垮綋浣滆兘鍔涙竻鍗?*/
const LISTING_EXCLUDE: RegExp[] = [
  /(?:鐖眧鍠滄|鎯虫垜|鐢熸皵|闅捐繃|浼ゅ績|绂诲紑|杩樹細鍦▅闄??:鎴憒浣?|鍦ㄥ悧|杩樺湪鍚梶鏄皝|鍙粈涔?/u,
  /(?:浼氫笉浼殀鑳戒笉鑳?.{0,12}(?:楠梶浼鎶涘純|涓嶇悊)/u
]

const MODE_LABEL: Record<DispatchConfig['mode'], string> = {
  dispatched: '瀵硅瘽瑙﹀彂',
  autonomous: '鍚庡彴鑷姩',
  always_on: '甯搁┗',
  manual: '鎵嬪姩'
}

const STATUS_LABEL: Record<DispatchCatalogEntry['status'], string> = {
  active: '宸插惎鐢?,
  installed: '宸插畨瑁呮湭鍚敤',
  planned: '瑙勫垝涓?,
  disabled: '宸插仠鐢?,
  error: '寮傚父'
}

export type ExtensionCatalogListingOptions = {
  maxChars?: number
  /** 鐢佃剳鍔╂墜妯″紡宸插紑鍚椂鐨勮缁嗚兘鍔涘皬鑺?*/
  desktopAgentSection?: string
  settings?: DesktopAgentSettingsSlice & { disableChatTools?: boolean }
}

export function isExtensionCapabilityListingQuery(message: string): boolean {
  const trimmed = message.trim()
  if (trimmed.length < MIN_LEN) return false
  if (LISTING_EXCLUDE.some((re) => re.test(trimmed))) return false
  return LISTING_PATTERNS.some((re) => re.test(trimmed))
}

function isUsableNow(entry: DispatchCatalogEntry): boolean {
  return entry.status === 'active'
}

function unusableReason(entry: DispatchCatalogEntry): string {
  switch (entry.status) {
    case 'disabled':
      return '鎵╁睍涓績宸插叧闂紝闇€閲嶆柊鍚敤'
    case 'planned':
      return '瑙勫垝涓紝灏氭湭鎺ュ叆'
    case 'error':
      return '鍔犺浇寮傚父锛岃鍒版墿灞曚腑蹇冩鏌?
    case 'installed':
      return '宸插畨瑁呬絾鏈惎鐢?
    default:
      return '褰撳墠涓嶅彲鐢?
  }
}

function triggerHint(entry: DispatchCatalogEntry): string {
  const parts: string[] = []
  if (entry.dispatch.scenarios.length > 0) {
    parts.push(`鍦烘櫙锛?{entry.dispatch.scenarios.slice(0, 3).join('锛?)}`)
  }
  if (entry.dispatch.keywords.length > 0) {
    parts.push(`鍙锛?{entry.dispatch.keywords.slice(0, 4).join('銆?)}`)
  }
  if (entry.dispatch.slash?.length) {
    parts.push(`鎸囦护锛?{entry.dispatch.slash.slice(0, 3).join('銆?)}`)
  }
  const mode = MODE_LABEL[entry.dispatch.mode] ?? entry.dispatch.mode
  if (entry.dispatch.mode === 'manual') {
    parts.push('瑙﹀彂锛氶渶鍦ㄦ墿灞曚腑蹇冩垨鎸囦护鎵嬪姩鍚姩')
  } else if (entry.dispatch.mode === 'autonomous') {
    parts.push('瑙﹀彂锛氬悗鍙拌嚜鍔紝鏃犻渶姣忚疆瀵硅瘽')
  } else {
    parts.push(`瑙﹀彂锛?{mode}`)
  }
  return parts.filter(Boolean).join('锛?)
}

function formatUsableEntryLine(entry: DispatchCatalogEntry): string {
  const core = isCoreExtension(entry.id) ? ' 路 鍩虹鑳藉姏' : ''
  const summary = entry.dispatch.summary.trim()
  return `- 銆愬彲鐢ㄣ€?{entry.name}锛?{entry.category}${core}锛夛細${summary}銆?{triggerHint(entry)}`
}

function formatUnavailableEntryLine(entry: DispatchCatalogEntry): string {
  const status = STATUS_LABEL[entry.status] ?? entry.status
  const summary = entry.dispatch.summary.trim()
  return `- 銆愪笉鍙敤銆?{entry.name}锛?{entry.category} 路 ${status}锛夛細${summary}銆傚師鍥狅細${unusableReason(entry)}`
}

/** 骞冲彴绾у姛鑳斤紙闈炴墿灞曞簱 catalog 鏉＄洰锛夌殑鍙敤鎬ц鏄?*/
export function buildPlatformFeaturesSection(
  settings?: DesktopAgentSettingsSlice & { disableChatTools?: boolean }
): string {
  const lines = ['銆愬钩鍙板姛鑳?路 闈炴墿灞曞簱銆?]

  if (isDesktopAgentGrayscalePreview()) {
    lines.push(`- 銆愭殏鏈紑鏀俱€戠數鑴戝姪鎵嬶細${DESKTOP_AGENT_GRAYSCALE_BANNER_ZH}`)
  } else if (!isDesktopAgentSettingsReady(settings ?? {})) {
    lines.push(
      '- 銆愭湭灏辩华銆戠數鑴戝姪鎵嬶細宸插湪浜у搧涓紑鏀撅紝浣嗙敤鎴峰皻鏈畬鎴愯缃€傞渶鍒?璁剧疆 鈫?妯″瀷涓庤繛鎺?鈫?鐢佃剳鍔╂墜 鍚敤骞剁‘璁ら闄╋紝鍐嶅湪鑱婂ぉ鏍忓紑鍚€岀數鑴戝姪鎵嬨€嶆ā寮忋€?
    )
  } else {
    lines.push(
      '- 銆愬彲鐢烽渶寮€鍚ā寮忋€戠數鑴戝姪鎵嬶細璁剧疆宸插氨缁紱鐢ㄦ埛闇€鍦ㄨ亰澶╂爮鐐瑰紑銆岀數鑴戝姪鎵嬨€嶅悗锛屾柟鍙搷浣滄湰鏈烘枃浠朵笌搴旂敤锛堝疄楠岋級銆?
    )
  }

  lines.push(
    '- 銆愬彲鐢ㄣ€戝璇濋櫔浼?/ 闀挎湡璁板繂 / 鎯呯华鎰熺煡 / 鐭ヨ瘑鏁寸悊鍗＄墖锛氭湰浣撹兘鍔涳紝鏃犻渶鎵╁睍銆?,
    '- 銆愬彲鐢ㄣ€戣蹇嗗鍏ワ細璁板繂椤靛彲瀵煎叆 txt / md / json銆?,
    '- 銆愬彲鐢ㄣ€慜penForU Plan锛氱敤鎴峰彲璇淬€屽府鎴戝仛涓€涓?XX Skill/鎻掍欢銆嶅叡鍒涘彲閮ㄧ讲鎵╁睍銆?
  )

  return lines.join('\n')
}

/** 灏嗘墿灞曞簱 catalog 鏍煎紡鍖栦负 LLM 涓婁笅鏂囧潡锛堟寜鍙敤/涓嶅彲鐢ㄥ垎缁勶紝瀛楃棰勭畻鍐呮埅鏂級 */
export function buildExtensionCatalogListingBlock(
  catalog: DispatchCatalogEntry[],
  options?: ExtensionCatalogListingOptions
): string {
  const maxChars = options?.maxChars ?? 2800
  const usable = catalog.filter(isUsableNow)
  const unavailable = catalog.filter((e) => !isUsableNow(e))

  const lines: string[] = [
    '銆愭墿灞曡兘鍔涙竻鍗?路 鏈疆鑷姩妫€绱€?,
    '鐢ㄦ埛姝ｅ湪璇㈤棶 Ackem 鐨勮兘鍔?鍔熻兘銆備綘蹇呴』鍩轰簬涓嬪垪娓呭崟濡傚疄浠嬬粛锛屼繚鎸佷即渚ｅ彛鍚汇€?,
    '纭€ц鍒欙細',
    '1) 浠呫€屻€愬彲鐢ㄣ€戙€嶉」鍙互璇淬€屾垜鑳藉府浣犫€︺€嶅苟涓句緥瑙﹀彂鏂瑰紡锛涖€屻€愪笉鍙敤銆戙€嶃€屻€愭殏鏈紑鏀俱€戙€嶅彧鑳借鏄庡瓨鍦ㄦ垨鍘熷洜锛岀姝㈠亣绉拌兘鎵ц銆?,
    '2) 绂佹缂栭€犳湭鍦ㄦ竻鍗曚腑鐨勬墿灞曘€丼kill銆佹彃浠舵垨鍋囩О鏈疆宸叉墽琛屾煇鎿嶄綔銆?,
    '3) 涓嶈鏁疯銆屽姛鑳藉鐫€鍛€嶅嵈涓嶄妇渚嬶紱鑷冲皯姒傛嫭鏈綋鑳藉姏 + 2~3 涓€愬彲鐢ㄣ€戞墿灞曪紱鑻ユ湁銆愪笉鍙敤銆?銆愭殏鏈紑鏀俱€戦」鍙悇鎻?1 涓€?,
    ''
  ]

  lines.push(buildPlatformFeaturesSection(options?.settings), '')

  if (options?.desktopAgentSection) {
    lines.push(options.desktopAgentSection, '')
  }

  if (usable.length > 0) {
    lines.push(`鎵╁睍搴?路 褰撳墠鍙敤锛?{usable.length}锛夛細`)
    for (const entry of usable) lines.push(formatUsableEntryLine(entry))
    lines.push('')
  } else {
    lines.push('鎵╁睍搴?路 褰撳墠鍙敤锛氭殏鏃狅紙鍙埌鎵╁睍涓績鍚敤锛屾垨鐢?Plan 鏂板缓锛夈€?, '')
  }

  if (unavailable.length > 0) {
    lines.push(`鎵╁睍搴?路 鏆備笉鍙敤锛?{unavailable.length}锛夛細`)
    for (const entry of unavailable.slice(0, 14)) lines.push(formatUnavailableEntryLine(entry))
    if (unavailable.length > 14) {
      lines.push(`- 鈥﹀彟鏈?${unavailable.length - 14} 椤规殏涓嶅彲鐢紝鍙埌鎵╁睍涓績鏌ョ湅`)
    }
    lines.push('')
  }

  lines.push(
    '鍥炲寤鸿锛氬厛涓€鍙ヨ瘽姒傛嫭 Ackem 鑳藉仛浠€涔堬紝鍐嶆寜骞冲彴鍔熻兘 鈫?鍙敤鎵╁睍 鈫掞紙濡傛湁锛夋殏涓嶅彲鐢?鏈紑鏀?鍒嗗眰璇存槑锛涚敤鎴锋兂鏂拌兘鍔涙椂寮曞 Plan銆?
  )

  let block = lines.join('\n')
  if (block.length > maxChars) {
    block = `${block.slice(0, maxChars - 20).trimEnd()}\n鈥︼紙娓呭崟宸叉埅鏂級`
  }
  return block
}
