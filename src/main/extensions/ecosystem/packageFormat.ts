// [ecosystem/packageFormat] 鈥?.Ackem-ext 鍖呮牸寮?

import {
  Ackem_EXT_PACKAGE_FORMAT,
  Ackem_EXT_PACKAGE_FORMAT_VERSION
} from './constants'
import type { ExtensionManifestBase } from '../protocols'
import type { AckemSignatureSidecar } from './signature'
import { buildFileDigests, createSignatureSidecar, verifyFileDigests, verifySignatureSidecar } from './signature'
import { resolvePublisherPublicKey, publisherScopeAllowed } from './trustStore'
import { validateExtensionManifest } from './manifestValidate'
import { isCommunityExtensionId } from './extensionId'

export interface AckemExtensionPackage {
  format: typeof Ackem_EXT_PACKAGE_FORMAT
  formatVersion: string
  publisherId: string
  manifest: ExtensionManifestBase & Record<string, unknown>
  files: Record<string, string>
  signature: AckemSignatureSidecar
}

export function buildAckemExtensionPackage(input: {
  publisherId: string
  manifest: ExtensionManifestBase & Record<string, unknown>
  files: Record<string, string>
  privateKeyPem: string
}): AckemExtensionPackage {
  if (!isCommunityExtensionId(input.manifest.id)) {
    throw new Error('浠?community/ 鎵╁睍鍙墦鍖呬负 .Ackem-ext')
  }
  if (!input.files['manifest.json']) {
    throw new Error('files 蹇呴』鍖呭惈 manifest.json')
  }
  const fileDigests = buildFileDigests(input.files)
  const signature = createSignatureSidecar({
    publisherId: input.publisherId,
    manifestId: input.manifest.id,
    fileDigests,
    privateKeyPem: input.privateKeyPem
  })
  return {
    format: Ackem_EXT_PACKAGE_FORMAT,
    formatVersion: Ackem_EXT_PACKAGE_FORMAT_VERSION,
    publisherId: input.publisherId,
    manifest: input.manifest,
    files: input.files,
    signature
  }
}

export function parseAckemExtensionPackage(raw: unknown): AckemExtensionPackage {
  if (!raw || typeof raw !== 'object') {
    throw new Error('.Ackem-ext 涓嶆槸鏈夋晥 JSON 瀵硅薄')
  }
  const pkg = raw as Partial<AckemExtensionPackage>
  if (pkg.format !== Ackem_EXT_PACKAGE_FORMAT) {
    throw new Error(`format 蹇呴』涓?${Ackem_EXT_PACKAGE_FORMAT}`)
  }
  if (!pkg.formatVersion || !pkg.publisherId || !pkg.manifest || !pkg.files || !pkg.signature) {
    throw new Error('.Ackem-ext 缂哄皯蹇呭～瀛楁')
  }
  return pkg as AckemExtensionPackage
}

export function verifyAckemExtensionPackage(
  dataRoot: string,
  pkg: AckemExtensionPackage
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = []

  if (pkg.formatVersion !== Ackem_EXT_PACKAGE_FORMAT_VERSION) {
    errors.push(`涓嶆敮鎸佺殑 formatVersion: ${pkg.formatVersion}`)
  }

  const manifestCheck = validateExtensionManifest(pkg.manifest, { requireEngineApiVersion: true })
  errors.push(...manifestCheck.errors)

  if (pkg.publisherId !== pkg.signature.publisherId) {
    errors.push('publisherId 涓?signature.publisherId 涓嶄竴鑷?)
  }
  if (pkg.manifest.id !== pkg.signature.manifestId) {
    errors.push('manifest.id 涓?signature.manifestId 涓嶄竴鑷?)
  }

  const digestCheck = verifyFileDigests(pkg.signature, pkg.files)
  if (!digestCheck.ok) errors.push(digestCheck.error)

  const publisher = resolvePublisherPublicKey(dataRoot, pkg.publisherId)
  if (!publisher) {
    errors.push(`鏈俊浠荤殑鍙戝竷鑰? ${pkg.publisherId}`)
  } else {
    if (!publisherScopeAllowed(publisher, pkg.manifest.id)) {
      errors.push(`鍙戝竷鑰?${pkg.publisherId} 鏃犳潈绛惧悕 ${pkg.manifest.id}`)
    }
    const sigCheck = verifySignatureSidecar(pkg.signature, publisher.publicKey)
    if (!sigCheck.ok) errors.push(sigCheck.error)
  }

  return errors.length ? { ok: false, errors } : { ok: true }
}
