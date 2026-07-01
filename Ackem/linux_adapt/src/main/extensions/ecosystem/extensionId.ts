// [ecosystem/extensionId] — scope/name@version 解析与校验

import {
  EXTENSION_NAMESPACES,
  NAMESPACE_COMMUNITY,
  NAMESPACE_OFFICIAL,
  NAMESPACE_USER,
  type ExtensionNamespace
} from './constants'

const ID_PATTERN = /^(?<scope>[a-z]+)\/(?<name>[a-z0-9_-]+)@(?<version>\d+\.\d+\.\d+)$/i

export interface ParsedExtensionId {
  raw: string
  scope: ExtensionNamespace
  name: string
  version: string
  slug: string
}

export function parseExtensionId(id: string): ParsedExtensionId | null {
  const m = ID_PATTERN.exec(id.trim())
  if (!m?.groups) return null
  const scope = m.groups.scope.toLowerCase() as ExtensionNamespace
  if (!EXTENSION_NAMESPACES.includes(scope)) return null
  return {
    raw: id.trim(),
    scope,
    name: m.groups.name.toLowerCase(),
    version: m.groups.version,
    slug: m.groups.name.toLowerCase()
  }
}

export function isValidExtensionId(id: string): boolean {
  return parseExtensionId(id) != null
}

export function isOfficialExtensionId(id: string): boolean {
  return parseExtensionId(id)?.scope === NAMESPACE_OFFICIAL
}

export function isCommunityExtensionId(id: string): boolean {
  return parseExtensionId(id)?.scope === NAMESPACE_COMMUNITY
}

export function isUserExtensionId(id: string): boolean {
  return parseExtensionId(id)?.scope === NAMESPACE_USER
}

export function extensionNamespace(id: string): ExtensionNamespace | null {
  return parseExtensionId(id)?.scope ?? null
}

export function formatExtensionId(
  scope: ExtensionNamespace,
  name: string,
  version: string
): string {
  return `${scope}/${name}@${version}`
}

export {
  NAMESPACE_OFFICIAL,
  NAMESPACE_COMMUNITY,
  NAMESPACE_USER
}
