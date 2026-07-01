// [ecosystem/constants] — Ackem 扩展生态协议常量

/** 扩展引擎 API 协议版本（与 DEVELOPER-EXTENSION-PROTOCOL.md 对齐） */
export const ACKEM_ENGINE_API_VERSION = '1.0.0'

/** Ackem 应用版本（与发行包 extraMetadata.version 对齐） */
export const ACKEM_APP_VERSION = '0.0.0'

/** .ackem-ext 包格式标识 */
export const ACKEM_EXT_PACKAGE_FORMAT = 'ackem-ext' as const

/** .ackem-ext 包格式版本 */
export const ACKEM_EXT_PACKAGE_FORMAT_VERSION = '1.0.0'

/** 官方内置扩展命名空间（随应用分发，无需签名） */
export const NAMESPACE_OFFICIAL = 'ackem' as const

/** 社区/marketplace 扩展命名空间（须签名 + 信任链） */
export const NAMESPACE_COMMUNITY = 'community' as const

/** 用户自创 OpenForU 扩展命名空间（本机 Plan 部署，无需签名） */
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

/** community 扩展落盘根目录（相对 dataRoot） */
export const COMMUNITY_EXTENSIONS_REL = 'extensions/community'

/** 信任发布者公钥目录（相对 dataRoot） */
export const TRUST_STORE_REL = 'extensions/trust'

/** 市场 catalog 缓存（相对 dataRoot，可选） */
export const MARKETPLACE_CATALOG_REL = 'extensions/marketplace/catalog.json'

/** 签名 sidecar 文件名 */
export const SIGNATURE_SIDECAR_FILENAME = '.ackem-signature.json'
