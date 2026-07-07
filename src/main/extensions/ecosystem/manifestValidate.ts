// [ecosystem/manifestValidate] 鈥?鐢熸€?manifest 鏍￠獙锛堝懡鍚嶇┖闂?+ 寮曟搸鐗堟湰锛?

import type { ExtensionManifestBase } from '../protocols'
import {
  Ackem_APP_VERSION,
  Ackem_ENGINE_API_VERSION,
  NAMESPACE_COMMUNITY,
  NAMESPACE_OFFICIAL,
  NAMESPACE_USER
} from './constants'
import { extensionNamespace, isValidExtensionId, parseExtensionId } from './extensionId'
import { semverSatisfies } from './semverRange'

export interface ManifestValidationOptions {
  hostAppVersion?: string
  hostApiVersion?: string
  /** 鏄惁寮哄埗 engineApiVersion 瀛楁瀛樺湪 */
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
  const hostApp = options.hostAppVersion ?? Ackem_APP_VERSION
  const hostApi = options.hostApiVersion ?? Ackem_ENGINE_API_VERSION

  if (!manifest.id) {
    push(errors, 'manifest.id 缂哄け')
    return { ok: false, errors, warnings }
  }

  if (!isValidExtensionId(manifest.id)) {
    push(errors, `manifest.id 鏍煎紡鏃犳晥锛屽簲涓?scope/name@semver锛屽綋鍓? ${manifest.id}`)
    return { ok: false, errors, warnings }
  }

  const ns = extensionNamespace(manifest.id)!
  const parsed = parseExtensionId(manifest.id)!

  if (manifest.version && manifest.version !== parsed.version) {
    push(errors, `manifest.version (${manifest.version}) 涓?id 涓増鏈?(${parsed.version}) 涓嶄竴鑷碻)
  }

  if (!manifest.name?.trim()) push(errors, 'manifest.name 缂哄け')
  if (!manifest.category) push(errors, 'manifest.category 缂哄け')
  if (!manifest.engineVersion?.trim()) {
    push(errors, 'manifest.engineVersion 缂哄け锛圔ritney 搴旂敤鐗堟湰 semver range锛?)
  } else if (!semverSatisfies(hostApp, manifest.engineVersion)) {
    push(
      errors,
      `engineVersion 涓嶅吋瀹癸細鎵╁睍瑕佹眰 ${manifest.engineVersion}锛屽綋鍓?Ackem ${hostApp}`
    )
  }

  const requireApi =
    options.requireEngineApiVersion ?? ns === NAMESPACE_COMMUNITY
  const apiRange = manifest.engineApiVersion?.trim()
  if (requireApi && !apiRange) {
    push(errors, 'engineApiVersion 缂哄け锛坈ommunity/ 鎵╁睍蹇呭～锛?)
  } else if (apiRange) {
    if (!semverSatisfies(hostApi, apiRange)) {
      push(
        errors,
        `engineApiVersion 涓嶅吋瀹癸細鎵╁睍瑕佹眰 ${apiRange}锛屽綋鍓嶅紩鎿?API ${hostApi}`
      )
    }
  } else if (ns === NAMESPACE_USER || ns === NAMESPACE_OFFICIAL) {
    warnings.push(
      `鏈０鏄?engineApiVersion锛岄粯璁ゆ寜 ^${Ackem_ENGINE_API_VERSION} 澶勭悊锛堝缓璁樉寮忓～鍐欙級`
    )
    const defaultRange = `^${Ackem_ENGINE_API_VERSION}`
    if (!semverSatisfies(hostApi, defaultRange)) {
      push(errors, `榛樿 engineApiVersion ${defaultRange} 涓庡綋鍓嶅紩鎿?API ${hostApi} 涓嶅吋瀹筦)
    }
  }

  if (ns === NAMESPACE_OFFICIAL && !manifest.id.startsWith(`${NAMESPACE_OFFICIAL}/`)) {
    push(errors, '瀹樻柟鎵╁睍 id 蹇呴』浠?Ackem/ 寮€澶?)
  }
  if (ns === NAMESPACE_COMMUNITY && !manifest.id.startsWith(`${NAMESPACE_COMMUNITY}/`)) {
    push(errors, '绀惧尯鎵╁睍 id 蹇呴』浠?community/ 寮€澶?)
  }
  if (ns === NAMESPACE_USER && !manifest.id.startsWith(`${NAMESPACE_USER}/`)) {
    push(errors, '鐢ㄦ埛鎵╁睍 id 蹇呴』浠?u/ 寮€澶?)
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function assertValidExtensionManifest(
  manifest: Partial<ExtensionManifestBase> & { id?: string; category?: string },
  options?: ManifestValidationOptions
): void {
  const result = validateExtensionManifest(manifest, options)
  if (!result.ok) {
    throw new Error(`鎵╁睍 manifest 鏍￠獙澶辫触锛歕n${result.errors.map((e) => `- ${e}`).join('\n')}`)
  }
}
