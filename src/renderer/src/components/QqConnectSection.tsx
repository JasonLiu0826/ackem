import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n'
import {
  SettingsBlock,
  SettingsGroup,
  SettingsStatusBadge,
  SettingsToggleRow
} from './settings/settingsUi'
import { OwnerBindingBlock } from './OwnerBindingBlock'

type QqStatus = {
  connected: boolean
  enabled: boolean
  listening: boolean
  selfId?: string
  nickname?: string
  httpBaseUrl?: string
  wsUrl?: string
  lastError?: string | null
  embeddingReady?: boolean
  memesPath?: string
  memeCount?: number
}

type LoginPhase = 'idle' | 'qr' | '2fa' | 'connecting' | 'done'

const DEFAULT_HTTP = 'http://127.0.0.1:3001'
const DEFAULT_WS = 'ws://127.0.0.1:3001'
const DEFAULT_WEBUI = 'http://127.0.0.1:6099'
/** 二维码有效期按 100 秒算，到点自动刷新；NapCat 自己的有效期约 2 分钟 */
const QR_TTL_SECONDS = 100
/** 扫码成功后最多等 OneBot 30 秒 */
const CONNECT_RETRY_MS = 30_000

/** NapCat 的 loginPhase → 设置页文案 */
function loginStatusText(status: { phase?: string; loginError?: string }): string {
  if (status.loginError) return status.loginError
  switch (status.phase) {
    case 'qrcode_scanned':
      return t('settings.mobile.qq.loginScanned')
    case 'initializing':
      return t('settings.mobile.qq.loginInitializing')
    case 'offline':
    case 'reconnecting':
      return t('settings.mobile.qq.loginOffline')
    case 'generating_qrcode':
      return t('settings.mobile.qq.loginGenerating')
    default:
      return t('settings.mobile.qq.loginWaiting')
  }
}


export function QqConnectSection(): JSX.Element {
  const [status, setStatus] = useState<QqStatus | null>(null)
  const [httpBaseUrl, setHttpBaseUrl] = useState(DEFAULT_HTTP)
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS)
  const [accessToken, setAccessToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')
  const [hintTone, setHintTone] = useState<'ok' | 'warn' | 'neutral'>('neutral')
  const [probeInfo, setProbeInfo] = useState<{ selfId: string; nickname: string } | null>(null)
  const [friends, setFriends] = useState<Array<{ userId: string; nickname: string }> | null>(null)
  const [proactive, setProactive] = useState(false)

  // ── 扫码登录（NapCat WebUI）──
  const [webuiBaseUrl, setWebuiBaseUrl] = useState(DEFAULT_WEBUI)
  const [webuiToken, setWebuiToken] = useState('')
  const [webuiHasToken, setWebuiHasToken] = useState(false)
  const [loginPhase, setLoginPhase] = useState<LoginPhase>('idle')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrSecondsLeft, setQrSecondsLeft] = useState(0)
  const [qrScanned, setQrScanned] = useState(false)
  const [loginHint, setLoginHint] = useState('')
  const [loginError, setLoginError] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)

  const pollRef = useRef<number | null>(null)
  const countdownRef = useRef<number | null>(null)
  const retryRef = useRef<number | null>(null)
  const autoConnectRef = useRef(false)
  const autoRetryRef = useRef(0)
  const qrRef = useRef<HTMLDivElement | null>(null)
  const refreshRef = useRef<() => void>(() => {})
  const loginPhaseRef = useRef<LoginPhase>('idle')
  const oneBotRef = useRef({ httpBaseUrl, wsUrl, accessToken })
  loginPhaseRef.current = loginPhase
  oneBotRef.current = { httpBaseUrl, wsUrl, accessToken }

  const refreshStatus = useCallback(async () => {
    try {
      const s = (await window.ackem.qqGetStatus()) as QqStatus
      setStatus(s)
      if (s.httpBaseUrl) setHttpBaseUrl(s.httpBaseUrl)
      if (s.wsUrl) setWsUrl(s.wsUrl)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void window.ackem
      .getSettings()
      .then((cfg) => setProactive(cfg.qqProactiveEnabled === true))
      .catch(() => {})
    void refreshStatus()
    const unsub = window.ackem.onQqStatusChanged?.((s) => setStatus(s as QqStatus))
    return () => {
      unsub?.()
    }
  }, [refreshStatus])

  const clearLoginTimers = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (countdownRef.current != null) {
      window.clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    if (retryRef.current != null) {
      window.clearTimeout(retryRef.current)
      retryRef.current = null
    }
  }, [])

  useEffect(() => {
    void window.ackem
      .qqWebuiGet()
      .then((cfg) => {
        setWebuiBaseUrl(cfg.baseUrl)
        setWebuiHasToken(cfg.hasToken)
      })
      .catch(() => {})
    return () => clearLoginTimers()
  }, [clearLoginTimers])

  useEffect(() => {
    if (qrDataUrl) qrRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [qrDataUrl])

  const probe = async () => {
    setBusy(true)
    setHint('')
    setProbeInfo(null)
    try {
      const res = await window.ackem.qqProbe({ httpBaseUrl, wsUrl, accessToken })
      if (res.ok) {
        setProbeInfo({ selfId: res.selfId, nickname: res.nickname })
        setHintTone('ok')
        setHint(t('settings.mobile.qq.probeOk'))
      } else {
        setHintTone('warn')
        setHint(res.error)
      }
    } catch (e) {
      setHintTone('warn')
      setHint(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const connect = async () => {
    setBusy(true)
    setHint('')
    try {
      const res = await window.ackem.qqConnect({ httpBaseUrl, wsUrl, accessToken })
      if (res.ok) {
        setHintTone('ok')
        setHint(t('settings.mobile.qq.connectOk'))
        await refreshStatus()
      } else {
        setHintTone('warn')
        setHint(res.error)
      }
    } catch (e) {
      setHintTone('warn')
      setHint(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    try {
      await window.ackem.qqDisconnect()
      setProbeInfo(null)
      setFriends(null)
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  const toggleProactive = async (on: boolean) => {
    try {
      const cur = await window.ackem.getSettings()
      const next = await window.ackem.setSettings({ ...cur, qqProactiveEnabled: on })
      setProactive(next.qqProactiveEnabled === true)
    } catch {
      /* 设置写入失败时保持原状态 */
    }
  }

  const setEnabled = async (on: boolean) => {
    await window.ackem.qqSetEnabled(on)
    await refreshStatus()
  }

  const restart = async () => {
    setBusy(true)
    try {
      await window.ackem.qqRestart()
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  const loadFriends = async () => {
    setBusy(true)
    try {
      const res = await window.ackem.qqListFriends()
      if (res.ok) {
        setFriends(res.friends)
        setHintTone('ok')
        setHint(t('settings.mobile.qq.friendsLoaded').replace('{n}', String(res.friends.length)))
      } else {
        setHintTone('warn')
        setHint(res.error)
      }
    } finally {
      setBusy(false)
    }
  }

  // ── 扫码登录流程 ──

  /** 扫码成功后重试连接 OneBot：NapCat 刚登录时 3001 端口可能还没就绪 */
  const connectOneBotWithRetry = async (): Promise<boolean> => {
    const deadline = Date.now() + CONNECT_RETRY_MS
    let lastError = ''
    while (Date.now() < deadline) {
      try {
        const current = oneBotRef.current
        const res = await window.ackem.qqConnect({
          httpBaseUrl: current.httpBaseUrl,
          wsUrl: current.wsUrl,
          accessToken: current.accessToken
        })
        if (res.ok) return true
        lastError = res.error
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2000))
    }
    if (lastError) setLoginError(lastError)
    return false
  }

  const handleLoggedIn = async (alreadyLoggedIn: boolean) => {
    clearLoginTimers()
    setQrDataUrl('')
    setQrSecondsLeft(0)
    setQrScanned(false)
    setLoginError('')
    setLoginPhase('connecting')
    setLoginHint(
      alreadyLoggedIn
        ? t('settings.mobile.qq.loginAlready')
        : t('settings.mobile.qq.loginConnecting')
    )
    if (autoConnectRef.current) return
    autoConnectRef.current = true
    try {
      const ok = await connectOneBotWithRetry()
      if (ok) {
        setLoginPhase('done')
        setLoginHint(t('settings.mobile.qq.loginConnected'))
        setHintTone('ok')
        setHint(t('settings.mobile.qq.loginConnected'))
        await refreshStatus()
      } else {
        setLoginPhase('done')
        setLoginHint(t('settings.mobile.qq.loginConnectedButOffline'))
        setHintTone('warn')
        setHint(t('settings.mobile.qq.loginConnectedButOffline'))
      }
    } finally {
      autoConnectRef.current = false
    }
  }

  const startLoginPolling = () => {
    if (pollRef.current != null) return
    pollRef.current = window.setInterval(() => {
      void (async () => {
        try {
          const res = await window.ackem.qqLoginPoll()
          if (!res.ok) {
            if (res.need2FA) {
              clearLoginTimers()
              setLoginPhase('2fa')
              setLoginHint(t('settings.mobile.qq.login2faHint'))
            } else {
              clearLoginTimers()
              setLoginError(res.error)
            }
            return
          }
          const current = res.status
          if (current.isLogin) {
            clearLoginTimers()
            await handleLoggedIn(false)
            return
          }
          setLoginHint(loginStatusText(current))
          if (current.phase === 'qrcode_scanned') setQrScanned(true)
          else if (current.phase === 'waiting_qrcode') setQrScanned(false)
          if (current.loginError) setLoginError(current.loginError)
          else setLoginError('')
        } catch (e) {
          // 单次轮询失败不打断流程，下一次继续
          setLoginError(e instanceof Error ? e.message : String(e))
        }
      })()
    }, 2000)
  }

  const startCountdown = () => {
    if (countdownRef.current != null) window.clearInterval(countdownRef.current)
    setQrSecondsLeft(QR_TTL_SECONDS)
    countdownRef.current = window.setInterval(() => {
      setQrSecondsLeft((n) => (n > 0 ? n - 1 : 0))
    }, 1000)
  }

  const scheduleAutoRetry = () => {
    if (autoRetryRef.current >= 12) {
      setLoginError(
        t('settings.mobile.qq.loginRefreshFailed').replace(
          '{msg}',
          t('settings.mobile.qq.loginRestarting')
        )
      )
      return
    }
    autoRetryRef.current += 1
    if (retryRef.current != null) window.clearTimeout(retryRef.current)
    retryRef.current = window.setTimeout(() => {
      retryRef.current = null
      if (loginPhaseRef.current === 'qr') void refreshLoginQr(true)
    }, 5000)
  }

  const refreshLoginQr = async (auto = false) => {
    if (!auto) setLoginBusy(true)
    setLoginError('')
    try {
      const res = await window.ackem.qqLoginRefresh()
      if (!res.ok) {
        if (res.need2FA) {
          setLoginPhase('2fa')
          setLoginHint(t('settings.mobile.qq.login2faHint'))
          return
        }
        setLoginError(res.error)
        if (auto && /重启|没有返回|QRCode|连不上|fetch|稍等/i.test(res.error)) {
          scheduleAutoRetry()
        }
        return
      }
      if (res.alreadyLoggedIn) {
        await handleLoggedIn(false)
        return
      }
      if (res.restarting || !res.qrDataUrl) {
        setQrDataUrl('')
        // 避免倒计时 effect 在 0 秒时再触发一次刷新；重试交给 scheduleAutoRetry
        setQrSecondsLeft(QR_TTL_SECONDS)
        setLoginHint(t('settings.mobile.qq.loginRestarting'))
        scheduleAutoRetry()
        return
      }
      autoRetryRef.current = 0
      setQrDataUrl(res.qrDataUrl)
      setQrScanned(false)
      setLoginHint(t('settings.mobile.qq.loginWaiting'))
      startCountdown()
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : String(e))
      if (auto) scheduleAutoRetry()
    } finally {
      if (!auto) setLoginBusy(false)
    }
  }

  const startLogin = async (totp?: string) => {
    if (!webuiBaseUrl.trim()) {
      setLoginError(t('settings.mobile.qq.webuiBaseMissing'))
      return
    }
    if (!webuiToken.trim() && !webuiHasToken) {
      setLoginError(t('settings.mobile.qq.webuiTokenMissing'))
      return
    }
    const typedToken = webuiToken.trim()
    setLoginBusy(true)
    setLoginError('')
    setLoginHint('')
    setQrDataUrl('')
    setQrSecondsLeft(0)
    setQrScanned(false)
    setLoginPhase('idle')
    clearLoginTimers()
    autoRetryRef.current = 0
    try {
      const res = await window.ackem.qqLoginStart({
        baseUrl: webuiBaseUrl.trim(),
        token: typedToken || undefined,
        totpCode: totp?.trim() || undefined
      })
      if (typedToken) {
        // 只有真正生成成功才清空输入框；失败时保留，方便重试
        if (res.ok) {
          setWebuiHasToken(true)
          setWebuiToken('')
        }
      }
      if (!res.ok) {
        if (res.need2FA) {
          setLoginPhase('2fa')
          setLoginHint(t('settings.mobile.qq.login2faHint'))
        } else {
          setLoginError(res.error)
        }
        return
      }
      if (res.alreadyLoggedIn) {
        await handleLoggedIn(true)
        return
      }
      if (res.restarting) {
        setLoginPhase('qr')
        setQrSecondsLeft(QR_TTL_SECONDS)
        setLoginHint(t('settings.mobile.qq.loginRestarting'))
        scheduleAutoRetry()
        return
      }
      setQrDataUrl(res.qrDataUrl)
      setQrScanned(false)
      setLoginPhase('qr')
      setLoginHint(t('settings.mobile.qq.loginWaiting'))
      startCountdown()
      startLoginPolling()
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoginBusy(false)
    }
  }

  const submit2fa = async () => {
    const code = totpCode.trim()
    if (!/^\d{6}$/.test(code)) {
      setLoginError(t('settings.mobile.qq.login2faInvalid'))
      return
    }
    await startLogin(code)
  }

  const stopLogin = () => {
    clearLoginTimers()
    setLoginPhase('idle')
    setQrDataUrl('')
    setQrSecondsLeft(0)
    setQrScanned(false)
    setLoginHint('')
    setLoginError('')
    setTotpCode('')
    autoRetryRef.current = 0
    autoConnectRef.current = false
  }

  refreshRef.current = () => {
    void refreshLoginQr(true)
  }

  useEffect(() => {
    if (loginPhase !== 'qr' || qrSecondsLeft > 0) return
    // 已经扫码就别再刷新，否则会把正在确认的二维码换掉
    if (qrScanned) return
    refreshRef.current()
  }, [loginPhase, qrSecondsLeft, qrScanned])

  const connected = status?.connected ?? false
  const badgeTone = status?.listening ? 'ok' : connected ? 'warn' : 'neutral'
  const hintClass =
    hintTone === 'ok'
      ? 'settings-hint-ok'
      : hintTone === 'warn'
        ? 'settings-hint-warn'
        : 'text-xs text-ink-muted'

  return (
    <SettingsGroup
      id="settings-mobile-qq"
      title={t('settings.mobile.qq')}
      description={t('settings.mobile.qqDesc')}
    >
      <SettingsBlock
        title={t('settings.mobile.qq.statusTitle')}
        badge={
          <SettingsStatusBadge tone={badgeTone}>
            {status?.listening
              ? t('settings.mobile.qq.listening')
              : connected
                ? t('settings.mobile.qq.notListening')
                : t('settings.mobile.qq.disconnected')}
          </SettingsStatusBadge>
        }
      >
        <SettingsToggleRow
          title={t('settings.mobile.qq.enableChannel')}
          hint={t('settings.mobile.qq.enableHint')}
          checked={status?.enabled ?? false}
          disabled={!connected}
          onChange={(v) => void setEnabled(v)}
        />
        {connected && !status?.listening && status?.enabled ? (
          <p className="settings-hint-warn">{t('settings.mobile.qq.notListeningHint')}</p>
        ) : null}
        {status?.embeddingReady === false ? (
          <p className="settings-hint-warn">{t('settings.mobile.weixin.embeddingWait')}</p>
        ) : null}
        {status?.selfId ? (
          <p className="text-xs text-ink-muted">
            {t('settings.mobile.qq.selfLabel')}: {status.nickname ? `${status.nickname}（${status.selfId}）` : status.selfId}
          </p>
        ) : null}
        {status?.lastError ? (
          <p className="text-xs text-ink-muted">{status.lastError}</p>
        ) : null}
      </SettingsBlock>

      <OwnerBindingBlock kind="qq" />

      <SettingsBlock
        title={t('settings.mobile.qq.loginTitle')}
        hint={t('settings.mobile.qq.loginHint')}
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-ink-muted">{t('settings.mobile.qq.webuiLabel')}</span>
              <input
                className="field-input mt-1 w-full"
                value={webuiBaseUrl}
                onChange={(e) => setWebuiBaseUrl(e.target.value)}
                placeholder={DEFAULT_WEBUI}
                disabled={loginPhase === 'qr' || loginPhase === 'connecting'}
              />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">
                {t('settings.mobile.qq.webuiTokenLabel')}
              </span>
              <input
                className="field-input mt-1 w-full"
                value={webuiToken}
                onChange={(e) => setWebuiToken(e.target.value)}
                placeholder={
                  webuiHasToken
                    ? t('settings.mobile.qq.webuiTokenSaved')
                    : t('settings.mobile.qq.webuiTokenPlaceholder')
                }
                type="password"
                autoComplete="off"
                disabled={loginPhase === 'qr' || loginPhase === 'connecting'}
              />
            </label>
          </div>

          <p className="text-xs text-ink-muted">{t('settings.mobile.qq.webuiTokenHelp')}</p>

          {loginPhase !== 'qr' && loginPhase !== '2fa' && loginPhase !== 'connecting' ? (
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-3">
              <button
                type="button"
                className="field-btn-primary qq-login-cta"
                disabled={loginBusy}
                onClick={() => void startLogin()}
              >
                ▦{' '}
                {loginBusy
                  ? t('settings.mobile.qq.working')
                  : loginPhase === 'done'
                    ? t('settings.mobile.qq.loginRegenerate')
                    : t('settings.mobile.qq.loginStart')}
              </button>
              <p className="mt-2 text-xs text-ink-muted">
                {t('settings.mobile.qq.loginGenerateHint')}
              </p>
            </div>
          ) : null}

          {loginPhase === '2fa' ? (
            <div className="space-y-2 rounded-xl border border-surface-inset bg-surface p-3">
              <p className="text-sm">{t('settings.mobile.qq.login2faTitle')}</p>
              <p className="text-xs text-ink-muted">{t('settings.mobile.qq.login2faHint')}</p>
              <div className="flex flex-wrap gap-2">
                <input
                  className="field-input w-40"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={t('settings.mobile.qq.login2faPlaceholder')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <button
                  type="button"
                  className="field-btn-primary px-4 py-2 text-sm"
                  disabled={loginBusy}
                  onClick={() => void submit2fa()}
                >
                  {t('settings.mobile.qq.login2faSubmit')}
                </button>
              </div>
            </div>
          ) : null}

          {loginPhase === 'qr' && qrDataUrl ? (
            <div ref={qrRef} className="space-y-3">
              <p className="text-sm text-ink-muted">{t('settings.mobile.qq.loginScanHint')}</p>
              <div className="flex justify-center rounded-xl bg-white p-4">
                <img src={qrDataUrl} alt="QQ login QR" className="h-64 w-64" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-ink-muted">{loginHint}</p>
                <p className="text-xs text-ink-muted">
                  {qrScanned
                    ? t('settings.mobile.qq.loginScanned')
                    : t('settings.mobile.qq.loginExpiresIn').replace('{n}', String(qrSecondsLeft))}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="field-btn-primary qq-login-refresh"
                  disabled={loginBusy}
                  onClick={() => void refreshLoginQr(false)}
                >
                  ↻{' '}
                  {loginBusy
                    ? t('settings.mobile.qq.loginRefreshing')
                    : t('settings.mobile.qq.loginRefreshNow')}
                </button>
                <button
                  type="button"
                  className="field-btn-secondary px-4 py-2 text-sm"
                  disabled={loginBusy}
                  onClick={stopLogin}
                >
                  {t('settings.mobile.qq.loginClose')}
                </button>
              </div>
              <p className="text-xs text-ink-muted">
                {t('settings.mobile.qq.loginRefreshNowHint')}
              </p>
            </div>
          ) : null}

          {loginPhase === 'qr' && !qrDataUrl ? (
            <div className="space-y-2">
              <p className="text-xs text-ink-muted">
                {loginHint || t('settings.mobile.qq.loginRestarting')}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="field-btn-primary qq-login-refresh"
                  disabled={loginBusy}
                  onClick={() => void refreshLoginQr(false)}
                >
                  ↻{' '}
                  {loginBusy
                    ? t('settings.mobile.qq.loginRefreshing')
                    : t('settings.mobile.qq.loginRefreshNow')}
                </button>
                <button
                  type="button"
                  className="field-btn-secondary px-4 py-2 text-sm"
                  disabled={loginBusy}
                  onClick={stopLogin}
                >
                  {t('settings.mobile.qq.loginClose')}
                </button>
              </div>
            </div>
          ) : null}

          {loginPhase === 'connecting' ? <p className="settings-hint-ok">{loginHint}</p> : null}

          {loginPhase === 'done' ? (
            <p className={loginError ? 'settings-hint-warn' : 'settings-hint-ok'}>{loginHint}</p>
          ) : null}

          {loginError ? <p className="settings-hint-warn">{loginError}</p> : null}

          <p className="text-xs text-ink-muted">{t('settings.mobile.qq.loginNote')}</p>
        </div>
      </SettingsBlock>

      <SettingsBlock
        title={t('settings.mobile.qq.proactiveTitle')}
        hint={t('settings.mobile.qq.proactiveHint')}
      >
        <SettingsToggleRow
          title={t('settings.mobile.qq.proactiveToggle')}
          hint={t('settings.mobile.qq.proactiveToggleHint')}
          checked={proactive}
          disabled={!connected}
          onChange={(v) => void toggleProactive(v)}
        />
      </SettingsBlock>

      <SettingsBlock
        title={t('settings.mobile.qq.connectionTitle')}
        hint={t('settings.mobile.qq.connectionHint')}
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-ink-muted">{t('settings.mobile.qq.httpLabel')}</span>
            <input
              className="field-input mt-1 w-full max-w-md"
              value={httpBaseUrl}
              onChange={(e) => setHttpBaseUrl(e.target.value)}
              placeholder={DEFAULT_HTTP}
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-muted">{t('settings.mobile.qq.wsLabel')}</span>
            <input
              className="field-input mt-1 w-full max-w-md"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder={DEFAULT_WS}
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-muted">{t('settings.mobile.qq.tokenLabel')}</span>
            <input
              className="field-input mt-1 w-full max-w-md"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={t('settings.mobile.qq.tokenPlaceholder')}
              type="password"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="field-btn-secondary px-4 py-2 text-sm" disabled={busy} onClick={() => void probe()}>
              {t('settings.mobile.qq.probe')}
            </button>
            <button type="button" className="field-btn-primary px-4 py-2 text-sm" disabled={busy} onClick={() => void connect()}>
              {busy ? t('settings.mobile.qq.working') : t('settings.mobile.qq.connect')}
            </button>
            {connected ? (
              <button type="button" className="field-btn-secondary px-4 py-2 text-sm" disabled={busy} onClick={() => void disconnect()}>
                {t('settings.mobile.qq.disconnect')}
              </button>
            ) : null}
          </div>

          {probeInfo ? (
            <p className="text-xs text-ink-muted">
              {t('settings.mobile.qq.probeResult')}: {probeInfo.nickname}（{probeInfo.selfId}）
            </p>
          ) : null}
          {hint ? <p className={hintClass}>{hint}</p> : null}
        </div>
      </SettingsBlock>

      <SettingsBlock title={t('settings.mobile.qq.guideTitle')} hint={t('settings.mobile.qq.guideHint')}>
        <ol className="weixin-guide-steps list-decimal space-y-3 pl-5 text-sm text-ink-muted">
          <li>{t('settings.mobile.qq.step1')}</li>
          <li>{t('settings.mobile.qq.step2')}</li>
          <li>{t('settings.mobile.qq.step3')}</li>
          <li>{t('settings.mobile.qq.step4')}</li>
          <li>{t('settings.mobile.qq.step5')}</li>
          <li>{t('settings.mobile.qq.step6')}</li>
        </ol>
        <div className="settings-callout-warn">
          <p className="settings-callout-warn__title">{t('settings.mobile.qq.keepAwakeTitle')}</p>
          <ul>
            <li>{t('settings.mobile.qq.keepAwake1')}</li>
            <li>{t('settings.mobile.qq.keepAwake2')}</li>
            <li>{t('settings.mobile.qq.keepAwake3')}</li>
          </ul>
        </div>
      </SettingsBlock>

      <SettingsBlock title={t('settings.mobile.qq.friendsTitle')} hint={t('settings.mobile.qq.friendsHint')}>
        <button type="button" className="field-btn-secondary px-4 py-2 text-sm" disabled={busy || !connected} onClick={() => void loadFriends()}>
          {t('settings.mobile.qq.loadFriends')}
        </button>
        {friends && friends.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs text-ink-muted">
            {friends.slice(0, 12).map((f) => (
              <li key={f.userId}>
                {f.nickname}（{f.userId}）
              </li>
            ))}
            {friends.length > 12 ? <li>…</li> : null}
          </ul>
        ) : null}
        {connected && status?.enabled ? (
          <button type="button" className="field-btn-secondary ml-2 px-4 py-2 text-sm" disabled={busy} onClick={() => void restart()}>
            {t('settings.mobile.qq.restartListen')}
          </button>
        ) : null}
      </SettingsBlock>

      <SettingsBlock title={t('settings.mobile.qq.memeTitle')} hint={t('settings.mobile.qq.memeHint')}>
        <p className="text-xs text-ink-muted">
          {t('settings.mobile.qq.memePath')}
          {status?.memeCount != null
            ? ` ${t('settings.mobile.qq.memeCount').replace('{n}', String(status.memeCount))}`
            : ''}
        </p>
        {status?.memesPath ? (
          <p className="mt-1 select-all break-all text-xs text-ink-muted">{status.memesPath}</p>
        ) : null}
        <p className="mt-1 text-xs text-ink-muted">{t('settings.mobile.qq.memeMoods')}</p>
      </SettingsBlock>
    </SettingsGroup>
  )
}

