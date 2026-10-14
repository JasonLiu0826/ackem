type Props = {
  open: boolean
  askMessage: string
  kind: string
  cwd?: string
  candidates?: Array<{ id: string; name: string }>
  onAccept: (opts: { cwd?: string; extensionId?: string }) => void
  onReject: () => void
}

import { useEffect, useState } from 'react'

export function ChannelConfirmCard({
  open,
  askMessage,
  kind,
  cwd,
  candidates,
  onAccept,
  onReject
}: Props): JSX.Element | null {
  const [picked, setPicked] = useState(candidates?.[0]?.id ?? '')
  const [dir, setDir] = useState(cwd ?? '')

  useEffect(() => {
    if (open) {
      setPicked(candidates?.[0]?.id ?? '')
      if (cwd) {
        setDir(cwd)
      } else {
        // 默认工作目录: 用户桌面 (非程序员的"我的文件"概念)
        window.ackem.defaultCwd().then((p) => { setDir((cur) => cur || p) }).catch(() => {})
      }
    }
  }, [open, candidates, cwd])

  const browse = async () => {
    try {
      const r = await window.ackem.selectFolder()
      if (r?.path) setDir(r.path)
    } catch { /* user cancelled */ }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" role="dialog">
      <div className="glass-panel mx-4 w-full max-w-md rounded-2xl p-6 shadow-xl">
        <h3 className="mb-2 text-base font-semibold text-ink">确认 · {kind}</h3>
        <p className="mb-4 text-sm leading-relaxed text-ink-muted">{askMessage}</p>
        {kind === 'work_job' && (
          <div className="mb-4 flex items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-surface-inset bg-transparent px-3 py-2 text-sm"
              placeholder="工作目录"
              value={dir}
              onChange={(e) => setDir(e.target.value)}
            />
            <button
              type="button"
              className="shrink-0 rounded-lg border border-surface-inset px-3 py-2 text-sm text-ink-muted hover:text-ink"
              onClick={() => void browse()}
            >
              浏览
            </button>
          </div>
        )}
        {kind === 'plugin_ask' && candidates && (
          <select
            className="mb-4 w-full rounded-lg border border-surface-inset bg-transparent px-3 py-2 text-sm"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-1.5 text-sm text-ink-muted" onClick={onReject}>
            取消
          </button>
          <button
            type="button"
            className="rounded-lg bg-ink px-3 py-1.5 text-sm text-white"
            onClick={() => onAccept({ cwd: dir || undefined, extensionId: picked || undefined })}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
