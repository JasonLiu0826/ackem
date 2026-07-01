// [ecosystem/trustStore] — 发布者公钥信任链

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TRUST_STORE_REL } from './constants'
import type { SignatureAlgorithm } from './signature'

export interface TrustedPublisher {
  name: string
  algorithm: SignatureAlgorithm
  publicKey: string
  /** 可选：限制该发布者可签名的 scope 前缀，如 community/* */
  scopes?: string[]
  homepage?: string
}

export interface TrustStoreDocument {
  version: string
  updatedAt: string
  publishers: Record<string, TrustedPublisher>
}

const DEFAULT_TRUST_DOC: TrustStoreDocument = {
  version: '1.0.0',
  updatedAt: new Date(0).toISOString(),
  publishers: {}
}

export function trustStorePath(dataRoot: string): string {
  return join(dataRoot, TRUST_STORE_REL, 'publishers.json')
}

export function loadTrustStore(dataRoot: string): TrustStoreDocument {
  const path = trustStorePath(dataRoot)
  if (!existsSync(path)) return { ...DEFAULT_TRUST_DOC, publishers: { ...DEFAULT_TRUST_DOC.publishers } }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as TrustStoreDocument
    return {
      version: parsed.version ?? '1.0.0',
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      publishers: parsed.publishers ?? {}
    }
  } catch {
    return { ...DEFAULT_TRUST_DOC, publishers: {} }
  }
}

export function saveTrustStore(dataRoot: string, doc: TrustStoreDocument): void {
  const dir = join(dataRoot, TRUST_STORE_REL)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'publishers.json'),
    JSON.stringify({ ...doc, updatedAt: new Date().toISOString() }, null, 2),
    'utf-8'
  )
}

export function upsertTrustedPublisher(
  dataRoot: string,
  publisherId: string,
  publisher: TrustedPublisher
): TrustStoreDocument {
  const doc = loadTrustStore(dataRoot)
  doc.publishers[publisherId] = publisher
  saveTrustStore(dataRoot, doc)
  return doc
}

export function resolvePublisherPublicKey(
  dataRoot: string,
  publisherId: string
): TrustedPublisher | null {
  const doc = loadTrustStore(dataRoot)
  return doc.publishers[publisherId] ?? null
}

export function publisherScopeAllowed(publisher: TrustedPublisher, manifestId: string): boolean {
  if (!publisher.scopes?.length) return true
  const scopePrefix = manifestId.split('/')[0]
  return publisher.scopes.some((s) => {
    if (s.endsWith('/*')) {
      return scopePrefix === s.slice(0, -2)
    }
    return manifestId === s || manifestId.startsWith(`${s}/`)
  })
}
