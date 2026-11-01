// [OwnerBindingBlock] — 机主绑定（QQ / 微信共用）
// 首个私聊者只进入「待确认」；必须在这里手动确认后才授予机主权限。
import { useCallback, useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import { SettingsBlock } from './settings/settingsUi'
import type { AppSettings } from '../ackem'

type Props = { kind: 'qq' | 'weixin' }

export function OwnerBindingBlock({ kind }: Props): JSX.Element {
  const [owner, setOwner] = useState('')
  const [pending, setPending] = useState('')
  const [busy, setBusy] = useState(false)

  const readFrom = useCallback(
    (s: AppSettings): { owner: string; pending: string } =>
      kind === 'qq'
        ? { owner: s.channelOwnerQqId ?? '', pending: s.channelOwnerPendingQqId ?? '' }
        : { owner: s.channelOwnerWeixinId ?? '', pending: s.channelOwnerPendingWeixinId ?? '' },
    [kind]
  )

  const refresh = useCallback(async () => {
    try {
      const s = await window.ackem.getSettings()
      const v = readFrom(s)
      setOwner(v.owner)
      setPending(v.pending)
    } catch {
      /* ignore */
    }
  }, [readFrom])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const patch = async (p: Partial<AppSettings>): Promise<void> => {
    setBusy(true)
    try {
      const cur = await window.ackem.getSettings()
      const next = await window.ackem.setSettings({ ...cur, ...p })
      const v = readFrom(next)
      setOwner(v.owner)
      setPending(v.pending)
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  const confirm = (): void => {
    void patch(
      kind === 'qq'
        ? { channelOwnerQqId: pending, channelOwnerPendingQqId: '' }
        : { channelOwnerWeixinId: pending, channelOwnerPendingWeixinId: '' }
    )
  }

  const reject = (): void => {
    void patch(kind === 'qq' ? { channelOwnerPendingQqId: '' } : { channelOwnerPendingWeixinId: '' })
  }

  const resetOwner = (): void => {
    void patch(
      kind === 'qq'
        ? { channelOwnerQqId: '', channelOwnerPendingQqId: '' }
        : { channelOwnerWeixinId: '', channelOwnerPendingWeixinId: '' }
    )
  }

  return (
    <SettingsBlock title={t('settings.mobile.ownerTitle')} hint={t('settings.mobile.ownerHint')}>
      <p className="text-xs text-ink-muted">
        {t('settings.mobile.ownerCurrent')}: {owner || t('settings.mobile.ownerUnbound')}
      </p>
      {pending ? (
        <>
          <p className="settings-hint-warn">
            {t('settings.mobile.ownerPending').replace('{peer}', pending)}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="field-btn-primary px-3 py-1.5 text-xs"
              disabled={busy}
              onClick={confirm}
            >
              {t('settings.mobile.ownerConfirm')}
            </button>
            <button
              type="button"
              className="field-btn-secondary px-3 py-1.5 text-xs"
              disabled={busy}
              onClick={reject}
            >
              {t('settings.mobile.ownerReject')}
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-ink-muted">{t('settings.mobile.ownerNoPending')}</p>
      )}
      {owner ? (
        <button
          type="button"
          className="field-btn-secondary px-3 py-1.5 text-xs"
          disabled={busy}
          onClick={resetOwner}
        >
          {t('settings.mobile.ownerReset')}
        </button>
      ) : null}
    </SettingsBlock>
  )
}
