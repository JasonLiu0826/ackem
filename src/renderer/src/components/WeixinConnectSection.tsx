import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n'
import {
  SettingsBlock,
  SettingsGroup,
  SettingsStatusBadge,
  SettingsToggleRow
} from './settings/settingsUi'

type WeixinStatus = {
  connected: boolean
  enabled: boolean
  polling: boolean
  proactiveEnabled: boolean
  accountId?: string
  userId?: string
  lastError?: string | null
  tokenExpired: boolean
  embeddingReady?: boolean
}

type LoginPhase = 'idle' | 'qr' | 'verify' | 'done'

function weixinStatusLabel(status: string): string {
  const key = `settings.mobile.weixin.status.${status}`
  const label = t(key)
  return label === key ? status : label
}

export function WeixinConnectSection(): JSX.Element {
  const [status, setStatus] = useState<WeixinStatus | null>(null)
  const [phase, setPhase] = useState<LoginPhase>('idle')
  const [qrcode, setQrcode] = useState('')
  const [qrImg, setQrImg] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [loginHint, setLoginHint] = useState('')
  const [busy, setBusy] = useState(false)
  const pollRef = useRef<number | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const s = await window.Ackem.weixinGetStatus()
      setStatus(s)
      if (s.connected) setPhase('done')
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    const unsub = window.Ackem.onWeixinStatusChanged?.((s) => setStatus(s))
    return () => {
      unsub?.()
      if (pollRef.current != null) window.clearInterval(pollRef.current)
    }
  }, [refreshStatus])

  const stopPoll = () => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const startPollLogin = (code: string) => {
    stopPoll()
    pollRef.current = window.setInterval(() => {
      void (async () => {
        try {
          const res = await window.Ackem.weixinPollLogin({ qrcode: code, verifyCode: verifyCode || undefined })
          setLoginHint(weixinStatusLabel(res.status))
          if (res.ok) {
            stopPoll()
            setPhase('done')
            await refreshStatus()
            return
          }
          if (res.needVerifyCode) {
            setPhase('verify')
            stopPoll()
          }
          if (res.status === 'expired') {
            stopPoll()
            setLoginHint(t('settings.mobile.weixin.qrExpired'))
            setPhase('idle')
          }
        } catch (e) {
          setLoginHint(e instanceof Error ? e.message : String(e))
        }
      })()
    }, 2000)
  }

  const beginLogin = async () => {
    setBusy(true)
    setLoginHint('')
    try {
      const res = await window.Ackem.weixinStartLogin()
      setQrcode(res.qrcode)
      setQrImg(res.qrcodeImgContent)
      setPhase('qr')
      startPollLogin(res.qrcode)
    } catch (e) {
      setLoginHint(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const submitVerify = async () => {
    if (!qrcode || !verifyCode.trim()) return
    setBusy(true)
    try {
      const res = await window.Ackem.weixinSubmitVerifyCode({ qrcode, verifyCode: verifyCode.trim() })
      if (res.ok) {
        setPhase('done')
        await refreshStatus()
      } else {
        setLoginHint(weixinStatusLabel(res.status))
        startPollLogin(qrcode)
      }
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    stopPoll()
    try {
      await window.Ackem.weixinDisconnect()
      setPhase('idle')
      setQrcode('')
      setQrImg('')
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  const setEnabled = async (on: boolean) => {
    await window.Ackem.weixinSetEnabled(on)
    await refreshStatus()
  }

  const setProactiveEnabled = async (on: boolean) => {
    await window.Ackem.weixinSetProactiveEnabled(on)
    await refreshStatus()
  }

  const connected = status?.connected ?? false
  const badgeTone = connected ? 'ok' : status?.tokenExpired ? 'warn' : 'neutral'

  return (
    <SettingsGroup
      id="settings-mobile-weixin"
      title={t('settings.mobile.weixin')}
      description={t('settings.mobile.weixinDesc')}
    >
      <SettingsBlock
        title={t('settings.mobile.weixin.statusTitle')}
        badge={
          <SettingsStatusBadge tone={badgeTone}>
            {connected
              ? t('settings.mobile.weixin.connected')
              : status?.tokenExpired
                ? t('settings.mobile.weixin.tokenExpired')
                : t('settings.mobile.weixin.disconnected')}
          </SettingsStatusBadge>
        }
      >
        <SettingsToggleRow
          title={t('settings.mobile.weixin.enableChannel')}
          hint={t('settings.mobile.weixin.enableHint')}
          checked={status?.enabled ?? false}
          disabled={!connected}
          onChange={(v) => void setEnabled(v)}
        />
        <SettingsToggleRow
          title={t('settings.mobile.weixin.proactiveEnabled')}
          hint={t('settings.mobile.weixin.proactiveHint')}
          checked={status?.proactiveEnabled ?? true}
          disabled={!connected || !status?.enabled}
          onChange={(v) => void setProactiveEnabled(v)}
        />
        {status?.polling ? (
          <p className="settings-hint-ok">{t('settings.mobile.weixin.polling')}</p>
        ) : connected && status?.enabled ? (
          <p className="settings-hint-warn">{t('settings.mobile.weixin.notPolling')}</p>
        ) : null}
        {connected && !status?.enabled ? (
          <p className="settings-hint-warn">{t('settings.mobile.weixin.channelOff')}</p>
        ) : null}
        {status?.embeddingReady === false ? (
          <p className="settings-hint-warn">{t('settings.mobile.weixin.embeddingWait')}</p>
        ) : null}
        {status?.accountId ? (
          <p className="text-xs text-ink-muted">
            {t('settings.mobile.weixin.accountLabel')}: {status.accountId}
          </p>
        ) : null}
      </SettingsBlock>

      <SettingsBlock title={t('settings.mobile.weixin.guideTitle')} hint={t('settings.mobile.weixin.guideHint')}>
        <ol className="weixin-guide-steps list-decimal space-y-3 pl-5 text-sm text-ink-muted">
          <li>{t('settings.mobile.weixin.step1')}</li>
          <li>{t('settings.mobile.weixin.step2')}</li>
          <li>{t('settings.mobile.weixin.step3')}</li>
          <li>{t('settings.mobile.weixin.step4')}</li>
          <li>{t('settings.mobile.weixin.step5')}</li>
          <li>{t('settings.mobile.weixin.step6')}</li>
        </ol>
        <div className="settings-callout-warn">
          <p className="settings-callout-warn__title">{t('settings.mobile.weixin.keepAwakeTitle')}</p>
          <ul>
            <li>{t('settings.mobile.weixin.keepAwake1')}</li>
            <li>{t('settings.mobile.weixin.keepAwake2')}</li>
            <li>{t('settings.mobile.weixin.keepAwake3')}</li>
            <li>{t('settings.mobile.weixin.keepAwake4')}</li>
          </ul>
        </div>
      </SettingsBlock>

      <SettingsBlock title={t('settings.mobile.weixin.connectTitle')}>
        {phase === 'idle' && !connected ? (
          <button type="button" className="btn-primary text-sm" disabled={busy} onClick={() => void beginLogin()}>
            {busy ? t('settings.mobile.weixin.working') : t('settings.mobile.weixin.startConnect')}
          </button>
        ) : null}

        {phase === 'qr' ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">{t('settings.mobile.weixin.scanHint')}</p>
            {qrImg ? (
              <div className="flex justify-center rounded-xl bg-white p-4">
                <img src={qrImg} alt="WeChat QR" className="max-h-64 max-w-full" />
              </div>
            ) : null}
            <p className="text-xs text-ink-muted">{loginHint}</p>
          </div>
        ) : null}

        {phase === 'verify' ? (
          <div className="space-y-2">
            <p className="text-sm text-ink-muted">{t('settings.mobile.weixin.verifyHint')}</p>
            <input
              className="field-input w-full max-w-xs"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder={t('settings.mobile.weixin.verifyPlaceholder')}
            />
            <button type="button" className="btn-primary text-sm" disabled={busy} onClick={() => void submitVerify()}>
              {t('settings.mobile.weixin.verifySubmit')}
            </button>
          </div>
        ) : null}

        {connected ? (
          <div className="mt-3 space-y-2">
            <p className="settings-hint-ok settings-hint-ok--md">{t('settings.mobile.weixin.connectedHint')}</p>
            {!status?.polling && status?.enabled ? (
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void window.Ackem
                    .weixinRestart()
                    .then(() => refreshStatus())
                    .finally(() => setBusy(false))
                }}
              >
                {t('settings.mobile.weixin.restartListen')}
              </button>
            ) : null}
            <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => void disconnect()}>
              {t('settings.mobile.weixin.disconnect')}
            </button>
          </div>
        ) : null}

        {loginHint && phase !== 'qr' ? <p className="mt-2 text-xs text-ink-muted">{loginHint}</p> : null}
      </SettingsBlock>
    </SettingsGroup>
  )
}

export function MobileComingSoonSection(props: { platform: 'qq' | 'telegram' }): JSX.Element {
  const title =
    props.platform === 'qq' ? t('settings.mobile.qq') : t('settings.mobile.telegram')
  return (
    <SettingsGroup id={`settings-mobile-${props.platform}`} title={title}>
      <SettingsBlock title={t('settings.mobile.comingSoonTitle')}>
        <p className="text-sm text-ink-muted">{t('settings.mobile.comingSoonBody')}</p>
      </SettingsBlock>
    </SettingsGroup>
  )
}
