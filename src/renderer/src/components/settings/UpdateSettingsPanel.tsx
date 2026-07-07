import { useCallback, useEffect, useMemo, useState } from 'react'
import type { UpdateChannel, UpdateCheckResult } from '../../../../shared/updateTypes'
import { t } from '../../lib/i18n'
import { ConfirmDialog } from '../ConfirmDialog'
import {
  SettingsBlock,
  SettingsGroup,
  SettingsSegmented,
  SettingsStatusBadge
} from './settingsUi'

function formatSize(bytes: number): string {
  if (bytes <= 0) return '鈥?
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

function channelLabel(ch: UpdateChannel): string {
  if (ch === 'github') return t('settings.updateChannelGithub')
  if (ch === 'gitee') return t('settings.updateChannelGitee')
  return t('settings.updateChannelAuto')
}

export function UpdateSettingsPanel(): JSX.Element {
  const [appVersion, setAppVersion] = useState('')
  const [channel, setChannel] = useState<UpdateChannel>('auto')
  const [check, setCheck] = useState<UpdateCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [starting, setStarting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const packaged = check?.packaged ?? false

  const loadMeta = useCallback(async () => {
    const [ver, pref] = await Promise.all([
      window.Ackem.getAppVersion(),
      window.Ackem.getUpdateChannelPreference()
    ])
    setAppVersion(ver)
    setChannel(pref)
  }, [])

  const runCheck = useCallback(async () => {
    setChecking(true)
    setError(null)
    try {
      const result = await window.Ackem.checkUpdate()
      setCheck(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void loadMeta()
    void runCheck()
  }, [loadMeta, runCheck])

  const selectedRelease = useMemo(() => {
    if (!check) return undefined
    if (channel === 'github') return check.github?.error ? undefined : check.github
    if (channel === 'gitee') return check.gitee?.error ? undefined : check.gitee
    return check.latest
  }, [check, channel])

  const canUpdate = Boolean(packaged && selectedRelease?.version && check?.updateAvailable)

  const onChannelChange = async (next: UpdateChannel) => {
    setChannel(next)
    await window.Ackem.setUpdateChannelPreference(next)
  }

  const onConfirmUpdate = async () => {
    if (!selectedRelease) return
    setStarting(true)
    setError(null)
    try {
      const res = await window.Ackem.startUpdate({
        channel,
        targetVersion: selectedRelease.version,
        downloadUrl: selectedRelease.downloadUrl,
        expectedSize: selectedRelease.size,
        releasePageUrl: selectedRelease.releasePageUrl
      })
      if (!res.ok) {
        const reasonKey =
          res.reason === 'not_packaged'
            ? 'settings.updateErrorNotPackaged'
            : res.reason === 'not_writable'
              ? 'settings.updateErrorNotWritable'
              : res.reason === 'in_zip'
                ? 'settings.updateErrorInZip'
                : res.reason === 'no_release'
                  ? 'settings.updateErrorNoRelease'
                  : 'settings.updateErrorGeneric'
        setError(t(reasonKey))
        setStarting(false)
        setConfirmOpen(false)
        return
      }
      // main process will quit shortly
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStarting(false)
      setConfirmOpen(false)
    }
  }

  return (
    <SettingsGroup id="settings-update" title={t('settings.update')} description={t('settings.updateDesc')}>
      <SettingsBlock title={t('settings.updateCurrent')} hint={t('settings.updateCurrentHint')}>
        <dl className="settings-meta-list">
          <div className="settings-meta-row">
            <dt>{t('settings.version')}</dt>
            <dd>{appVersion || '鈥?}</dd>
          </div>
          {check?.checkedAt && (
            <div className="settings-meta-row">
              <dt>{t('settings.updateLastCheck')}</dt>
              <dd>{new Date(check.checkedAt).toLocaleString()}</dd>
            </div>
          )}
        </dl>
        {!packaged && (
          <p className="settings-block-hint mt-3">{t('settings.updateDevOnly')}</p>
        )}
      </SettingsBlock>

      <SettingsBlock
        title={t('settings.updateRemote')}
        badge={
          check?.updateAvailable ? (
            <SettingsStatusBadge tone="warn">{t('settings.updateAvailable')}</SettingsStatusBadge>
          ) : check ? (
            <SettingsStatusBadge tone="ok">{t('settings.updateUpToDate')}</SettingsStatusBadge>
          ) : null
        }
      >
        <SettingsSegmented
          name="update-channel"
          value={channel}
          options={[
            { value: 'auto', label: t('settings.updateChannelAuto') },
            { value: 'github', label: t('settings.updateChannelGithub') },
            { value: 'gitee', label: t('settings.updateChannelGitee') }
          ]}
          onChange={(v) => void onChannelChange(v as UpdateChannel)}
        />

        <div className="mt-4 space-y-2 text-sm">
          {check?.github && (
            <p className="text-ink-muted">
              GitHub:{' '}
              {check.github.error
                ? t('settings.updateChannelError', { error: check.github.error })
                : `v${check.github.version} 路 ${formatSize(check.github.size)}`}
            </p>
          )}
          {check?.gitee && (
            <p className="text-ink-muted">
              Gitee:{' '}
              {check.gitee.error
                ? t('settings.updateChannelError', { error: check.gitee.error })
                : `v${check.gitee.version} 路 ${formatSize(check.gitee.size)}`}
            </p>
          )}
          {selectedRelease && (
            <p className="text-ink-muted">
              {t('settings.updateSelectedLine', {
                channel: channelLabel(channel === 'auto' ? selectedRelease.channel : channel),
                version: selectedRelease.version
              })}
            </p>
          )}
        </div>

        {selectedRelease?.notes ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs font-medium text-ink-muted">{t('settings.updateReleaseNotes')}</p>
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-ink-muted font-sans">
              {selectedRelease.notes}
            </pre>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="field-btn-secondary"
            disabled={checking}
            onClick={() => void runCheck()}
          >
            {checking ? t('settings.updateChecking') : t('settings.updateCheck')}
          </button>
          <button
            type="button"
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            disabled={!canUpdate || starting}
            onClick={() => setConfirmOpen(true)}
          >
            {starting ? t('settings.updateStarting') : t('settings.updateNow')}
          </button>
        </div>
      </SettingsBlock>

      <ConfirmDialog
        open={confirmOpen}
        title={t('settings.updateConfirmTitle')}
        confirmLabel={t('settings.updateConfirmYes')}
        cancelLabel={t('settings.updateConfirmNo')}
        onConfirm={() => void onConfirmUpdate()}
        onCancel={() => setConfirmOpen(false)}
      >
        <p className="text-sm leading-relaxed text-ink-muted">{t('settings.updateConfirmBody')}</p>
      </ConfirmDialog>
    </SettingsGroup>
  )
}
