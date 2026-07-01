import { validateDispatchConfig } from '../dispatch/validateDispatchConfig'
import type { SkillManifest } from '../skills/types'
import type { PluginManifest } from '../plugins/types'
import { isValidUextensionId } from './types'
import type { UskilConfig, UpluginMeta } from './loader'

const REQUIRED_MANIFEST_FIELDS: (keyof SkillManifest)[] = [
  'id',
  'name',
  'version',
  'category',
  'skillType',
  'description',
  'main',
  'triggers',
  'permissions'
]

export function validateGeneratedUskill(
  manifest: SkillManifest,
  config: UskilConfig
): string[] {
  const errors: string[] = []

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (manifest[field] == null || manifest[field] === '') {
      errors.push(`manifest.${field} 缺失`)
    }
  }

  if (!isValidUextensionId(manifest.id)) {
    errors.push(`manifest.id 格式应为 u/<name>@<semver>，当前: ${manifest.id}`)
  }

  if (manifest.category !== 'skill') {
    errors.push('manifest.category 必须为 skill')
  }

  if (!manifest.triggers?.length) {
    errors.push('manifest.triggers 不能为空')
  }

  if (manifest.triggers.includes('keyword') && !manifest.keywords?.length) {
    errors.push('keyword 触发时 manifest.keywords 不能为空')
  }

  if (!manifest.dispatch) {
    errors.push('manifest.dispatch 必填（OpenForU uskill 须含调度配置）')
  } else {
    errors.push(...validateDispatchConfig(manifest.dispatch).map((e) => `dispatch: ${e}`))
  }

  if (!config.version) {
    errors.push('skill.json version 缺失')
  }

  const injection = config.promptTemplates?.contextInjection?.trim()
  if (!injection && !config.onKeyword?.reply?.trim()) {
    errors.push('skill.json 须包含 contextInjection 或 onKeyword.reply')
  }

  if (manifest.dispatch?.mode === 'autonomous') {
    if (!config.onProactive?.enabled) {
      errors.push('autonomous dispatch 时 skill.json onProactive.enabled 须为 true')
    }
    if (!manifest.triggers.includes('scheduled')) {
      errors.push('autonomous dispatch 时 manifest.triggers 须含 scheduled')
    }
  }

  return errors
}

export function assertValidGeneratedUskill(manifest: SkillManifest, config: UskilConfig): void {
  const errors = validateGeneratedUskill(manifest, config)
  if (errors.length) {
    throw new Error(`uskill 校验失败：\n${errors.map((e) => `- ${e}`).join('\n')}`)
  }
}

export function validateGeneratedUplugin(
  manifest: PluginManifest,
  meta: UpluginMeta,
  files?: Record<string, string>
): string[] {
  const errors: string[] = []

  if (!manifest.id || !manifest.name || !manifest.version) {
    errors.push('manifest 基础字段缺失')
  }
  if (!isValidUextensionId(manifest.id)) {
    errors.push(`manifest.id 格式应为 u/<name>@<semver>，当前: ${manifest.id}`)
  }
  if (manifest.category !== 'plugin') {
    errors.push('manifest.category 必须为 plugin')
  }
  if (!manifest.permissions?.length) {
    errors.push('manifest.permissions 不能为空')
  }
  if (!manifest.dispatch) {
    errors.push('manifest.dispatch 必填')
  } else {
    errors.push(...validateDispatchConfig(manifest.dispatch).map((e) => `dispatch: ${e}`))
  }
  const hasMainTs = Boolean(files?.['main.ts']?.trim())
  if (!hasMainTs && !meta.injectTemplate?.trim()) {
    errors.push('plugin.meta.json injectTemplate 不能为空（无 main.ts 时必填）')
  }
  return errors
}

export function assertValidGeneratedUplugin(
  manifest: PluginManifest,
  meta: UpluginMeta,
  files?: Record<string, string>
): void {
  const errors = validateGeneratedUplugin(manifest, meta, files)
  if (errors.length) {
    throw new Error(`uplugin 校验失败：\n${errors.map((e) => `- ${e}`).join('\n')}`)
  }
}
