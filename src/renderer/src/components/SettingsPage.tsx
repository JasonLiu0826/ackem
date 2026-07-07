import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings, LlmProvider, PresetGender } from '../Ackem'
import { t, getLocale, setLocale, refreshI18n } from '../lib/i18n'
import { ConfirmDialog } from './ConfirmDialog'
import { CompanionSkinSection } from './CompanionSkinSection'
import { EmbeddingModelSection } from './EmbeddingModelSection'
import { MobileComingSoonSection, WeixinConnectSection } from './WeixinConnectSection'
import { VoiceSettings } from './VoiceSettings'
import { DesktopAgentSettings, desktopAgentSettingsSaveBlocked } from './DesktopAgentSettings'
import { UpdateSettingsPanel } from './settings/UpdateSettingsPanel'
import { useAppStore } from '../store/appStore'
import { resolveInitialTheme, toggleTheme, type ThemeMode } from '../lib/theme'
import { isSettingsDirty, mergeSettingsDraft, prepareSettingsForSave } from '../lib/settingsForm'
import { onlyDesktopAgentSettingsChanged } from '../../../shared/settingsChange'
import {
  clampOpenForUTemperature,
  isOpenForUConfigured
} from '../../../shared/openforuConfig'
import {
  SettingsActionItem,
  SettingsActionStack,
  SettingsBlock,
  SettingsField,
  SettingsGroup,
  SettingsNav,
  SettingsPresetButton,
  SettingsPresetGrid,
  SettingsRow,
  SettingsSegmented,
  SettingsStatusBadge,
  SettingsToggleRow,
  ExperimentalFeatureNotice,
  useSettingsSection
} from './settings/settingsUi'

function companionSubjectPronoun(gender: PresetGender): string {
  if (getLocale() === 'en') return gender === 'male' ? 'He' : 'She'
  return gender === 'male' ? '浠? : '濂?
}

export function SettingsPage(): JSX.Element {
  const {
    settings,
    setSettings,
    pushToast,
    setTab,
    setDeleteAttempted,
    requestChatInputFocus,
    resetChat,
    openSettingsAt
  } = useAppStore()
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [form, setForm] = useState<AppSettings | null>(null)
  const [rootInfo, setRootInfo] = useState<{
    path: string
    relativePath: string
    mode: string
  } | null>(null)
  const [presets, setPresets] = useState<
    Array<{ id: string; label: string; requiresAdult18?: boolean }>
  >([])
  const [showAdultConfirm, setShowAdultConfirm] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [showPersonalityConfirm, setShowPersonalityConfirm] = useState(false)
  const pendingPersonality = useRef<{ id: string; label: string; requiresAdult18?: boolean } | null>(
    null
  )
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [diaryResult, setDiaryResult] = useState<string | null>(null)
  const [diaryBusy, setDiaryBusy] = useState(false)
  const [thoughtResult, setThoughtResult] = useState<string | null>(null)
  const [thoughtBusy, setThoughtBusy] = useState(false)
  const [consolidateResult, setConsolidateResult] = useState<string | null>(null)
  const [consolidateBusy, setConsolidateBusy] = useState(false)
  const [mirrorResult, setMirrorResult] = useState<string | null>(null)
  const [mirrorBusy, setMirrorBusy] = useState(false)
  const [mediaStatus, setMediaStatus] = useState<string>('')
  const [canonInfo, setCanonInfo] = useState<{ birthDate: string } | null>(null)
  const [appVersion, setAppVersion] = useState('')
  const [uninstallInfo, setUninstallInfo] = useState<{
    mode: 'dev' | 'portable' | 'installed'
    installDir: string
    dataRoot: string
    batPath: string | null
    nsisUninstaller: string | null
  } | null>(null)
  const [uninstallDeleteData, setUninstallDeleteData] = useState(false)
  const [uninstallRemoveApp, setUninstallRemoveApp] = useState(false)
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false)
  const [uninstallBusy, setUninstallBusy] = useState(false)

  useEffect(() => {
    void refreshI18n()
  }, [])

  useEffect(() => {
    void window.Ackem.getCanon().then((c) => setCanonInfo({ birthDate: c.birthDate }))
    void window.Ackem.getAppVersion().then(setAppVersion)
  }, [])

  /** 纾佺洏宸叉寔涔呭寲 鈫?鍚屾鍏ㄥ眬 store + 鏈湴 form锛堝嬁鐢?settings 鍙樺寲鐩茬洰瑕嗙洊 form锛?*/
  const applyPersisted = useCallback(
    (next: AppSettings) => {
      setSettings(next)
      setForm(next)
    },
    [setSettings]
  )

  /** 鍚堝苟褰撳墠 form 涓?patch 鍚庡啓鍏ョ鐩橈紝骞跺悓姝?store */
  const persistPatch = useCallback(
    async (patch: Partial<AppSettings>, toast?: string) => {
      if (!form) return
      const merged = mergeSettingsDraft(form, patch)
      const next = await window.Ackem.setSettings(merged)
      applyPersisted(next)
      if (toast) pushToast(toast)
      return next
    },
    [form, applyPersisted, pushToast]
  )

  useEffect(() => {
    void window.Ackem.getSettings().then((s) => {
      applyPersisted(s)
    })
  }, [applyPersisted])

  useEffect(() => {
    if (!form) return
    void window.Ackem.personalityList(form.companionGender).then((list) => {
      setPresets(
        list.map((p) => ({
          id: p.id,
          label: p.label,
          requiresAdult18: p.requiresAdult18
        }))
      )
    })
  }, [form?.companionGender])

  useEffect(() => {
    void (async () => {
      const r = await window.Ackem.getDataRoot()
      setRootInfo(r)
    })()
  }, [settings?.dataRootMode])

  const { activeId, setActive } = useSettingsSection()

  useEffect(() => {
    if (activeId !== 'settings-uninstall') return
    void window.Ackem.uninstallInfo().then(setUninstallInfo)
  }, [activeId])
  const settingsDeepLink = useAppStore((s) => s.settingsDeepLink)
  const clearSettingsDeepLink = useAppStore((s) => s.clearSettingsDeepLink)

  useEffect(() => {
    if (!settingsDeepLink) return
    setActive(settingsDeepLink.section)
    const anchorId = settingsDeepLink.anchorId
    const timer = window.setTimeout(() => {
      if (anchorId) {
        document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      clearSettingsDeepLink()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [settingsDeepLink, setActive, clearSettingsDeepLink])

  if (!form) {
    return <div className="p-8 text-sm text-ink-muted">{t('settings.loading')}</div>
  }

  const redirectToAgeConfirm = () => {
    openSettingsAt('settings-safety', 'settings-age-confirm')
    pushToast(t('settings.personalityNeedAge'))
  }

  const commitPersonalityPreset = async (p: {
    id: string
    label: string
    requiresAdult18?: boolean
  }) => {
    const saved = await window.Ackem.personalitySet(p.id)
    setSettings(saved)
    setForm((f) =>
      f
        ? {
            ...f,
            personalityPresetId: saved.personalityPresetId,
            companionGender: saved.companionGender
          }
        : saved
    )
    useAppStore.getState().setPersonalityAwakening(p.label)
    pushToast(t('settings.switchedPersonality', { label: p.label }))
  }

  const applyPersonalityPreset = async (
    p: {
      id: string
      label: string
      requiresAdult18?: boolean
    },
    skipConfirm = false
  ) => {
    if (p.requiresAdult18 && !form.ageConfirmed18) {
      redirectToAgeConfirm()
      return
    }
    try {
      if (
        !skipConfirm &&
        form.personalityPresetId &&
        form.personalityPresetId !== p.id
      ) {
        const st = (await window.Ackem.getState()) as { counters?: { totalTurns?: number } }
        if ((st?.counters?.totalTurns ?? 0) > 0) {
          pendingPersonality.current = p
          setShowPersonalityConfirm(true)
          return
        }
      }
      await commitPersonalityPreset(p)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('PERSONALITY_NEED_AGE_CONFIRM')) {
        redirectToAgeConfirm()
        return
      }
      pushToast(msg)
    }
  }

  const openforuReady = isOpenForUConfigured(form)
  const dirty = settings ? isSettingsDirty(form, settings) : false

  const save = async () => {
    const block = desktopAgentSettingsSaveBlocked(form)
    if (block) {
      pushToast(block)
      return
    }
    const prev = settings ?? form
    const next = await window.Ackem.setSettings(prepareSettingsForSave(form))
    applyPersisted(next)
    await window.Ackem.ensureLayout()
    if (!onlyDesktopAgentSettingsChanged(prev, next)) {
      await window.Ackem.rebuildIndex()
    }
    setRootInfo(await window.Ackem.getDataRoot())
    pushToast(t('settings.saved'))
  }

  const cancelArchive = () => {
    setShowArchiveConfirm(false)
    setDeleteAttempted(true)
    setTab('chat')
    requestChatInputFocus()
  }

  const confirmArchive = async () => {
    setShowArchiveConfirm(false)
    setArchiveBusy(true)
    try {
      await window.Ackem.memoryClearAll()
      resetChat()
      await window.Ackem.saveChatHistory([])
      await window.Ackem.rebuildIndex()
      setTab('chat')
      requestChatInputFocus()
      pushToast(t('settings.archived'))
    } catch (e) {
      pushToast(t('settings.archiveFailed') + (e instanceof Error ? e.message : String(e)))
    } finally {
      setArchiveBusy(false)
    }
  }

  return (
    <>
    <div className="settings-page flex h-full min-h-0 flex-1 flex-col bg-surface">
      <header className="settings-page-header glass-panel">
        <h1 className="font-display text-base font-semibold text-ink">{t('settings.title')}</h1>
        <p className="mt-0.5 text-xs text-ink-muted">{t('settings.subtitle')}</p>
      </header>
      <div className="settings-page-body">
        <div className="settings-nav-column">
          <SettingsNav activeId={activeId} onNavigate={setActive} />
        </div>
        <div className="settings-main">
        <div className="settings-main-scroll">
        {activeId === 'settings-appearance' && <SettingsGroup
          id="settings-appearance"
          title={t('settings.appearance')}
          description={t('settings.appearanceDesc')}
        >
          <SettingsBlock title={t("settings.theme")} hint={t("settings.themeHint")}>
            <div className="settings-theme-cards">
              <button
                type="button"
                className={['settings-theme-card', theme === 'dark' ? 'is-active' : ''].join(' ')}
                onClick={() => {
                  if (theme === 'dark') return
                  const next = toggleTheme(theme)
                  setTheme(next)
                  pushToast(t('settings.switchedDark'))
                }}
              >
                <span>{t("settings.dark")}</span>
                <span>{t("settings.darkDesc")}</span>
              </button>
              <button
                type="button"
                className={['settings-theme-card', theme === 'light' ? 'is-active' : ''].join(' ')}
                onClick={() => {
                  if (theme === 'light') return
                  const next = toggleTheme(theme)
                  setTheme(next)
                  pushToast(t('settings.switchedLight'))
                }}
              >
                <span>{t("settings.light")}</span>
                <span>{t("settings.lightDesc")}</span>
              </button>
            </div>
          </SettingsBlock>
          <SettingsBlock title={t("settings.companionSkin")} hint={t("settings.companionSkinHint")}>
            <CompanionSkinSection embedded form={form} setForm={setForm} pushToast={pushToast} />
          </SettingsBlock>
          <SettingsBlock title={t("settings.petAndSensing")}>
            <SettingsActionStack>
              <SettingsActionItem
                title={t("settings.petWindow")}
                hint={t("settings.petWindowHint")}
                actionLabel={t("settings.toggle")}
                onAction={async () => {
                  try {
                    const level = await window.Ackem.ui.getLevel()
                    if (level.petVisible) {
                      await window.Ackem.ui.hidePet()
                      pushToast(t('settings.petHidden'))
                    } else {
                      await window.Ackem.ui.showPet()
                      pushToast(t('settings.petShown'))
                    }
                  } catch {
                    pushToast(t('settings.operationFailed'))
                  }
                }}
              />
              <SettingsActionItem
                title={t("settings.mediaSensing")}
                hint={mediaStatus || t('settings.mediaSensingHint')}
                actionLabel={t("settings.refresh")}
                onAction={async () => {
                  try {
                    const s = await window.Ackem.mediaStatus()
                    setMediaStatus(s.formatted || t('settings.noMedia'))
                  } catch {
                    setMediaStatus(t('settings.mediaDetectFailed'))
                  }
                }}
              />
            </SettingsActionStack>
          </SettingsBlock>
          <SettingsBlock title={t("settings.gameCompanion")} hint={t("settings.gameCompanionHint")}>
            <button
              type="button"
              onClick={() => {
                const store = useAppStore.getState()
                store.setSelectedGameId('minecraft')
                store.setTab('gamemode')
              }}
              className="field-btn-secondary px-4 py-2 text-sm"
            >
              {t("settings.openMcSettings")}
            </button>
          </SettingsBlock>
        </SettingsGroup>}
        {activeId === 'settings-companion' && <SettingsGroup
          id="settings-companion"
          title={t('settings.companionAndPersonality')}
          description={t('settings.companionAndPersonalityDesc')}
        >
        <SettingsBlock title={t("settings.callName")}>
          <SettingsField label={t("settings.callName")}>
            <input
              className="field-input w-full"
              value={form.companionName}
              onChange={(e) => setForm({ ...form, companionName: e.target.value })}
            />
          </SettingsField>
        </SettingsBlock>

        <SettingsBlock title={t("settings.personalityPreset")} hint={t("settings.personalityPresetHint")}>
          <SettingsSegmented
            name="cg"
            value={form.companionGender}
            onChange={(v) => {
              const gender = v as PresetGender
              setForm((f) => (f ? { ...f, companionGender: gender } : f))
              void persistPatch({ companionGender: gender }).catch((err) => {
                pushToast(err instanceof Error ? err.message : String(err))
              })
            }}
            options={[
              { value: 'male', label: t('settings.male') },
              { value: 'female', label: t('settings.female') }
            ]}
          />
          <SettingsPresetGrid>
            {presets.map((p) => {
              const locked = Boolean(p.requiresAdult18 && !form.ageConfirmed18)
              return (
              <SettingsPresetButton
                key={p.id}
                selected={form.personalityPresetId === p.id}
                locked={locked}
                onClick={() => {
                  void applyPersonalityPreset(p)
                }}
              >
                <span className="flex items-center gap-1.5">
                  <span>{p.label}</span>
                  {p.requiresAdult18 ? (
                    <span className="rounded-full border border-current/25 px-1 py-px text-[9px] uppercase tracking-wide opacity-70">
                      {t('settings.personalityAdultBadge')}
                    </span>
                  ) : null}
                </span>
              </SettingsPresetButton>
              )
            })}
          </SettingsPresetGrid>
        </SettingsBlock>

        <SettingsBlock
          title={t('settings.companionProactiveTitle')}
          hint={t('settings.companionProactiveHint')}
        >
          <SettingsToggleRow
            title={t('settings.companionHarassEnabled')}
            hint={t('settings.companionHarassHint')}
            checked={form.companionHarassEnabled ?? false}
            onChange={(v) => void persistPatch({ companionHarassEnabled: v })}
          />
        </SettingsBlock>
        </SettingsGroup>}

        {activeId === 'settings-mobile-weixin' && <WeixinConnectSection />}
        {activeId === 'settings-mobile-qq' && <MobileComingSoonSection platform="qq" />}
        {activeId === 'settings-mobile-telegram' && <MobileComingSoonSection platform="telegram" />}

        {activeId === 'settings-models' && <SettingsGroup
          id="settings-models"
          title={t('settings.modelAndApi')}
          description={t('settings.modelAndApiDesc')}
        >
          <SettingsBlock title={t("settings.chatModel")} hint={t("settings.chatModelHint")}>
            <details className="settings-details">
              <summary>{t("settings.protocolNote")}锛坽t("settings.openaiCompatible")} / Anthropic锛?/summary>
              <p className="text-[11px] leading-relaxed text-ink-muted">
                {t("settings.protocolDesc")}
                
              </p>
            </details>
            <SettingsField label={t("settings.llmProvider")}>
              <SettingsSegmented
                name="llmProv"
                value={form.llmProvider}
                onChange={(v) => setForm({ ...form, llmProvider: v as LlmProvider })}
                options={[
                  { value: 'openai', label: t('settings.openaiCompatible') },
                  { value: 'anthropic', label: 'Anthropic' }
                ]}
              />
            </SettingsField>
            {form.llmProvider === 'openai' ? (
              <label className="block text-xs font-medium text-ink-muted">
                {t("settings.openaiBaseUrl")}
                <input
                  className="field-input mt-1"
                  value={form.openaiBaseUrl}
                  onChange={(e) => setForm({ ...form, openaiBaseUrl: e.target.value })}
                />
              </label>
            ) : (
              <>
                <label className="block text-xs font-medium text-ink-muted">
                  {t('settings.anthropicBaseUrl')} <code className="font-mono">https://api.anthropic.com/v1</code>, can fill full .../messages)
                  <input
                    className="field-input mt-1"
                    value={form.anthropicBaseUrl}
                    onChange={(e) => setForm({ ...form, anthropicBaseUrl: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-medium text-ink-muted">
                  {t("settings.anthropicVersion")}
                  <input
                    className="field-input field-input--mono mt-1"
                    value={form.anthropicApiVersion}
                    onChange={(e) => setForm({ ...form, anthropicApiVersion: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-medium text-ink-muted">
                  {t("settings.maxTokens")}
                  <input
                    type="number"
                    className="field-input mt-1"
                    value={form.anthropicMaxTokens}
                    onChange={(e) =>
                      setForm({ ...form, anthropicMaxTokens: Math.max(256, Number(e.target.value) || 8192) })
                    }
                  />
                </label>
              </>
            )}
            <label className="block text-xs font-medium text-ink-muted">
              {form.llmProvider === 'anthropic'
                ? t("settings.anthropicApiKey")
                : t("settings.apiKeyOptional")}
              <input
                type="password"
                    className="field-input mt-1"
                value={form.openaiApiKey}
                onChange={(e) => setForm({ ...form, openaiApiKey: e.target.value })}
              />
            </label>
            {form.llmProvider === 'openai' ? (
              <label className="block text-xs font-medium text-ink-muted">
                {t("settings.apiKeyHeader")}
                <select
                  className="field-input mt-1"
                  value={form.apiKeyHeaderMode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      apiKeyHeaderMode: e.target.value === 'x-api-key' ? 'x-api-key' : 'bearer'
                    })
                  }
                >
                  <option value="bearer">{t('settings.bearer')}</option>
                  <option value="x-api-key">{t('settings.xApiKey')}</option>
                </select>
              </label>
            ) : null}
            <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.disableChatTools}
                onChange={(e) => setForm({ ...form, disableChatTools: e.target.checked })}
              />
              <span>
                {t('settings.disableTools')}
              </span>
            </label>
            <label className="block text-xs font-medium text-ink-muted">
              {t("settings.extraHeaders")}
              <textarea
                rows={2}
                placeholder={t("settings.extraHeadersPlaceholder")}
                className="field-input field-input--mono field-input--sm mt-1"
                value={form.llmExtraHeadersJson}
                onChange={(e) => setForm({ ...form, llmExtraHeadersJson: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-ink-muted">
              {t("settings.modelId")}
              <input
                    className="field-input mt-1"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </label>
            <SettingsField label={t("settings.timeout")}>
              <input
                type="number"
                className="field-input w-full"
                value={form.timeoutMs}
                onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) })}
              />
            </SettingsField>
          </SettingsBlock>
          <SettingsBlock title={t("settings.embeddingModel")} hint={t("settings.embeddingModelHint")}>
            <EmbeddingModelSection />
          </SettingsBlock>
        </SettingsGroup>}

        {activeId === 'settings-desktop-agent' && (
          <SettingsGroup
            id="settings-desktop-agent"
            title={t('settings.desktopAgent')}
            description={t('settings.desktopAgentDesc')}
          >
            <SettingsBlock title={t('settings.desktopAgent')} hint={t('settings.desktopAgentDesc')}>
              <DesktopAgentSettings form={form} setForm={(patch) => setForm({ ...form, ...patch })} />
            </SettingsBlock>
          </SettingsGroup>
        )}

        {activeId === 'settings-openforu' && (
          <SettingsGroup
            id="settings-openforu"
            title={t('settings.openforuPlan')}
            description={t('settings.openforuPlanDesc')}
          >
            <ExperimentalFeatureNotice
              titleKey="settings.openforuExperimentalTitle"
              bodyKey="settings.openforuExperimentalDesc"
              className="mb-4"
            />
            <SettingsBlock
              title={t('settings.openforuPlan')}
              hint={t('settings.openforuModelHint')}
              badge={
                <SettingsStatusBadge tone={openforuReady ? 'ok' : 'warn'}>
                  {openforuReady ? t('settings.configured') : t('settings.notConfigured')}
                </SettingsStatusBadge>
              }
            >
              <SettingsField label="Base URL">
                <input
                  className="field-input w-full"
                  placeholder="https://api.example.com/v1"
                  value={form.openforuBaseUrl ?? ''}
                  onChange={(e) => setForm({ ...form, openforuBaseUrl: e.target.value })}
                />
              </SettingsField>
              <SettingsField label="API Key">
                <input
                  type="password"
                  className="field-input w-full"
                  value={form.openforuApiKey ?? ''}
                  onChange={(e) => setForm({ ...form, openforuApiKey: e.target.value })}
                />
              </SettingsField>
              <SettingsField label="Model ID">
                <input
                  className="field-input w-full"
                  placeholder="o3 / deepseek-v4-pro 鈥?
                  value={form.openforuModel ?? ''}
                  onChange={(e) => setForm({ ...form, openforuModel: e.target.value })}
                />
              </SettingsField>
              <SettingsField label={t('settings.temperature')}>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  className="field-input w-full"
                  value={form.openforuTemperature ?? 0.2}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      openforuTemperature: clampOpenForUTemperature(Number(e.target.value))
                    })
                  }
                />
              </SettingsField>
            </SettingsBlock>
          </SettingsGroup>
        )}

        {activeId === 'settings-agnes' && (
          <SettingsGroup
            id="settings-agnes"
            title={t('settings.agnesImage')}
            description={t('settings.agnesImageDesc')}
          >
            <SettingsBlock
              title={t('settings.agnesImage')}
              hint={t('settings.agnesImageHint')}
              badge={
                <SettingsStatusBadge tone={form.agnesApiKey ? 'ok' : 'warn'}>
                  {form.agnesApiKey ? t('settings.configured') : t('settings.notConfigured')}
                </SettingsStatusBadge>
              }
            >
              <SettingsField label="Base URL">
                <input
                  className="field-input w-full"
                  placeholder="https://apihub.agnes-ai.com/v1"
                  value={form.agnesBaseUrl ?? ''}
                  onChange={(e) => setForm({ ...form, agnesBaseUrl: e.target.value })}
                />
              </SettingsField>
              <SettingsField label="API Key">
                <input
                  type="password"
                  className="field-input w-full"
                  placeholder="杈撳叆 Agnes API Key"
                  value={form.agnesApiKey ?? ''}
                  onChange={(e) => setForm({ ...form, agnesApiKey: e.target.value })}
                />
              </SettingsField>
              <SettingsField label="Model ID">
                <input
                  className="field-input w-full"
                  placeholder="agnes-image-2.1-flash"
                  value={form.agnesImageModel ?? ''}
                  onChange={(e) => setForm({ ...form, agnesImageModel: e.target.value })}
                />
              </SettingsField>
              <div className="mt-3 rounded-xl bg-surface-inset/30 px-3.5 py-2.5 text-xs text-ink-muted">
                馃挕 鍦ㄨ亰澶╂杈撳叆銆岀敾涓€寮?..銆嶆垨銆岀敓鎴愬浘鐗?..銆嶅嵆鍙嚜鍔ㄧ敓鎴愬浘鐗?
              </div>
            </SettingsBlock>
          </SettingsGroup>
        )}

        {activeId === 'settings-data' && <SettingsGroup
          id="settings-data"
          title={t('settings.dataAndMemory')}
          description={t('settings.dataAndMemoryDesc')}
        >
          <SettingsBlock title={t("settings.dataDir")} hint={t("settings.dataDirHint")}>
            {rootInfo ? (
              <dl className="settings-meta-list">
                <div className="settings-meta-row settings-meta-row--stack">
                  <dt>{t('settings.dataDirAbsolute')}</dt>
                  <dd className="settings-path-box">{rootInfo.path}</dd>
                </div>
                <div className="settings-meta-row settings-meta-row--stack">
                  <dt>{t('settings.dataDirRelative')}</dt>
                  <dd className="settings-path-box">{rootInfo.relativePath}</dd>
                </div>
              </dl>
            ) : null}
            <SettingsRow>
              <button
                type="button"
                onClick={() => void window.Ackem.openDataFolder()}
                className="field-btn-secondary px-3 py-2 text-xs"
              >
                {t("settings.openDataDir")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await window.Ackem.rebuildIndex()
                  pushToast(t('settings.indexRebuilt'))
                }}
                className="field-btn-secondary px-3 py-2 text-xs"
              >
                {t("settings.rebuildIndex")}
              </button>
            </SettingsRow>
          </SettingsBlock>

          <SettingsBlock title={t("settings.memoryParams")}>
            <div className="settings-grid-2">
              <SettingsField label={t("settings.diaryDays")}>
                <input
                  type="number"
                  className="field-input w-full"
                  value={form.tierBDiaryDays}
                  onChange={(e) => setForm({ ...form, tierBDiaryDays: Number(e.target.value) })}
                />
              </SettingsField>
              <SettingsField label={t("settings.memoryBudget")}>
                <input
                  type="number"
                  className="field-input w-full"
                  value={form.memoryBudgetChars}
                  onChange={(e) => setForm({ ...form, memoryBudgetChars: Number(e.target.value) })}
                />
              </SettingsField>
            </div>
          </SettingsBlock>

          <SettingsBlock title={t("settings.engineMaintenance")} hint={t("settings.engineMaintenanceHint")}>
            <SettingsActionStack>
            <SettingsActionItem
              title={t("settings.generateDiary")}
              busy={diaryBusy}
              busyLabel={t("settings.generating")}
              actionLabel={t("settings.generate")}
              result={diaryResult}
              onAction={async () => {
                setDiaryBusy(true)
                setDiaryResult(null)
                try {
                  const r = await window.Ackem.diaryGenerate()
                  if (r.ok) {
                    setDiaryResult(t('settings.diaryGenerated', { path: r.path ?? '' }))
                    pushToast(t('settings.diaryGeneratedToast'))
                  } else {
                    setDiaryResult(r.reason ?? '{t("settings.diaryGenFailed")}')
                  }
                } catch (e) {
                  setDiaryResult(e instanceof Error ? e.message : String(e))
                } finally {
                  setDiaryBusy(false)
                }
              }}
            />
            <SettingsActionItem
              title={t("settings.generateThought")}
              busy={thoughtBusy}
              busyLabel={t("settings.generating")}
              actionLabel={t("settings.generate")}
              result={thoughtResult}
              onAction={async () => {
                setThoughtBusy(true)
                setThoughtResult(null)
                try {
                  const r = await window.Ackem.thoughtGenerate()
                  setThoughtResult(t('settings.thoughtGenerated', { count: r.thoughts.length }))
                  pushToast(t('settings.thoughtGeneratedToast'))
                } catch (e) {
                  setThoughtResult(e instanceof Error ? e.message : String(e))
                } finally {
                  setThoughtBusy(false)
                }
              }}
            />
            <SettingsActionItem
              title={t("settings.manualConsolidate")}
              busy={consolidateBusy}
              busyLabel={t("settings.consolidating")}
              actionLabel={t("settings.consolidate")}
              result={consolidateResult}
              onAction={async () => {
                setConsolidateBusy(true)
                setConsolidateResult(null)
                try {
                  const r = await window.Ackem.memoryConsolidate()
                  setConsolidateResult(t('settings.consolidateResult', { count: r.added }))
                  pushToast(t('settings.consolidateToast'))
                } catch (e) {
                  setConsolidateResult(e instanceof Error ? e.message : String(e))
                } finally {
                  setConsolidateBusy(false)
                }
              }}
            />
            <SettingsActionItem
              title={t("settings.mirrorDetect")}
              busy={mirrorBusy}
              busyLabel={t("settings.detecting")}
              actionLabel={t("settings.detect")}
              result={mirrorResult}
              onAction={async () => {
                setMirrorBusy(true)
                setMirrorResult(null)
                try {
                  const r = await window.Ackem.mirrorCheck()
                  if (r.contradictions.length === 0) {
                    setMirrorResult('{t("settings.noContradiction")}')
                  } else {
                    setMirrorResult(
                      `${r.contradictions.length} 澶勶細${r.contradictions.map((c) => c.description).join('锛?)}`
                    )
                  }
                } catch (e) {
                  setMirrorResult(e instanceof Error ? e.message : String(e))
                } finally {
                  setMirrorBusy(false)
                }
              }}
            />
            </SettingsActionStack>
          </SettingsBlock>

          <SettingsBlock title={t("settings.dangerousOps")}>
            <div className="settings-danger-zone">
              <p className="text-xs text-ink-muted">
                {t("settings.archiveHint")}
              </p>
              <button
                type="button"
                disabled={archiveBusy}
                onClick={() => setShowArchiveConfirm(true)}
                className="field-btn-danger mt-3 px-3 py-2 text-xs disabled:opacity-50"
              >
                {archiveBusy ? t("settings.processing") : t("settings.archiveAction")}
              </button>
            </div>
          </SettingsBlock>
        </SettingsGroup>}

        {activeId === 'settings-voice' && (
          <SettingsGroup id="settings-voice" title={t('settings.voice')} description={t('settings.voiceDesc')}>
            <VoiceSettings />
          </SettingsGroup>
        )}

        {activeId === 'settings-safety' && <SettingsGroup id="settings-safety" title={t('settings.safety')} description={t('settings.safetyDesc')}>
          <SettingsBlock title={t("settings.compliance")}>
            <label className="settings-check-card" id="settings-age-confirm">
              <input
                type="checkbox"
                checked={form.ageConfirmed18}
                onChange={(e) => {
                  const checked = e.target.checked
                  void persistPatch(
                    {
                      ageConfirmed18: checked,
                      adultContentMode: checked ? form.adultContentMode : false
                    },
                    checked ? t('settings.ageConfirmed') : t('settings.ageCancelled')
                  )
                }}
              />
              <span>
                {t("settings.ageStatement")}
              </span>
            </label>
            <SettingsToggleRow
              title={t("settings.adultMode")}
              hint={
                form.ageConfirmed18
                  ? t("settings.adultModeLocal")
                  : t("settings.adultModeNeedAge")
              }
              checked={form.adultContentMode && form.ageConfirmed18}
              disabled={!form.ageConfirmed18}
              onChange={(checked) => {
                if (checked) setShowAdultConfirm(true)
                else void persistPatch({ adultContentMode: false }, t('settings.adultModeOff'))
              }}
            />
          </SettingsBlock>
        </SettingsGroup>}

        {showAdultConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-surface-raised rounded-2xl border border-surface-inset shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-base font-semibold text-ink">鈿狅笍 {t("settings.adultModeConfirm")}</h3>
              <div className="mt-4 space-y-3 text-sm text-ink-muted leading-relaxed">
                <p>
                  {t('settings.adultModeDesc')}
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>t('settings.adultModePoints').split(' / ')[0]</li>
                  <li>t('settings.adultModePoints').split(' / ')[1]</li>
                  <li>t('settings.adultModePoints').split(' / ')[2]</li>
                  <li>t('settings.adultModePoints').split(' / ')[3]</li>
                  <li>t('settings.adultModePoints').split(' / ')[4]</li>
                </ul>
                <p className="text-xs text-ink-muted">
                  {t('settings.adultModeDisclaimer')}
                </p>
              </div>
              <div className="mt-6 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAdultConfirm(false)}
                  className="rounded-lg border border-surface-inset px-4 py-2 text-sm text-ink-muted hover:bg-surface"
                >
                  {t('settings.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdultConfirm(false)
                    void persistPatch({ adultContentMode: true }, t('settings.adultModeOn'))
                  }}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  {t("settings.confirmOpen")}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeId === 'settings-update' && <UpdateSettingsPanel />}

        {activeId === 'settings-oss-notice' && (
          <SettingsGroup
            id="settings-oss-notice"
            title={t('settings.ossNotice')}
            description={t('settings.ossNoticeDesc')}
          >
            <SettingsBlock title={t('settings.ossNoticeBodyTitle')}>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">
                {t('settings.ossNoticePlaceholder')}
              </p>
            </SettingsBlock>
          </SettingsGroup>
        )}

        {activeId === 'settings-uninstall' && (
          <SettingsGroup
            id="settings-uninstall"
            title={t('settings.uninstall')}
            description={t('settings.uninstallDesc')}
          >
            <SettingsBlock title={t('settings.uninstallBodyTitle')} hint={t('settings.uninstallBodyHint')}>
              {uninstallInfo ? (
                <dl className="settings-meta-list mb-4">
                  <div className="settings-meta-row">
                    <dt>{t('settings.data')}</dt>
                    <dd className="font-mono text-[11px] break-all">{uninstallInfo.dataRoot}</dd>
                  </div>
                  {uninstallInfo.batPath ? (
                    <div className="settings-meta-row">
                      <dt>{t('settings.uninstall')}</dt>
                      <dd className="font-mono text-[11px] break-all">{uninstallInfo.batPath}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              <SettingsToggleRow
                title={t('settings.uninstallDeleteData')}
                checked={uninstallDeleteData}
                onChange={setUninstallDeleteData}
              />
              {uninstallInfo?.mode !== 'installed' ? (
                <SettingsToggleRow
                  title={t('settings.uninstallRemoveApp')}
                  checked={uninstallRemoveApp}
                  onChange={setUninstallRemoveApp}
                />
              ) : null}
              <div className="settings-danger-zone mt-4">
                <button
                  type="button"
                  disabled={uninstallBusy}
                  onClick={() => setShowUninstallConfirm(true)}
                  className="field-btn-danger px-3 py-2 text-xs disabled:opacity-50"
                >
                  {uninstallBusy ? t('settings.uninstallBusy') : t('settings.uninstallAction')}
                </button>
              </div>
            </SettingsBlock>
          </SettingsGroup>
        )}

        {activeId === 'settings-more' && <SettingsGroup id="settings-more" title={t('settings.more')} description={t('settings.moreDesc')}>
          <SettingsBlock title={t("settings.language")} hint={t("settings.languageHint")}>
            <SettingsSegmented
              name="locale"
              value={getLocale()}
              onChange={async (v) => {
                await setLocale(v)
                await refreshI18n()
                // Force re-render
                setForm({ ...form })
                pushToast(v === 'en' ? 'Language switched to English' : '宸插垏鎹负涓枃')
              }}
              options={[
                { value: 'zh', label: '涓枃' },
                { value: 'en', label: 'English' }
              ]}
            />
          </SettingsBlock>
          <SettingsBlock title={t("settings.quickLinks")} hint={t("settings.quickLinksHint")}>
            <SettingsActionStack>
              <SettingsActionItem
                title={t("settings.importAndProfile")}
                hint={t("settings.importAndProfileHint")}
                actionLabel={t("settings.open")}
                onAction={() => setTab('import')}
              />
              <SettingsActionItem
                title={t("settings.extensionCenter")}
                hint={t("settings.extensionCenterHint")}
                actionLabel={t("settings.open")}
                onAction={() => setTab('extensions')}
              />
              <SettingsActionItem
                title={t("settings.memoryBank")}
                hint={t("settings.memoryBankHint")}
                actionLabel={t("settings.open")}
                onAction={() => setTab('memory')}
              />
              <SettingsActionItem
                title={t("settings.debugPanel")}
                hint={t("settings.debugPanelHint")}
                actionLabel={t("settings.open")}
                onAction={() => setTab('trace')}
              />
            </SettingsActionStack>
          </SettingsBlock>
          <SettingsBlock title={t("settings.about")}>
            <dl className="settings-meta-list">
              <div className="settings-meta-row">
                <dt>{t("settings.version")}</dt>
                <dd>{appVersion ? `${appVersion}${t('settings.versionSuffix')}` : t('settings.versionValue')}</dd>
              </div>
              {canonInfo && (
                <>
                  <div className="settings-meta-row">
                    <dt>{t("settings.canonBirthDate")}</dt>
                    <dd>{canonInfo.birthDate}</dd>
                  </div>
                  <div className="settings-meta-row">
                    <dt>{t("settings.canonCreator")}</dt>
                    <dd>{t("settings.canonCreatorValue")}</dd>
                  </div>
                </>
              )}
              <div className="settings-meta-row">
                <dt>{t("settings.data")}</dt>
                <dd>{t("settings.dataDesc")}</dd>
              </div>
              <div className="settings-meta-row">
                <dt>{t("settings.telemetry")}</dt>
                <dd>{t("settings.telemetryDesc")}</dd>
              </div>
            </dl>
          </SettingsBlock>
        </SettingsGroup>}
        </div>

        <div className="settings-save-bar">
          <p className={dirty ? 'settings-dirty-hint' : 'settings-dirty-hint text-ink-muted'}>
            {dirty
              ? t("settings.unsavedChanges")
              : t("settings.synced")}
          </p>
          <button
            type="button"
            onClick={() => void save()}
            className="w-full rounded-xl bg-accent py-3 text-sm font-medium text-white hover:bg-accent-hover"
          >
            {dirty ? t('settings.saveAndApply') : t('settings.saveAndRebuild')}
          </button>
        </div>
        </div>
      </div>
    </div>
    <ConfirmDialog
      open={showPersonalityConfirm}
      title={t("settings.switchPersonalityTitle")}
      confirmLabel={t("settings.switchPersonalityConfirm")}
      cancelLabel={t("settings.cancel")}
      onCancel={() => {
        setShowPersonalityConfirm(false)
        pendingPersonality.current = null
      }}
      onConfirm={() => {
        setShowPersonalityConfirm(false)
        const p = pendingPersonality.current
        pendingPersonality.current = null
        if (!p) return
        void applyPersonalityPreset(p, true)
      }}
    >
      <p>{t("settings.switchPersonalityDesc")}</p>
      <p className="mt-2">
        {t('settings.switchPersonalityDesc2', {
          subject: companionSubjectPronoun(form.companionGender)
        })}
      </p>
    </ConfirmDialog>
    <ConfirmDialog
      open={showArchiveConfirm}
      title={t("settings.archiveAllTitle")}
      danger
      cancelLabel={t("settings.archiveAllCancel")}
      confirmLabel={t("settings.archiveAllConfirm")}
      onCancel={cancelArchive}
      onConfirm={() => void confirmArchive()}
    >
      <p>
        {t('settings.archiveAllDesc')}
      </p>
      <p className="mt-2">{t('settings.archiveAllKeep')}</p>
      <p className="mt-2 font-medium text-red-600">{t("settings.archiveAllIrreversible")}</p>
    </ConfirmDialog>
    <ConfirmDialog
      open={showUninstallConfirm}
      title={t('settings.uninstallTitle')}
      danger
      cancelLabel={t('settings.cancel')}
      confirmLabel={t('settings.uninstallConfirm')}
      onCancel={() => setShowUninstallConfirm(false)}
      onConfirm={() => {
        setShowUninstallConfirm(false)
        void (async () => {
          setUninstallBusy(true)
          try {
            await window.Ackem.uninstallAckem({
              deleteData: uninstallDeleteData,
              removeApp: uninstallRemoveApp
            })
            pushToast(t('settings.uninstallStarted'))
          } catch (e) {
            pushToast(e instanceof Error ? e.message : t('settings.uninstallFailed'))
            setUninstallBusy(false)
          }
        })()
      }}
    >
      <p>{t('settings.uninstallDialogDesc')}</p>
      {uninstallDeleteData && uninstallInfo ? (
        <p className="mt-2 font-medium text-red-600">
          {t('settings.uninstallDialogData', { path: uninstallInfo.dataRoot })}
        </p>
      ) : null}
      {uninstallRemoveApp && uninstallInfo?.mode !== 'installed' ? (
        <p className="mt-2 font-medium text-red-600">{t('settings.uninstallDialogApp')}</p>
      ) : null}
    </ConfirmDialog>
    </>
  )
}
