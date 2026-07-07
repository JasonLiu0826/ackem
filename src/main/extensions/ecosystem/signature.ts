// [ecosystem/signature] 鈥?Ed25519 绛惧悕涓庢枃浠舵憳瑕?

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify
} from 'node:crypto'
import { Ackem_EXT_PACKAGE_FORMAT_VERSION } from './constants'

export type SignatureAlgorithm = 'ed25519'

export interface FileDigestMap {
  [relativePath: string]: string
}

export interface SignaturePayload {
  formatVersion: string
  publisherId: string
  manifestId: string
  fileDigests: FileDigestMap
}

export interface AckemSignatureSidecar {
  formatVersion: string
  publisherId: string
  algorithm: SignatureAlgorithm
  signedAt: string
  manifestId: string
  fileDigests: FileDigestMap
  signature: string
}

export interface PublisherKeyPair {
  publisherId: string
  publicKeyPem: string
  privateKeyPem: string
}

function canonicalStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((v) => canonicalStringify(v)).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',')}}`
}

export function sha256Digest(content: string | Buffer): string {
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content
  return `sha256:${createHash('sha256').update(buf).digest('hex')}`
}

export function buildSignaturePayload(input: SignaturePayload): string {
  return canonicalStringify({
    formatVersion: input.formatVersion,
    publisherId: input.publisherId,
    manifestId: input.manifestId,
    fileDigests: sortDigestMap(input.fileDigests)
  })
}

function sortDigestMap(map: FileDigestMap): FileDigestMap {
  const sorted: FileDigestMap = {}
  for (const key of Object.keys(map).sort()) {
    sorted[key] = map[key]
  }
  return sorted
}

export function signPayload(payload: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem)
  return sign(null, Buffer.from(payload, 'utf-8'), key).toString('base64')
}

export function verifyPayload(payload: string, signatureBase64: string, publicKeyPem: string): boolean {
  try {
    const key = createPublicKey(publicKeyPem)
    return verify(
      null,
      Buffer.from(payload, 'utf-8'),
      key,
      Buffer.from(signatureBase64, 'base64')
    )
  } catch {
    return false
  }
}

export function buildFileDigests(files: Record<string, string>): FileDigestMap {
  const digests: FileDigestMap = {}
  for (const [path, content] of Object.entries(files)) {
    digests[path] = sha256Digest(content)
  }
  return sortDigestMap(digests)
}

export function createSignatureSidecar(input: {
  publisherId: string
  manifestId: string
  fileDigests: FileDigestMap
  privateKeyPem: string
  signedAt?: string
}): AckemSignatureSidecar {
  const payload = buildSignaturePayload({
    formatVersion: Ackem_EXT_PACKAGE_FORMAT_VERSION,
    publisherId: input.publisherId,
    manifestId: input.manifestId,
    fileDigests: input.fileDigests
  })
  return {
    formatVersion: Ackem_EXT_PACKAGE_FORMAT_VERSION,
    publisherId: input.publisherId,
    algorithm: 'ed25519',
    signedAt: input.signedAt ?? new Date().toISOString(),
    manifestId: input.manifestId,
    fileDigests: sortDigestMap(input.fileDigests),
    signature: signPayload(payload, input.privateKeyPem)
  }
}

export function verifySignatureSidecar(
  sidecar: AckemSignatureSidecar,
  publicKeyPem: string
): { ok: true } | { ok: false; error: string } {
  if (sidecar.algorithm !== 'ed25519') {
    return { ok: false, error: `涓嶆敮鎸佺殑绛惧悕绠楁硶: ${sidecar.algorithm}` }
  }
  const payload = buildSignaturePayload({
    formatVersion: sidecar.formatVersion,
    publisherId: sidecar.publisherId,
    manifestId: sidecar.manifestId,
    fileDigests: sidecar.fileDigests
  })
  const valid = verifyPayload(payload, sidecar.signature, publicKeyPem)
  if (!valid) return { ok: false, error: '绛惧悕楠岃瘉澶辫触' }
  return { ok: true }
}

export function verifyFileDigests(
  sidecar: AckemSignatureSidecar,
  files: Record<string, string>
): { ok: true } | { ok: false; error: string } {
  for (const [path, expected] of Object.entries(sidecar.fileDigests)) {
    if (!(path in files)) {
      return { ok: false, error: `缂哄皯绛惧悕瑕嗙洊鐨勬枃浠? ${path}` }
    }
    const actual = sha256Digest(files[path]!)
    if (actual !== expected) {
      return { ok: false, error: `鏂囦欢鎽樿涓嶅尮閰? ${path}` }
    }
  }
  return { ok: true }
}

/** 娴嬭瘯 / 寮€鍙戠敤锛氱敓鎴愪复鏃跺彂甯冭€呭瘑閽ュ */
export function generatePublisherKeyPair(publisherId: string): PublisherKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publisherId,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  }
}
