// [qzone] — 设置页「空间说说」区块
//
// 参考大肥鱼 / dsh_qzone_sticker 的设置项：总开关、试运行、每天几条、两条隔多久、
// 公开还是仅自己；再加上 ACKM 自己的「AI 写一条 → 预览 → 发表」和互动概率。
// 所有写入都走 settings:set，主进程保存后由 ipc/data.ts 的钩子重排调度。

import { useCallback, useEffect, useState } from 'react'
import type { AppSettings } from '../ackem'
import type {
  QzonePostPayload,
  QzoneStatusPayload,
  QzoneStylePayload,
  QzoneVisibilityPayload
} from '../ackem'
import { t } from '../lib/i18n'
import {
  SettingsBlock,
  SettingsGroup,
  SettingsStatusBadge,
  SettingsToggleRow
} from './settings/settingsUi'

function formatTime(iso?: string | null): string {
  if (!iso) return t('settings.mobile.qzone.none')
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return t('settings.mobile.qzone.none')
  return d.toLocaleString()
}

function NumberField(props: {
  label: string
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
}): JSX.Element {
  const [draft, setDraft] = useState(String(props.value))
  useEffect(() => setDraft(String(props.value)), [props.value])
  return (
    <label className="block">
      <span className="text-xs text-ink-muted">{props.label}</span>
      <input
        className="field-input mt-1 w-28"
        type="number"
        min={props.min}
        max={props.max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft)
          if (!Number.isFinite(n)) {
            setDraft(String(props.value))
            return
          }
          props.onCommit(Math.min(props.max, Math.max(props.min, Math.trunc(n))))
        }}
      />
    </label>
  )
}

function statusTone(status: QzoneStatusPayload | null): 'ok' | 'warn' | 'neutral' {
  if (!status?.connected) return 'neutral'
  if (status.caps.publish) return 'ok'
  return 'warn'
}

function postStatusLabel(post: QzonePostPayload): string {
  if (post.status === 'published') return t('settings.mobile.qzone.statusPublished')
  if (post.status === 'dry_run') return t('settings.mobile.qzone.statusDryRun')
  return t('settings.mobile.qzone.statusFailed')
}

export function QzoneSection(): JSX.Element {
  const [status, setStatus] = useState<QzoneStatusPayload | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [history, setHistory] = useState<QzonePostPayload[]>([])
  const [draft, setDraft] = useState('')
  const [draftMeta, setDraftMeta] = useState<{ style: string; mood: string; imagePath?: string | null } | null>(null)
  const [busy, setBusy] = useState('')
  const [hint, setHint] = useState('')
  const [hintTone, setHintTone] = useState<'ok' | 'warn' | 'neutral'>('neutral')

  const refresh = useCallback(async () => {
    try {
      const [s, cfg, rows] = await Promise.all([
        window.ackem.qzoneGetStatus(),
        window.ackem.getSettings(),
        window.ackem.qzoneHistory(10)
      ])
      setStatus(s)
      setSettings(cfg)
      setHistory(Array.isArray(rows) ? rows : [])
    } catch {
      /* 设置页可能在窗口初始化早期挂载，忽略一次性失败 */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = window.ackem.onQzoneStatusChanged?.((s) => setStatus(s))
    return () => unsub?.()
  }, [refresh])

  const savePatch = useCallback(async (patch: Partial<AppSettings>) => {
    try {
      const cur = await window.ackem.getSettings()
      const next = await window.ackem.setSettings({ ...cur, ...patch })
      setSettings(next)
      setStatus(await window.ackem.qzoneGetStatus())
    } catch (e) {
      setHintTone('warn')
      setHint(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const probe = async () => {
    setBusy('probe')
    setHint('')
    try {
      const caps = await window.ackem.qzoneProbe()
      if (caps.publish) {
        setHintTone('ok')
        setHint(t('settings.mobile.qzone.probeOk'))
      } else {
        setHintTone('warn')
        setHint(caps.error ?? t('settings.mobile.qzone.probeFail'))
      }
      setStatus(await window.ackem.qzoneGetStatus())
    } finally {
      setBusy('')
    }
  }

  const generate = async () => {
    setBusy('generate')
    setHint('')
    try {
      const res = await window.ackem.qzoneGenerateDraft()
      if (res.ok) {
        setDraft(res.draft.text)
        setDraftMeta({
          style: res.draft.style,
          mood: res.draft.mood,
          imagePath: res.draft.imagePath ?? null
        })
        setHintTone('neutral')
        setHint('')
      } else {
        setHintTone('warn')
        setHint(res.error)
      }
    } catch (e) {
      setHintTone('warn')
      setHint(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const publish = async () => {
    if (!draft.trim()) {
      setHintTone('warn')
      setHint(t('settings.mobile.qzone.emptyDraft'))
      return
    }
    setBusy('publish')
    setHint('')
    try {
      const res = await window.ackem.qzonePublish({ content: draft.trim() })
      if (res.ok) {
        setHintTone('ok')
        setHint(
          res.dryRun
            ? t('settings.mobile.qzone.dryRunDone')
            : t('settings.mobile.qzone.published')
        )
        setDraft('')
        setDraftMeta(null)
        await refresh()
      } else {
        setHintTone('warn')
        setHint(res.error ?? t('settings.mobile.qzone.publishFailed'))
        await refresh()
      }
    } catch (e) {
      setHintTone('warn')
      setHint(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const removePost = async (id: number) => {
    setBusy(`delete-${id}`)
    try {
      const res = await window.ackem.qzoneDelete(id)
      if (res.error) {
        setHintTone('warn')
        setHint(res.error)
      }
      await refresh()
    } finally {
      setBusy('')
    }
  }

  const interactNow = async () => {
    setBusy('interact')
    setHint('')
    try {
      const res = await window.ackem.qzoneInteractNow()
      if (res.error) {
        setHintTone('warn')
        setHint(res.error)
      } else {
        setHintTone('ok')
        setHint(
          t('settings.mobile.qzone.interactResult')
            .replace('{liked}', String(res.liked))
            .replace('{commented}', String(res.commented))
            .replace('{replied}', String(res.replied))
            .replace('{skipped}', String(res.skipped))
        )
      }
    } finally {
      setBusy('')
    }
  }

  const connected = status?.connected ?? false
  const caps = status?.caps
  const hintClass =
    hintTone === 'ok'
      ? 'settings-hint-ok'
      : hintTone === 'warn'
        ? 'settings-hint-warn'
        : 'text-xs text-ink-muted'
  const visibility: QzoneVisibilityPayload = status?.visibility ?? 'public'
  const style: QzoneStylePayload = status?.style ?? 'auto'

  return (
    <SettingsGroup
      id="settings-mobile-qzone"
      title={t('settings.mobile.qzone.title')}
      description={t('settings.mobile.qzone.desc')}
    >
      <SettingsBlock
        title={t('settings.mobile.qzone.statusTitle')}
        badge={
          <SettingsStatusBadge tone={statusTone(status)}>
            {!connected
              ? t('settings.mobile.qzone.needQq')
              : caps?.publish
                ? t('settings.mobile.qzone.ready')
                : t('settings.mobile.qzone.capsMissing')}
          </SettingsStatusBadge>
        }
      >
        <div className="space-y-2 text-xs text-ink-muted">
          <p>
            {t('settings.mobile.qzone.selfLabel')}：
            {status?.selfId
              ? status.nickname
                ? `${status.nickname}（${status.selfId}）`
                : status.selfId
              : t('settings.mobile.qzone.none')}
          </p>
          <p>
            {t('settings.mobile.qzone.todayCount')
              .replace('{n}', String(status?.dailyCount ?? 0))
              .replace('{limit}', status?.dailyLimit ? String(status.dailyLimit) : '∞')}
          </p>
          <p>
            {t('settings.mobile.qzone.lastPublished')}：{formatTime(status?.lastPublishedAt)}
          </p>
          <p>
            {t('settings.mobile.qzone.planned')}：{formatTime(status?.nextPublishAt)}
          </p>
          {status?.lastError ? <p className="settings-hint-warn">{status.lastError}</p> : null}
        </div>
      </SettingsBlock>

      <SettingsBlock title={t('settings.mobile.qzone.capsTitle')} hint={t('settings.mobile.qzone.capsHint')}>
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={!connected || busy === 'probe'}
          onClick={() => void probe()}
        >
          {busy === 'probe' ? t('settings.mobile.qzone.probing') : t('settings.mobile.qzone.probe')}
        </button>
        {caps?.probedAt ? (
          <ul className="mt-3 grid grid-cols-2 gap-1 text-xs text-ink-muted sm:grid-cols-3">
            <li>{`${caps.publish ? '✓' : '✗'} ${t('settings.mobile.qzone.capPublish')}`}</li>
            <li>{`${caps.list ? '✓' : '✗'} ${t('settings.mobile.qzone.capList')}`}</li>
            <li>{`${caps.feeds ? '✓' : '✗'} ${t('settings.mobile.qzone.capFeeds')}`}</li>
            <li>{`${caps.like ? '✓' : '✗'} ${t('settings.mobile.qzone.capLike')}`}</li>
            <li>{`${caps.comment ? '✓' : '✗'} ${t('settings.mobile.qzone.capComment')}`}</li>
            <li>{`${caps.delete ? '✓' : '✗'} ${t('settings.mobile.qzone.capDelete')}`}</li>
          </ul>
        ) : null}
      </SettingsBlock>

      <SettingsBlock title={t('settings.mobile.qzone.autoTitle')} hint={t('settings.mobile.qzone.autoHint')}>
        <SettingsToggleRow
          title={t('settings.mobile.qzone.autoToggle')}
          hint={t('settings.mobile.qzone.autoToggleHint')}
          checked={settings?.qzoneAutoEnabled ?? false}
          disabled={!connected}
          onChange={(v) => void savePatch({ qzoneAutoEnabled: v })}
        />
        <SettingsToggleRow
          title={t('settings.mobile.qzone.dryRun')}
          hint={t('settings.mobile.qzone.dryRunHint')}
          checked={settings?.qzoneDryRun !== false}
          onChange={(v) => void savePatch({ qzoneDryRun: v })}
        />

        <div className="mt-3 flex flex-wrap gap-4">
          <NumberField
            label={t('settings.mobile.qzone.dailyLimit')}
            value={settings?.qzoneDailyLimit ?? 2}
            min={0}
            max={12}
            onCommit={(n) => void savePatch({ qzoneDailyLimit: n })}
          />
          <NumberField
            label={t('settings.mobile.qzone.minInterval')}
            value={settings?.qzoneMinIntervalMinutes ?? 150}
            min={15}
            max={1440}
            onCommit={(n) => void savePatch({ qzoneMinIntervalMinutes: n })}
          />
          <NumberField
            label={t('settings.mobile.qzone.startHour')}
            value={settings?.qzoneActiveStartHour ?? 9}
            min={0}
            max={23}
            onCommit={(n) => void savePatch({ qzoneActiveStartHour: n })}
          />
          <NumberField
            label={t('settings.mobile.qzone.endHour')}
            value={settings?.qzoneActiveEndHour ?? 23}
            min={0}
            max={23}
            onCommit={(n) => void savePatch({ qzoneActiveEndHour: n })}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-4">
          <label className="block">
            <span className="text-xs text-ink-muted">{t('settings.mobile.qzone.visibility')}</span>
            <select
              className="field-input mt-1 w-40"
              value={visibility}
              onChange={(e) => void savePatch({ qzoneVisibility: e.target.value as QzoneVisibilityPayload })}
            >
              <option value="public">{t('settings.mobile.qzone.visibilityPublic')}</option>
              <option value="friends">{t('settings.mobile.qzone.visibilityFriends')}</option>
              <option value="private">{t('settings.mobile.qzone.visibilityPrivate')}</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-ink-muted">{t('settings.mobile.qzone.style')}</span>
            <select
              className="field-input mt-1 w-40"
              value={style}
              onChange={(e) => void savePatch({ qzoneStyle: e.target.value as QzoneStylePayload })}
            >
              <option value="auto">{t('settings.mobile.qzone.styleAuto')}</option>
              <option value="diary">{t('settings.mobile.qzone.styleDiary')}</option>
              <option value="musing">{t('settings.mobile.qzone.styleMusing')}</option>
              <option value="meme">{t('settings.mobile.qzone.styleMeme')}</option>
              <option value="night">{t('settings.mobile.qzone.styleNight')}</option>
            </select>
          </label>
        </div>

        <div className="mt-3">
          <SettingsToggleRow
            title={t('settings.mobile.qzone.withImage')}
            hint={t('settings.mobile.qzone.withImageHint').replace(
              '{n}',
              String(status?.memeCount ?? 0)
            )}
            checked={settings?.qzoneWithImage ?? false}
            onChange={(v) => void savePatch({ qzoneWithImage: v })}
          />
          <SettingsToggleRow
            title={t('settings.mobile.qzone.syncToChat')}
            hint={t('settings.mobile.qzone.syncToChatHint')}
            checked={settings?.qzoneSyncToChat ?? false}
            onChange={(v) => void savePatch({ qzoneSyncToChat: v })}
          />
        </div>
      </SettingsBlock>

      <SettingsBlock title={t('settings.mobile.qzone.manualTitle')} hint={t('settings.mobile.qzone.manualHint')}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={!connected || busy === 'generate'}
            onClick={() => void generate()}
          >
            {busy === 'generate'
              ? t('settings.mobile.qzone.generating')
              : t('settings.mobile.qzone.generate')}
          </button>
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={busy === 'publish' || !draft.trim()}
            onClick={() => void publish()}
          >
            {busy === 'publish'
              ? t('settings.mobile.qzone.publishing')
              : settings?.qzoneDryRun !== false
                ? t('settings.mobile.qzone.publishDryRun')
                : t('settings.mobile.qzone.publish')}
          </button>
        </div>

        <textarea
          className="field-input mt-3 min-h-[120px] w-full"
          value={draft}
          placeholder={t('settings.mobile.qzone.placeholder')}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <span>
            {t('settings.mobile.qzone.charCount')
              .replace('{n}', String(draft.length))
              .replace('{max}', '800')}
          </span>
          {draftMeta ? (
            <span>
              {t('settings.mobile.qzone.draftMeta')
                .replace('{style}', draftMeta.style)
                .replace('{mood}', draftMeta.mood)}
              {draftMeta.imagePath ? ` · ${t('settings.mobile.qzone.draftImage')}` : ''}
            </span>
          ) : null}
        </div>
        {hint ? <p className={`mt-2 ${hintClass}`}>{hint}</p> : null}
      </SettingsBlock>

      <SettingsBlock title={t('settings.mobile.qzone.interactTitle')} hint={t('settings.mobile.qzone.interactHint')}>
        <SettingsToggleRow
          title={t('settings.mobile.qzone.interactToggle')}
          hint={t('settings.mobile.qzone.interactToggleHint')}
          checked={settings?.qzoneInteractEnabled ?? false}
          disabled={!connected}
          onChange={(v) => void savePatch({ qzoneInteractEnabled: v })}
        />
        <div className="mt-3 flex flex-wrap gap-4">
          <NumberField
            label={t('settings.mobile.qzone.likeProb')}
            value={Math.round((settings?.qzoneLikeProb ?? 0.25) * 100)}
            min={0}
            max={100}
            onCommit={(n) => void savePatch({ qzoneLikeProb: n / 100 })}
          />
          <NumberField
            label={t('settings.mobile.qzone.commentProb')}
            value={Math.round((settings?.qzoneCommentProb ?? 0.05) * 100)}
            min={0}
            max={100}
            onCommit={(n) => void savePatch({ qzoneCommentProb: n / 100 })}
          />
        </div>
        <button
          type="button"
          className="btn-secondary mt-3 text-sm"
          disabled={!connected || busy === 'interact'}
          onClick={() => void interactNow()}
        >
          {busy === 'interact'
            ? t('settings.mobile.qzone.interacting')
            : t('settings.mobile.qzone.interactNow')}
        </button>
      </SettingsBlock>

      <SettingsBlock title={t('settings.mobile.qzone.historyTitle')} hint={t('settings.mobile.qzone.historyHint')}>
        {history.length === 0 ? (
          <p className="text-xs text-ink-muted">{t('settings.mobile.qzone.historyEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {history.map((post) => (
              <li key={post.id} className="rounded-lg border border-white/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                  <span className="flex items-center gap-2">
                    <SettingsStatusBadge
                      tone={
                        post.status === 'published' ? 'ok' : post.status === 'failed' ? 'warn' : 'neutral'
                      }
                    >
                      {postStatusLabel(post)}
                    </SettingsStatusBadge>
                    <span>{formatTime(post.createdAt)}</span>
                    <span>{post.source === 'auto' ? t('settings.mobile.qzone.sourceAuto') : t('settings.mobile.qzone.sourceManual')}</span>
                    {post.imageCount > 0 ? <span>+{post.imageCount} 🖼</span> : null}
                  </span>
                  <button
                    type="button"
                    className="text-xs underline decoration-dotted"
                    disabled={busy === `delete-${post.id}`}
                    onClick={() => void removePost(post.id)}
                  >
                    {t('settings.mobile.qzone.delete')}
                  </button>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                  {post.content.length > 120 ? `${post.content.slice(0, 120)}…` : post.content}
                </p>
                {post.error ? <p className="mt-1 settings-hint-warn">{post.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsBlock>
    </SettingsGroup>
  )
}
