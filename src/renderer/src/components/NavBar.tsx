import type { ReactElement } from 'react'
import { t } from '../lib/i18n'
import { companionAvatarStatusLabel } from '../../../shared/companionSkin'
import { CompanionAvatar } from './CompanionAvatar'
import { LightCore } from './LightCore'
import { useAppStore, type Tab } from '../store/appStore'

const items: { id: Tab; labelKey: string; icon: string }[] = [
  { id: 'chat', labelKey: 'nav.chat', icon: '馃挰' },
  { id: 'agent', labelKey: 'nav.agent', icon: '馃' },
  { id: 'memory', labelKey: 'nav.memory', icon: '馃' },
  { id: 'diary', labelKey: 'nav.diary', icon: '馃摂' },
  { id: 'gamemode', labelKey: 'nav.gamemode', icon: '馃幃' },
  { id: 'extensions', labelKey: 'nav.extensions', icon: '馃З' },
  { id: 'settings', labelKey: 'nav.settings', icon: '鈿? }
]

export function NavBar(props: { tab: Tab; onTab: (t: Tab) => void }): ReactElement {
  const avatarState = useAppStore((s) => s.companionAvatarState)
  const avatarTyping = useAppStore((s) => s.companionAvatarTyping)

  return (
    <nav className="app-nav relative z-10 flex h-full min-h-0 w-12 shrink-0 flex-col items-center border-r border-surface-inset/80 bg-surface py-3">
      <button
        type="button"
        className="mb-4 flex flex-col items-center gap-1"
        title={t('nav.collapsePet')}
        onClick={() => void window.Ackem.ui.showPet()}
      >
        <LightCore />
        <span className="font-display text-[9px] tracking-wider text-ink-muted/80">{t('nav.brand')}</span>
      </button>

      <div className="flex flex-1 flex-col items-center gap-2">
        {items.map(({ id, labelKey, icon }) => {
          const label = t(labelKey)
          return (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-current={props.tab === id ? 'page' : undefined}
              onClick={() => props.onTab(id)}
              className={['glass-nav-bead', props.tab === id ? 'active' : ''].filter(Boolean).join(' ')}
            >
              <span className="nav-bead-icon" aria-hidden>
                {icon}
              </span>
              {props.tab === id && (
                <span className="absolute -right-px top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-l-full bg-accent/80" aria-hidden />
              )}
            </button>
          )
        })}
      </div>

      <div className="nav-companion-slot mt-auto flex w-full flex-col items-center px-0.5 pb-1 pt-2">
        <div className="nav-companion-orb pointer-events-auto">
          <CompanionAvatar
            state={avatarState}
            inputTyping={avatarTyping}
            size={96}
            glowCanvasScale={2.8}
            parallaxStrength={0.1}
            className="bg-transparent"
          />
        </div>
        <p className="nav-companion-status mt-1 max-w-[44px] truncate text-center text-[9px] leading-tight text-ink-muted">
          {companionAvatarStatusLabel(avatarState)}
        </p>
      </div>
    </nav>
  )
}
