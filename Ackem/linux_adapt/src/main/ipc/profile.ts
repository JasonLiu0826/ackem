// [ipc/profile] — 人格预设与 M3 六维推断

import { ipcMain } from 'electron'
import { createLlmJsonClient } from '../llmClient'
import { isLocalLlmEndpoint } from '../llmEndpoint'
import { loadState, saveState, defaultFullState } from '../engine/state-persistence'
import { PERSONALITY_PRESETS, defaultPersonalitySlice, getPreset, sortPresetsForDisplay } from '../personalityPresets'
import { INFERENCE_CONSENT_VERSION } from '../../shared/types'
import {
  estimateScanStats,
  inferFromFiles,
  mapToLegacyUserProfile,
  writePortraitSummary
} from '../engine/user-dimension-inferrer'
import { createLogger } from '../logger'
import {
  currentSessionId,
  ensureDataLayout,
  loadSettings,
  mergeEngineState,
  resolveDataRoot,
  saveSettings
} from './shared'

const log = createLogger('ipc-profile')

export function registerProfileIpc(): void {
  ipcMain.handle('personality:list', (_e, gender?: 'female' | 'male') => {
    const g = gender ?? loadSettings().companionGender
    const filtered = PERSONALITY_PRESETS.filter((p) => p.gender === g)
    return sortPresetsForDisplay(filtered).map((p) => ({
      id: p.id,
      label: p.label,
      gender: p.gender,
      requiresAdult18: p.requiresAdult18 === true
    }))
  })

  ipcMain.handle('personality:set', (_e, id: string) => {
    const preset = getPreset(id)
    if (preset?.requiresAdult18 && !loadSettings().ageConfirmed18) {
      throw new Error('PERSONALITY_NEED_AGE_CONFIRM')
    }
    const next = saveSettings({
      personalityPresetId: id,
      ...(preset ? { companionGender: preset.gender } : {})
    })
    const root = resolveDataRoot(next)
    ensureDataLayout(root)
    const sessionId = currentSessionId()
    let st = loadState(root, sessionId) ?? defaultFullState(defaultPersonalitySlice(next))
    st.personality = defaultPersonalitySlice(next)
    const p = st.personality
    st.personalityBaseline = { T: p.T, I: p.I, S: p.S, O: p.O, R: p.R }
    saveState(root, st, sessionId)
    return next
  })

  ipcMain.handle('profile:estimateScan', (_e, relPaths: string[]) => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    const estimate = estimateScanStats(root, relPaths ?? [])
    return {
      ...estimate,
      isLocal: isLocalLlmEndpoint(settings),
      consentVersion: INFERENCE_CONSENT_VERSION
    }
  })

  ipcMain.handle('profile:get', () => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    const st = mergeEngineState(root, settings)
    return {
      mode: settings.personalityConfigMode ?? 'manual',
      userSixDimensions: st.userSixDimensions ?? null,
      companionSuggestion: st.companionSuggestion ?? null
    }
  })

  ipcMain.handle(
    'profile:inferFromFiles',
    async (
      _e,
      args: { relPaths: string[]; consentAck: boolean; consentVersion: number }
    ) => {
      if (!args?.consentAck) {
        return { ok: false as const, error: '须先确认知情同意' }
      }
      if (args.consentVersion !== INFERENCE_CONSENT_VERSION) {
        return { ok: false as const, error: '知情同意版本已更新，请重新阅读并确认' }
      }
      const relPaths = (args.relPaths ?? []).filter(Boolean)
      if (relPaths.length === 0) {
        return { ok: false as const, error: '未选择文件' }
      }

      const settings = loadSettings()
      const root = resolveDataRoot(settings)
      ensureDataLayout(root)
      const sessionId = currentSessionId()

      try {
        const llm = createLlmJsonClient(settings)
        const result = await inferFromFiles(relPaths, root, llm)
        const portraitWrite = writePortraitSummary(root, result)
        if (!portraitWrite.ok) {
          log.warn('portrait write failed', portraitWrite.error)
        }

        let st = mergeEngineState(root, settings)
        st.userSixDimensions = result.userSix
        st.companionSuggestion = result.companionSuggestion
        st.userProfile = mapToLegacyUserProfile(result.userSix, st.userProfile)
        saveState(root, st, sessionId)

        saveSettings({ personalityConfigMode: 'inferred' })

        return {
          ok: true as const,
          userSixDimensions: result.userSix,
          companionSuggestion: result.companionSuggestion
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false as const, error: msg }
      }
    }
  )

  ipcMain.handle('profile:applyCompanionSuggestion', () => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    const sessionId = currentSessionId()
    const st = mergeEngineState(root, settings)
    const sug = st.companionSuggestion
    if (!sug) {
      return { ok: false as const, error: '暂无伴侣人格建议' }
    }

    st.personality = {
      ...st.personality,
      T: sug.T,
      I: sug.I,
      S: sug.S,
      O: sug.O,
      R: sug.R
    }
    st.personalityBaseline = { T: sug.T, I: sug.I, S: sug.S, O: sug.O, R: sug.R }
    saveState(root, st, sessionId)
    return { ok: true as const, personality: st.personality }
  })
}
