// [ecosystem/manifestValidate] — 生态 manifest 校验（命名空间 + 引擎版本）

import type { ExtensionManifestBase } from '../protocols'
import {
  ACKEM_APP_VERSION,
  ACKEM_ENGINE_API_VERSION,
  NAMESPACE_COMMUNITY,
  NAMESPACE_OFFICIAL,
  NAMESPACE_USER
} from './constants'
import { extensionNamespace, isValidExtensionId, parseExtensionId } from './extensionId'
import { semverSatisfies } from './semverRange'

export interface ManifestValidationOptions {
  hostAppVersion?: string
  hostApiVersion?: string
  /** 是否强制 engineApiVersion 字段存在 */
  requireEngineApiVersion?: boolean
}

export interface ManifestValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

function push(errors: string[], msg: string): void {
  errors.push(msg)
}

export function validateExtensionManifest(
  manifest: Partial<ExtensionManifestBase> & { id?: string; category?: string },
  options: ManifestValidationOptions = {}
): ManifestValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const hostApp = options.hostAppVersion ?? ACKEM_APP_VERSION
  const hostApi = options.hostApiVersion ?? ACKEM_ENGINE_API_VERSION

  if (!manifest.id) {
    push(errors, 'manifest.id 缺失')
    return { ok: false, errors, warnings }
  }

  if (!isValidExtensionId(manifest.id)) {
    push(errors, `manifest.id 格式无效，应为 scope/name@semver，当前: ${manifest.id}`)
    return { ok: false, errors, warnings }
  }

  const ns = extensionNamespace(manifest.id)!
  const parsed = parseExtensionId(manifest.id)!

  if (manifest.version && manifest.version !== parsed.version) {
    push(errors, `manifest.version (${manifest.version}) 与 id 中版本 (${parsed.version}) 不一致`)
  }

  if (!manifest.name?.trim()) push(errors, 'manifest.name 缺失')
  if (!manifest.category) push(errors, 'manifest.category 缺失')
  if (!manifest.engineVersion?.trim()) {
    push(errors, 'manifest.engineVersion 缺失（Ackem 应用版本 semver range）')
  } else if (!semverSatisfies(hostApp, manifest.engineVersion)) {
    push(
      errors,
      `engineVersion 不兼容：扩展要求 ${manifest.engineVersion}，当前 Ackem ${hostApp}`
    )
  }

  const requireApi =
    options.requireEngineApiVersion ?? ns === NAMESPACE_COMMUNITY
  const apiRange = manifest.engineApiVersion?.trim()
  if (requireApi && !apiRange) {
    push(errors, 'engineApiVersion 缺失（community/ 扩展必填）')
  } else if (apiRange) {
    if (!semverSatisfies(hostApi, apiRange)) {
      push(
        errors,
        `engineApiVersion 不兼容：扩展要求 ${apiRange}，当前引擎 API ${hostApi}`
      )
    }
  } else if (ns === NAMESPACE_USER || ns === NAMESPACE_OFFICIAL) {
    warnings.push(
      `未声明 engineApiVersion，默认按 ^${ACKEM_ENGINE_API_VERSION} 处理（建议显式填写）`
    )
    const defaultRange = `^${ACKEM_ENGINE_API_VERSION}`
    if (!semverSatisfies(hostApi, defaultRange)) {
      push(errors, `默认 engineApiVersion ${defaultRange} 与当前引擎 API ${hostApi} 不兼容`)
    }
  }

  if (ns === NAMESPACE_OFFICIAL && !manifest.id.startsWith(`${NAMESPACE_OFFICIAL}/`)) {
    push(errors, '官方扩展 id 必须以 ackem/ 开头')
  }
  if (ns === NAMESPACE_COMMUNITY && !manifest.id.startsWith(`${NAMESPACE_COMMUNITY}/`)) {
    push(errors, '社区扩展 id 必须以 community/ 开头')
  }
  if (ns === NAMESPACE_USER && !manifest.id.startsWith(`${NAMESPACE_USER}/`)) {
    push(errors, '用户扩展 id 必须以 u/ 开头')
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function assertValidExtensionManifest(
  manifest: Partial<ExtensionManifestBase> & { id?: string; category?: string },
  options?: ManifestValidationOptions
): void {
  const result = validateExtensionManifest(manifest, options)
  if (!result.ok) {
    throw new Error(`扩展 manifest 校验失败：\n${result.errors.map((e) => `- ${e}`).join('\n')}`)
  }
}
