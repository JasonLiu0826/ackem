import { useState, type ReactNode, useSyncExternalStore } from 'react'
import { getI18nVersion, subscribeI18n, t } from '../../lib/i18n'

export function SettingsGroup(props: {
  id: string
  title: string
  description?: string
  children: ReactNode
}): JSX.Element {
  return (
    <section id={props.id} className="settings-group glass-panel scroll-mt-28">
      <div className="settings-group-head">
        <h2 className="settings-group-title">{props.title}</h2>
        {props.description ? <p className="settings-group-desc">{props.description}</p> : null}
      </div>
      <div className="settings-group-body">{props.children}</div>
    </section>
  )
}

export function SettingsBlock(props: {
  id?: string
  title: string
  hint?: string
  badge?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <div id={props.id} className="settings-block scroll-mt-28">
      <div className="settings-block-head">
        <div className="settings-block-head-text">
          <h3 className="settings-block-title">{props.title}</h3>
          {props.hint ? <p className="settings-block-hint">{props.hint}</p> : null}
        </div>
        {props.badge ?? null}
      </div>
      <div className="settings-block-body">{props.children}</div>
    </div>
  )
}

export function SettingsField(props: {
  label: string
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <label className={['settings-field', props.className].filter(Boolean).join(' ')}>
      <span className="settings-field-label">{props.label}</span>
      {props.children}
    </label>
  )
}

export function SettingsRow(props: { children: ReactNode }): JSX.Element {
  return <div className="settings-row">{props.children}</div>
}

export function SettingsStatusBadge(props: {
  tone: 'ok' | 'warn' | 'neutral'
  children: ReactNode
}): JSX.Element {
  return (
    <span className={['settings-status-badge', `settings-status-badge--${props.tone}`].join(' ')}>
      {props.children}
    </span>
  )
}

export function SettingsActionItem(props: {
  title: string
  hint?: string
  busy?: boolean
  busyLabel?: string
  actionLabel: string
  result?: string | null
  onAction: () => void
}): JSX.Element {
  return (
    <div className="settings-action-item">
      <div className="settings-action-item__text">
        <p className="settings-action-item__title">{props.title}</p>
        {props.hint ? <p className="settings-action-item__hint">{props.hint}</p> : null}
        {props.result ? <p className="settings-action-item__result">{props.result}</p> : null}
      </div>
      <button
        type="button"
        disabled={props.busy}
        onClick={props.onAction}
        className="field-btn-secondary settings-action-item__btn"
      >
        {props.busy ? props.busyLabel ?? '处理中…' : props.actionLabel}
      </button>
    </div>
  )
}

export function SettingsActionStack(props: { children: ReactNode }): JSX.Element {
  return <div className="settings-action-stack">{props.children}</div>
}

export function SettingsOptionCards<T extends string>(props: {
  name: string
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; hint?: string }>
}): JSX.Element {
  return (
    <div className="settings-option-cards" role="radiogroup" aria-label={props.name}>
      {props.options.map((opt) => {
        const selected = props.value === opt.value
        return (
          <label
            key={opt.value}
            className={['settings-option-card', selected ? 'settings-option-card--selected' : ''].join(' ')}
          >
            <input
              type="radio"
              name={props.name}
              className="sr-only"
              checked={selected}
              onChange={() => props.onChange(opt.value)}
            />
            <span className="settings-option-card__label">{opt.label}</span>
            {opt.hint ? <span className="settings-option-card__hint">{opt.hint}</span> : null}
          </label>
        )
      })}
    </div>
  )
}

export function SettingsSegmented<T extends string>(props: {
  name: string
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string }>
}): JSX.Element {
  return (
    <div className="settings-segmented" role="radiogroup" aria-label={props.name}>
      {props.options.map((opt) => {
        const selected = props.value === opt.value
        return (
          <label key={opt.value} className={['settings-segmented__item', selected ? 'is-active' : ''].join(' ')}>
            <input
              type="radio"
              name={props.name}
              className="sr-only"
              checked={selected}
              onChange={() => props.onChange(opt.value)}
            />
            {opt.label}
          </label>
        )
      })}
    </div>
  )
}

export function SettingsToggleRow(props: {
  title: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}): JSX.Element {
  return (
    <div className={['settings-toggle-row', props.disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}>
      <div className="settings-toggle-row__text">
        <p className="settings-toggle-row__title">{props.title}</p>
        {props.hint ? <p className="settings-toggle-row__hint">{props.hint}</p> : null}
      </div>
      <label className="settings-switch">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={props.checked}
          disabled={props.disabled}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        <span className="settings-switch__track" aria-hidden />
      </label>
    </div>
  )
}

export function SettingsPresetGrid(props: { children: ReactNode }): JSX.Element {
  return <div className="settings-preset-grid">{props.children}</div>
}

export function SettingsPresetButton(props: {
  selected: boolean
  locked?: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        'settings-preset-btn',
        props.selected ? 'is-selected' : '',
        props.locked ? 'is-locked' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.children}
    </button>
  )
}

export function SettingsPathBox(props: { children: ReactNode }): JSX.Element {
  return <div className="settings-path-box">{props.children}</div>
}

/** 实验性功能角标（浅/深主题 via extension-preview-badge） */
export function ExperimentalFeatureBadge(props: { className?: string }): JSX.Element {
  return (
    <span
      className={[
        'rounded-full extension-preview-badge px-1.5 py-0.5 text-[10px] font-medium leading-none',
        props.className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {t('common.experimental')}
    </span>
  )
}

export function ExperimentalFeatureNotice(props: {
  titleKey: string
  bodyKey: string
  className?: string
}): JSX.Element {
  return (
    <div className={['exp-panel rounded-xl px-3 py-2.5', props.className].filter(Boolean).join(' ')}>
      <p className="exp-title text-xs font-medium">{t(props.titleKey)}</p>
      <p className="exp-body mt-1 text-xs leading-relaxed">{t(props.bodyKey)}</p>
    </div>
  )
}

export type SettingsSectionId =
  | 'settings-appearance'
  | 'settings-companion'
  | 'settings-mobile-weixin'
  | 'settings-mobile-qq'
  | 'settings-mobile-telegram'
  | 'settings-models'
  | 'settings-desktop-agent'
  | 'settings-openforu'
  | 'settings-agnes'
  | 'settings-voice'
  | 'settings-data'
  | 'settings-safety'
  | 'settings-oss-notice'
  | 'settings-update'
  | 'settings-more'
  | 'settings-uninstall'

export interface NavItem {
  id: SettingsSectionId
  labelKey: string
  /** 暂未开放 */
  disabled?: boolean
  /** 实验性功能（侧栏角标） */
  experimental?: boolean
}

export interface NavGroup {
  labelKey: string
  items: NavItem[]
}

export const SETTINGS_NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'settings.nav.personalize',
    items: [
      { id: 'settings-appearance', labelKey: 'settings.appearance' },
      { id: 'settings-companion', labelKey: 'settings.companionAndPersonality' }
    ]
  },
  {
    labelKey: 'settings.nav.mobile',
    items: [
      { id: 'settings-mobile-weixin', labelKey: 'settings.mobile.weixin' },
      { id: 'settings-mobile-qq', labelKey: 'settings.mobile.qq', disabled: true },
      { id: 'settings-mobile-telegram', labelKey: 'settings.mobile.telegram', disabled: true }
    ]
  },
  {
    labelKey: 'settings.nav.ability',
    items: [
      { id: 'settings-models', labelKey: 'settings.modelAndApi' },
      { id: 'settings-desktop-agent', labelKey: 'settings.desktopAgent' },
      { id: 'settings-openforu', labelKey: 'settings.openforuPlan', experimental: true },
      { id: 'settings-agnes', labelKey: 'settings.agnesImage' },
      { id: 'settings-voice', labelKey: 'settings.voice' },
      { id: 'settings-data', labelKey: 'settings.dataAndMemory' }
    ]
  },
  {
    labelKey: 'settings.nav.other',
    items: [
      { id: 'settings-safety', labelKey: 'settings.safety' },
      { id: 'settings-oss-notice', labelKey: 'settings.ossNotice' },
      { id: 'settings-update', labelKey: 'settings.update' },
      { id: 'settings-more', labelKey: 'settings.more' },
      { id: 'settings-uninstall', labelKey: 'settings.uninstall' }
    ]
  }
]

/** 扁平化所有 nav item（用于移动端 pills） */
export const SETTINGS_NAV_FLAT: NavItem[] = SETTINGS_NAV_GROUPS.flatMap((g) => g.items)

const DEFAULT_SECTION: SettingsSectionId = SETTINGS_NAV_GROUPS[0].items[0].id

export function useSettingsSection(): {
  activeId: SettingsSectionId
  setActive: (id: SettingsSectionId) => void
} {
  const [activeId, setActiveId] = useState<SettingsSectionId>(DEFAULT_SECTION)
  const setActive = (id: SettingsSectionId) => {
    setActiveId(id)
    document.querySelector<HTMLElement>('.settings-main-scroll')?.scrollTo({ top: 0 })
  }
  return { activeId, setActive }
}

export function SettingsNav(props: {
  activeId: SettingsSectionId
  onNavigate: (id: SettingsSectionId) => void
}): JSX.Element {
  useSyncExternalStore(subscribeI18n, getI18nVersion, getI18nVersion)
  return (
    <>
      {/* 移动端：水平 pills */}
      <div className="settings-nav settings-nav--mobile" role="navigation" aria-label="设置分类">
        {SETTINGS_NAV_FLAT.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            aria-current={props.activeId === item.id ? 'true' : undefined}
            onClick={() => !item.disabled && props.onNavigate(item.id)}
            className={[
              'settings-nav-item',
              props.activeId === item.id ? 'settings-nav-item--active' : '',
              item.disabled ? 'settings-nav-item--disabled' : ''
            ].join(' ')}
          >
            {t(item.labelKey)}
            {item.experimental ? (
              <ExperimentalFeatureBadge className="ml-1.5 align-middle" />
            ) : null}
            {item.disabled ? (
              <span className="settings-nav-item__soon">{t('settings.mobile.comingSoon')}</span>
            ) : null}
          </button>
        ))}
      </div>
      {/* 桌面端：分组侧边栏 */}
      <nav className="settings-nav settings-nav--side" aria-label="设置分类">
        {SETTINGS_NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className="settings-nav-group">
            <span className="settings-nav-group-label">{t(group.labelKey)}</span>
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                aria-current={props.activeId === item.id ? 'true' : undefined}
                onClick={() => !item.disabled && props.onNavigate(item.id)}
                className={[
                  'settings-nav-item',
                  props.activeId === item.id ? 'settings-nav-item--active' : '',
                  item.disabled ? 'settings-nav-item--disabled' : ''
                ].join(' ')}
              >
                <span className="settings-nav-item__label">{t(item.labelKey)}</span>
                {item.experimental ? (
                  <ExperimentalFeatureBadge className="ml-1.5 shrink-0" />
                ) : null}
                {item.disabled ? (
                  <span className="settings-nav-item__soon">{t('settings.mobile.comingSoon')}</span>
                ) : null}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </>
  )
}
