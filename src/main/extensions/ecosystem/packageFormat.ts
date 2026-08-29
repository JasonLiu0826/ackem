// [ecosystem/packageFormat] — .britney-ext 包格式

import {
  BRITNEY_EXT_PACKAGE_FORMAT,
  BRITNEY_EXT_PACKAGE_FORMAT_VERSION
} from './constants'
import type { ExtensionManifestBase } from '../protocols'
import type { BritneySignatureSidecar } from './signature'
import { buildFileDigests, createSignatureSidecar, verifyFileDigests, verifySignatureSidecar } from './signature'
import { resolvePublisherPublicKey, publisherScopeAllowed } from './trustStore'
import { validateExtensionManifest } from './manifestValidate'
import { isCommunityExtensionId } from './extensionId'

export interface BritneyExtensionPackage {
  format: typeof BRITNEY_EXT_PACKAGE_FORMAT
  formatVersion: string
  publisherId: string
  manifest: ExtensionManifestBase & Record<string, unknown>
  files: Record<string, string>
  signature: BritneySignatureSidecar
}

export function buildBritneyExtensionPackage(input: {
  publisherId: string
  manifest: ExtensionManifestBase & Record<string, unknown>
  files: Record<string, string>
  privateKeyPem: string
}): BritneyExtensionPackage {
  if (!isCommunityExtensionId(input.manifest.id)) {
    throw new Error('仅 community/ 扩展可打包为 .britney-ext')
  }
  if (!input.files['manifest.json']) {
    throw new Error('files 必须包含 manifest.json')
  }
  const fileDigests = buildFileDigests(input.files)
  const signature = createSignatureSidecar({
    publisherId: input.publisherId,
    manifestId: input.manifest.id,
    fileDigests,
    privateKeyPem: input.privateKeyPem
  })
  return {
    format: BRITNEY_EXT_PACKAGE_FORMAT,
    formatVersion: BRITNEY_EXT_PACKAGE_FORMAT_VERSION,
    publisherId: input.publisherId,
    manifest: input.manifest,
    files: input.files,
    signature
  }
}

export function parseBritneyExtensionPackage(raw: unknown): BritneyExtensionPackage {
  if (!raw || typeof raw !== 'object') {
    throw new Error('.britney-ext 不是有效 JSON 对象')
  }
  const pkg = raw as Partial<BritneyExtensionPackage>
  if (pkg.format !== BRITNEY_EXT_PACKAGE_FORMAT) {
    throw new Error(`format 必须为 ${BRITNEY_EXT_PACKAGE_FORMAT}`)
  }
  if (!pkg.formatVersion || !pkg.publisherId || !pkg.manifest || !pkg.files || !pkg.signature) {
    throw new Error('.britney-ext 缺少必填字段')
  }
  return pkg as BritneyExtensionPackage
}

export function verifyBritneyExtensionPackage(
  dataRoot: string,
  pkg: BritneyExtensionPackage
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = []

  if (pkg.formatVersion !== BRITNEY_EXT_PACKAGE_FORMAT_VERSION) {
    errors.push(`不支持的 formatVersion: ${pkg.formatVersion}`)
  }

  const manifestCheck = validateExtensionManifest(pkg.manifest, { requireEngineApiVersion: true })
  errors.push(...manifestCheck.errors)

  if (pkg.publisherId !== pkg.signature.publisherId) {
    errors.push('publisherId 与 signature.publisherId 不一致')
  }
  if (pkg.manifest.id !== pkg.signature.manifestId) {
    errors.push('manifest.id 与 signature.manifestId 不一致')
  }

  const digestCheck = verifyFileDigests(pkg.signature, pkg.files)
  if (!digestCheck.ok) errors.push(digestCheck.error)

  const publisher = resolvePublisherPublicKey(dataRoot, pkg.publisherId)
  if (!publisher) {
    errors.push(`未信任的发布者: ${pkg.publisherId}`)
  } else {
    if (!publisherScopeAllowed(publisher, pkg.manifest.id)) {
      errors.push(`发布者 ${pkg.publisherId} 无权签名 ${pkg.manifest.id}`)
    }
    const sigCheck = verifySignatureSidecar(pkg.signature, publisher.publicKey)
    if (!sigCheck.ok) errors.push(sigCheck.error)
  }

  return errors.length ? { ok: false, errors } : { ok: true }
}
