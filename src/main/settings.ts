import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'

import type { AppSettings, DataRootMode, LlmProvider, PresetGender } from '../shared/types'
import { clampOpenForUTemperature, OPENFORU_DEFAULT_MAX_TOKENS } from '../shared/openforuConfig'
export type { AppSettings, DataRootMode, LlmProvider, PresetGender }

type SettingsFile = AppSettings & {
  _encryptedApiKey?: string
  _encryptedAckemcodeApiKey?: string
}

const ENCRYPTED_PLACEHOLDER = '[encrypted]'

const defaultSettings: AppSettings = {
  dataRootMode: 'portable',
  llmProvider: 'openai',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiApiKey: '',
  anthropicBaseUrl: 'https://api.anthropic.com/v1',
  anthropicApiVersion: '2023-06-01',
  anthropicMaxTokens: 8192,
  model: 'gpt-4o-mini',
  timeoutMs: 120_000,
  ageConfirmed18: false,
  adultContentMode: false,
  adultPrivacyLevel: 'enhanced',
  tierBDiaryDays: 7,
  singleFileSoftLimitBytes: 120_000,
  memoryBudgetChars: 8000,
  companionName: '伴侣',
  companionSystemHint: '温柔、真诚，用「我」指代自己（AI 伴侣），不用「我」指代用户。',
  companionGender: 'male',
  personalityPresetId: 'boy_next_door',
  personalityConfigMode: 'manual',
  inferenceConsentVersion: 1,
  apiKeyHeaderMode: 'bearer',
  llmExtraHeadersJson: '',
  disableChatTools: false,
  openforuBaseUrl: '',
  openforuApiKey: '',
  openforuModel: '',
  openforuTemperature: 0.2,
  openforuMaxTokens: 128_000,
  openforuAgentCoreEnabled: true,
  openforuGenerateStrategy: 'auto',
  ackemcodeIndependentLlm: false,
  ackemcodeBaseUrl: '',
  ackemcodeApiKey: '',
  ackemcodeModel: '',
  locale: 'zh',
  embeddingActiveModel: 'bge-small-zh',
  asyncMultiMessageEnabled: false,
  localChatEnabled: false,
  localChatBaseUrl: 'http://127.0.0.1:11434/v1',
  localChatModel: 'qwen2.5:7b',
  localChatMaxTokens: 80,
  weixinChannelEnabled: false,
  companionHarassEnabled: false,
  desktopAgentEnabled: false,
  desktopAgentRiskAccepted: false,
  desktopAgentAllowAppControl: false,
  desktopAgentAllowFileWrite: false,
  desktopAgentAllowDownload: false,
  desktopAgentAllowInstall: false,
  desktopAgentAllowDocumentRead: false,
  desktopAgentAllowDelete: false,
  desktopAgentDownloadDir: '',
  proactiveFrequency: 'medium',
  proactiveDisplayMode: 'both',
  proactiveContextRatio: 0.7,
  proactiveUserQuietMs: 60_000,
  proactiveEnabled: true,
  weixinMirrorEnabled: true,
  llmProfiles: [],
  activeChatProfileId: '',
  activeOpenForUProfileId: '__follow_chat__',
  activeImageGenProfileId: '',
  imageGenEnabled: false,
  imageGenProvider: 'unset',
  imageGenBaseUrl: '',
  imageGenModel: '',
  imageGenApiKey: '',
  imageGenDefaultSize: '1024x1024',
  imageGenPromptEnhancementEnabled: false,
}

function settingsPath(): string {
  if (typeof app?.getPath !== 'function') {
    return join(process.cwd(), '.test-cache', 'ackem-app-settings.json')
  }
  return join(app.getPath('userData'), 'ackem-app-settings.json')
}

/** Kairos → Ackem 重命名前的 Electron userData 设置路径 */
function legacySettingsPaths(): string[] {
  if (typeof app?.getPath !== 'function') return []
  const roaming = dirname(app.getPath('userData'))
  return [
    join(roaming, 'kairos', 'kairos-app-settings.json'),
    join(app.getPath('userData'), 'kairos-app-settings.json')
  ]
}

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function decryptKey(encrypted: string): string {
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return ''
  }
}

function encryptKey(plain: string): string {
  return safeStorage.encryptString(plain).toString('base64')
}

function readRawSettingsFile(path: string): SettingsFile | null {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8')) as SettingsFile
  } catch {
    return null
  }
}

function resolveStoredKey(
  parsed: SettingsFile,
  encryptedField: '_encryptedApiKey' | '_encryptedAckemcodeApiKey',
  plainField: 'openaiApiKey' | 'ackemcodeApiKey'
): string {
  const encrypted = parsed[encryptedField]
  if (encrypted && encryptionAvailable()) {
    return decryptKey(encrypted)
  }
  if (encrypted) {
    return ''
  }
  const plain = (parsed[plainField] || '').trim()
  if (plain && plain !== ENCRYPTED_PLACEHOLDER) {
    return plain
  }
  return ''
}

function hasStoredApiKey(parsed: SettingsFile): boolean {
  if (parsed._encryptedApiKey) return true
  const plain = (parsed.openaiApiKey || '').trim()
  return Boolean(plain && plain !== ENCRYPTED_PLACEHOLDER)
}

function normalizeSettingsFile(parsed: SettingsFile): AppSettings {
  const openaiApiKey = resolveStoredKey(parsed, '_encryptedApiKey', 'openaiApiKey')
  const ackemcodeApiKey = resolveStoredKey(parsed, '_encryptedAckemcodeApiKey', 'ackemcodeApiKey')
  const { _encryptedApiKey: _drop, _encryptedAckemcodeApiKey: _dropCode, ...rest } = parsed
  void _drop
  void _dropCode
  return {
    ...defaultSettings,
    ...rest,
    openaiApiKey,
    ackemcodeApiKey,
    asyncMultiMessageEnabled: false,
    openforuMaxTokens: OPENFORU_DEFAULT_MAX_TOKENS
  } as AppSettings
}

function sealSecret(args: {
  merged: SettingsFile
  rawOnDisk: SettingsFile | null
  currentPlain: string
  patchValue: string | undefined
  plainField: 'openaiApiKey' | 'ackemcodeApiKey'
  encryptedField: '_encryptedApiKey' | '_encryptedAckemcodeApiKey'
}): void {
  const { merged, rawOnDisk, currentPlain, patchValue, plainField, encryptedField } = args
  const keyInput = patchValue !== undefined ? patchValue : currentPlain
  const trimmedKey = (keyInput || '').trim()

  if (trimmedKey && trimmedKey !== ENCRYPTED_PLACEHOLDER && encryptionAvailable()) {
    merged[encryptedField] = encryptKey(trimmedKey)
    merged[plainField] = ENCRYPTED_PLACEHOLDER
    return
  }
  if (trimmedKey === ENCRYPTED_PLACEHOLDER || !trimmedKey) {
    const stored = rawOnDisk?.[encryptedField]
    if (stored) {
      merged[encryptedField] = stored
      merged[plainField] = ENCRYPTED_PLACEHOLDER
    } else if (currentPlain && encryptionAvailable()) {
      merged[encryptedField] = encryptKey(currentPlain)
      merged[plainField] = ENCRYPTED_PLACEHOLDER
    } else if (currentPlain) {
      delete merged[encryptedField]
      merged[plainField] = currentPlain
    } else {
      delete merged[encryptedField]
      merged[plainField] = ''
    }
    return
  }
  delete merged[encryptedField]
  merged[plainField] = trimmedKey
}

function writeSettingsFile(parsed: SettingsFile): void {
  const p = settingsPath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(parsed, null, 2), 'utf-8')
}

function migrateLegacySettingsIfNeeded(currentRaw: SettingsFile | null): SettingsFile | null {
  if (currentRaw && hasStoredApiKey(currentRaw)) {
    return currentRaw
  }

  for (const legacyPath of legacySettingsPaths()) {
    const legacy = readRawSettingsFile(legacyPath)
    if (!legacy || !hasStoredApiKey(legacy)) continue

    const migrated: SettingsFile = {
      ...defaultSettings,
      ...legacy,
      openaiApiKey: legacy.openaiApiKey === ENCRYPTED_PLACEHOLDER ? ENCRYPTED_PLACEHOLDER : legacy.openaiApiKey,
      _encryptedApiKey: legacy._encryptedApiKey
    }
    writeSettingsFile(migrated)
    return migrated
  }

  return currentRaw
}

export function loadSettings(): AppSettings {
  const p = settingsPath()
  try {
    let raw = readRawSettingsFile(p)
    if (!raw) {
      raw = migrateLegacySettingsIfNeeded(null)
      if (!raw) return { ...defaultSettings }
    } else {
      raw = migrateLegacySettingsIfNeeded(raw)
      if (!raw) return { ...defaultSettings }
    }
    return normalizeSettingsFile(raw)
  } catch {
    return { ...defaultSettings }
  }
}

function trimSettingsFields(input: Partial<AppSettings>): Partial<AppSettings> {
  const out: Partial<AppSettings> = { ...input }
  if (typeof out.openaiBaseUrl === 'string') out.openaiBaseUrl = out.openaiBaseUrl.trim()
  if (typeof out.anthropicBaseUrl === 'string') out.anthropicBaseUrl = out.anthropicBaseUrl.trim()
  if (typeof out.openforuBaseUrl === 'string') out.openforuBaseUrl = out.openforuBaseUrl.trim()
  if (typeof out.openforuModel === 'string') out.openforuModel = out.openforuModel.trim()
  if (typeof out.model === 'string') out.model = out.model.trim()
  if (typeof out.openforuApiKey === 'string') out.openforuApiKey = out.openforuApiKey.trim()
  if (typeof out.ackemcodeBaseUrl === 'string') out.ackemcodeBaseUrl = out.ackemcodeBaseUrl.trim()
  if (typeof out.ackemcodeModel === 'string') out.ackemcodeModel = out.ackemcodeModel.trim()
  if (typeof out.ackemcodeApiKey === 'string') out.ackemcodeApiKey = out.ackemcodeApiKey.trim()
  if (typeof out.llmExtraHeadersJson === 'string') out.llmExtraHeadersJson = out.llmExtraHeadersJson.trim()
  return out
}

export function saveSettings(next: Partial<AppSettings>): AppSettings {
  const patch = trimSettingsFields(next)
  const rawOnDisk = readRawSettingsFile(settingsPath())
  const current = loadSettings()
  const merged: SettingsFile = {
    ...defaultSettings,
    ...current,
    ...patch,
    openforuTemperature: clampOpenForUTemperature(
      patch.openforuTemperature ?? current.openforuTemperature ?? defaultSettings.openforuTemperature
    ),
    openforuMaxTokens: OPENFORU_DEFAULT_MAX_TOKENS
  }

  sealSecret({
    merged,
    rawOnDisk,
    currentPlain: current.openaiApiKey,
    patchValue: patch.openaiApiKey,
    plainField: 'openaiApiKey',
    encryptedField: '_encryptedApiKey'
  })
  sealSecret({
    merged,
    rawOnDisk,
    currentPlain: current.ackemcodeApiKey ?? '',
    patchValue: patch.ackemcodeApiKey,
    plainField: 'ackemcodeApiKey',
    encryptedField: '_encryptedAckemcodeApiKey'
  })

  writeSettingsFile(merged)
  return normalizeSettingsFile(merged)
}
