// [ecosystem/constants] 鈥?Ackem 鎵╁睍鐢熸€佸崗璁父閲?

/** 鎵╁睍寮曟搸 API 鍗忚鐗堟湰锛堜笌 DEVELOPER-EXTENSION-PROTOCOL.md 瀵归綈锛?*/
export const Ackem_ENGINE_API_VERSION = '1.0.0'

/** Ackem 搴旂敤鐗堟湰锛堜笌鍙戣鍖?extraMetadata.version 瀵归綈锛?*/
export const Ackem_APP_VERSION = '0.0.0'

/** .Ackem-ext 鍖呮牸寮忔爣璇?*/
export const Ackem_EXT_PACKAGE_FORMAT = 'Ackem-ext' as const

/** .Ackem-ext 鍖呮牸寮忕増鏈?*/
export const Ackem_EXT_PACKAGE_FORMAT_VERSION = '1.0.0'

/** 瀹樻柟鍐呯疆鎵╁睍鍛藉悕绌洪棿锛堥殢搴旂敤鍒嗗彂锛屾棤闇€绛惧悕锛?*/
export const NAMESPACE_OFFICIAL = 'Ackem' as const

/** 绀惧尯/marketplace 鎵╁睍鍛藉悕绌洪棿锛堥』绛惧悕 + 淇′换閾撅級 */
export const NAMESPACE_COMMUNITY = 'community' as const

/** 鐢ㄦ埛鑷垱 OpenForU 鎵╁睍鍛藉悕绌洪棿锛堟湰鏈?Plan 閮ㄧ讲锛屾棤闇€绛惧悕锛?*/
export const NAMESPACE_USER = 'u' as const

export type ExtensionNamespace =
  | typeof NAMESPACE_OFFICIAL
  | typeof NAMESPACE_COMMUNITY
  | typeof NAMESPACE_USER

export const EXTENSION_NAMESPACES: ExtensionNamespace[] = [
  NAMESPACE_OFFICIAL,
  NAMESPACE_COMMUNITY,
  NAMESPACE_USER
]

/** community 鎵╁睍钀界洏鏍圭洰褰曪紙鐩稿 dataRoot锛?*/
export const COMMUNITY_EXTENSIONS_REL = 'extensions/community'

/** 淇′换鍙戝竷鑰呭叕閽ョ洰褰曪紙鐩稿 dataRoot锛?*/
export const TRUST_STORE_REL = 'extensions/trust'

/** 甯傚満 catalog 缂撳瓨锛堢浉瀵?dataRoot锛屽彲閫夛級 */
export const MARKETPLACE_CATALOG_REL = 'extensions/marketplace/catalog.json'

/** 绛惧悕 sidecar 鏂囦欢鍚?*/
export const SIGNATURE_SIDECAR_FILENAME = '.Ackem-signature.json'
