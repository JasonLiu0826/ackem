export {
  BRITNEY_ENGINE_API_VERSION,
  BRITNEY_APP_VERSION,
  BRITNEY_EXT_PACKAGE_FORMAT,
  BRITNEY_EXT_PACKAGE_FORMAT_VERSION,
  NAMESPACE_OFFICIAL,
  NAMESPACE_COMMUNITY,
  NAMESPACE_USER,
  EXTENSION_NAMESPACES,
  COMMUNITY_EXTENSIONS_REL,
  TRUST_STORE_REL,
  MARKETPLACE_CATALOG_REL,
  SIGNATURE_SIDECAR_FILENAME
} from './constants'

export {
  parseExtensionId,
  isValidExtensionId,
  isOfficialExtensionId,
  isCommunityExtensionId,
  isUserExtensionId,
  extensionNamespace,
  formatExtensionId
} from './extensionId'

export { semverSatisfies } from './semverRange'

export {
  sha256Digest,
  buildSignaturePayload,
  signPayload,
  verifyPayload,
  buildFileDigests,
  createSignatureSidecar,
  verifySignatureSidecar,
  verifyFileDigests,
  generatePublisherKeyPair
} from './signature'
export type {
  SignatureAlgorithm,
  FileDigestMap,
  SignaturePayload,
  BritneySignatureSidecar,
  PublisherKeyPair
} from './signature'

export {
  loadTrustStore,
  saveTrustStore,
  upsertTrustedPublisher,
  resolvePublisherPublicKey,
  publisherScopeAllowed,
  trustStorePath
} from './trustStore'
export type { TrustedPublisher, TrustStoreDocument } from './trustStore'

export {
  validateExtensionManifest,
  assertValidExtensionManifest
} from './manifestValidate'
export type { ManifestValidationOptions, ManifestValidationResult } from './manifestValidate'

export {
  buildBritneyExtensionPackage,
  parseBritneyExtensionPackage,
  verifyBritneyExtensionPackage
} from './packageFormat'
export type { BritneyExtensionPackage } from './packageFormat'

export {
  installCommunityPackage,
  installCommunityPackageFromFile,
  listInstalledCommunityIds,
  communitySkillsDir,
  communityPluginsDir
} from './install'

export {
  CommunityExtensionLoader,
  verifyInstalledCommunityBundle
} from './communityLoader'
export type { CommunitySkillInstance, CommunityPluginInstance } from './communityLoader'
