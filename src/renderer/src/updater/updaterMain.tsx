import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { UpdateJob, UpdateProgressEvent } from '../../../shared/updateTypes'
import '../assets/main.css'
import './updater.css'

declare global {
  interface Window {
    ackemUpdater: {
      readJob: () => Promise<UpdateJob>
      start: () => Promise<{ ok: boolean }>
      launchAckem: () => Promise<void>
      openRelease: () => Promise<void>
      quit: () => Promise<void>
      onProgress: (fn: (ev: UpdateProgressEvent) => void) => () => void
    }
  }
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function formatSpeed(bps: number): string {
  if (bps <= 0) return '—'
  return `${formatBytes(bps)}/s`
}

function channelLabel(ch: UpdateJob['channel']): string {
  return ch === 'github' ? 'GitHub Releases' : 'Gitee Releases'
}

function App(): JSX.Element {
  const [job, setJob] = useState<UpdateJob | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [phase, setPhase] = useState<UpdateProgressEvent['phase']>('download')
  const [percent, setPercent] = useState(0)
  const [downloaded, setDownloaded] = useState(0)
  const [total, setTotal] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  const appendLog = (line: string) => {
    const ts = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev, `[${ts}] ${line}`])
  }

  useEffect(() => {
    void window.ackemUpdater.readJob().then(setJob)
    const off = window.ackemUpdater.onProgress((ev) => {
      setPhase(ev.phase)
      if (ev.message) appendLog(ev.message)
      if (ev.percent != null) setPercent(ev.percent)
      if (ev.downloadedBytes != null) setDownloaded(ev.downloadedBytes)
      if (ev.totalBytes != null) setTotal(ev.totalBytes)
      if (ev.speedBps != null) setSpeed(ev.speedBps)
      if (ev.phase === 'error') setError(ev.message)
    })
    return off
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [logs])

  useEffect(() => {
    if (!job || started.current) return
    started.current = true
    appendLog(`Ackem updater ready — ${channelLabel(job.channel)}`)
    appendLog(`Target: ${job.currentVersion} → ${job.targetVersion}`)
    void window.ackemUpdater.start().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setPhase('error')
      appendLog(`ERROR: ${msg}`)
    })
  }, [job])

  const phaseLabel = useMemo(() => {
    switch (phase) {
      case 'download':
        return 'Downloading'
      case 'verify':
        return 'Verifying'
      case 'extract':
        return 'Extracting'
      case 'install':
        return 'Installing'
      case 'done':
        return 'Complete'
      case 'error':
        return 'Failed'
      default:
        return 'Working'
    }
  }, [phase])

  if (!job) {
    return (
      <div className="updater-shell">
        <p className="updater-muted">Loading update job…</p>
      </div>
    )
  }

  return (
    <div className="updater-shell">
      <header className="updater-head">
        <h1>Ackem Update</h1>
        <p>
          {channelLabel(job.channel)} · {job.currentVersion} → {job.targetVersion}
          {job.expectedSize > 0 ? ` · ~${formatBytes(job.expectedSize)}` : ''}
        </p>
      </header>

      <div className="updater-progress-wrap">
        <div className="updater-progress-meta">
          <span>{phaseLabel}</span>
          <span>
            {phase === 'download' && total > 0
              ? `${formatBytes(downloaded)} / ${formatBytes(total)} · ${formatSpeed(speed)}`
              : `${Math.round(percent)}%`}
          </span>
        </div>
        <div className="updater-progress-bar">
          <div className="updater-progress-fill" style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
      </div>

      <div className="updater-log" ref={logRef}>
        {logs.map((line, i) => (
          <div key={i} className="updater-log-line">
            {line}
          </div>
        ))}
      </div>

      {phase === 'done' && (
        <div className="updater-done">
          <p>✓ Download complete</p>
          <p>✓ Verification passed</p>
          <p>✓ Program updated (your data/ folder was not modified)</p>
          <p className="updater-done-hint">You can restart Ackem now.</p>
          <div className="updater-actions">
            <button type="button" className="updater-btn primary" onClick={() => void window.ackemUpdater.launchAckem()}>
              Launch Ackem
            </button>
            <button type="button" className="updater-btn" onClick={() => void window.ackemUpdater.quit()}>
              Later
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="updater-error">
          <p>{error ?? 'Update failed'}</p>
          <div className="updater-actions">
            <button type="button" className="updater-btn" onClick={() => void window.ackemUpdater.openRelease()}>
              Open release page
            </button>
            <button type="button" className="updater-btn" onClick={() => void window.ackemUpdater.quit()}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
