import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'

import type { AppSettings, DataRootMode, LlmProvider, PresetGender } from '../shared/types'
import { clampOpenForUTemperature, OPENFORU_DEFAULT_MAX_TOKENS } from '../shared/openforuConfig'
export type { AppSettings, DataRootMode, LlmProvider, PresetGender }

type SettingsFile = AppSettings & { _encryptedApiKey?: string }

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
  companionName: '浼翠荆',
  companionSystemHint: '娓╂煍銆佺湡璇氾紝鐢ㄣ€屾垜銆嶆寚浠ｈ嚜宸憋紙AI 浼翠荆锛夛紝涓嶇敤銆屾垜銆嶆寚浠ｇ敤鎴枫€?,
  companionGender: 'male',
  companionAppearance: '涓€浣嶅勾杞诲コ瀛╋紝榛戣壊闀垮彂锛岀惀鐝€鑹茬溂鐫涳紝鐨偆鐧界殭锛岃韩鏉愮氦缁嗭紝甯哥┛鐧借壊琛～鎼厤娴呰壊鐭锛屾俯鏌旇€岀伒鍔ㄧ殑姘旇川',
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
  updateChannel: 'auto',
  updateSkippedVersion: '',
  updateLastCheckAt: '',
  agnesBaseUrl: 'https://apihub.agnes-ai.com/v1',
  agnesApiKey: '',
  agnesImageModel: 'agnes-image-2.1-flash'
}

function settingsPath(): string {
  if (typeof app?.getPath !== 'function') {
    return join(process.cwd(), '.test-cache', 'Ackem-app-settings.json')
  }
  return join(app.getPath('userData'), 'Ackem-app-settings.json')
}

/** Kairos 鈫?Ackem 閲嶅懡鍚嶅墠鐨?Electron userData 璁剧疆璺緞 */
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

function resolveApiKey(parsed: SettingsFile): string {
  if (parsed._encryptedApiKey && encryptionAvailable()) {
    return decryptKey(parsed._encryptedApiKey)
  }
  if (parsed._encryptedApiKey) {
    return ''
  }
  const plain = (parsed.openaiApiKey || '').trim()
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
  const openaiApiKey = resolveApiKey(parsed)
  const { _encryptedApiKey: _drop, ...rest } = parsed
  void _drop
  return {
    ...defaultSettings,
    ...rest,
    openaiApiKey,
    asyncMultiMessageEnabled: false,
    openforuMaxTokens: OPENFORU_DEFAULT_MAX_TOKENS
  } as AppSettings
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

  const keyInput = patch.openaiApiKey !== undefined ? patch.openaiApiKey : current.openaiApiKey
  const trimmedKey = (keyInput || '').trim()

  if (trimmedKey && trimmedKey !== ENCRYPTED_PLACEHOLDER && encryptionAvailable()) {
    merged._encryptedApiKey = encryptKey(trimmedKey)
    merged.openaiApiKey = ENCRYPTED_PLACEHOLDER
  } else if (trimmedKey === ENCRYPTED_PLACEHOLDER || !trimmedKey) {
    // 鐢ㄦ埛鏈敼 Key锛氫繚鐣欑鐩樹笂宸叉湁鐨勫姞瀵?blob
    if (rawOnDisk?._encryptedApiKey) {
      merged._encryptedApiKey = rawOnDisk._encryptedApiKey
      merged.openaiApiKey = ENCRYPTED_PLACEHOLDER
    } else if (current.openaiApiKey) {
      merged._encryptedApiKey = encryptKey(current.openaiApiKey)
      merged.openaiApiKey = ENCRYPTED_PLACEHOLDER
    } else {
      delete merged._encryptedApiKey
      merged.openaiApiKey = ''
    }
  } else if (!encryptionAvailable()) {
    delete merged._encryptedApiKey
    merged.openaiApiKey = trimmedKey
  }

  writeSettingsFile(merged)
  return normalizeSettingsFile(merged)
}
