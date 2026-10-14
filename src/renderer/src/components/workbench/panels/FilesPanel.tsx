import { useMemo, useRef, useState } from 'react'
import { fileRecentsForTask, selectedTaskOf, useWorkbenchStore } from '../../../store/workbenchStore'
import { WbModal } from '../ui/WbModal'

export function FilesPanel(): JSX.Element {
  const task = useWorkbenchStore((s) => selectedTaskOf(s))
  const recents = useWorkbenchStore((s) => {
    const current = selectedTaskOf(s)
    if (!current) return []
    return fileRecentsForTask(current, s.workspaces)
  })
  const q = task?.pane.fileQuery ?? ''
  const cwd = useWorkbenchStore((s) => {
    const current = selectedTaskOf(s)
    if (current?.cwd) return current.cwd
    return s.workspaces.find((w) => w.id === current?.workspaceId)?.folderPath || ''
  })
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('untitled.md')
  const browseRef = useRef<HTMLInputElement>(null)
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return recents
    return recents.filter((f) => f.name.toLowerCase().includes(n) || f.folder.toLowerCase().includes(n))
  }, [q, recents])

  if (!task) return <div className="wb-panel" />

  return (
    <div className="wb-panel">
      <div className="wb-addr">
        <input
          value={q}
          placeholder="文件、文件夹…"
          onChange={(e) => useWorkbenchStore.getState().setFileQuery(e.target.value)}
        />
      </div>
      <div className="wb-panel-body wb-scroll">
        <div className="wb-actions wb-pad-b">
          <button type="button" className="wb-btn" onClick={() => browseRef.current?.click()}>
            浏览
          </button>
          <button type="button" className="wb-btn" onClick={() => setNewOpen(true)}>
            新建
          </button>
        </div>
        <div className="wb-section-label">最近 · {task.pinned ? 'Ackem' : cwd ? folderTail(cwd) : '独立'}</div>
        {filtered.map((f) => (
          <button
            key={f.path}
            type="button"
            className="wb-file-item"
            onClick={() => useWorkbenchStore.getState().openFileRecent(f.path)}
          >
            <span className="wb-row-title">{f.name}</span>
            <span className="wb-row-time">{f.folder}</span>
          </button>
        ))}
        {filtered.length === 0 ? <p className="wb-muted">这个任务 / 工作区还没有最近文件。</p> : null}
      </div>
      <input
        ref={browseRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          useWorkbenchStore.getState().browseFiles(Array.from(e.target.files ?? []))
          e.currentTarget.value = ''
        }}
      />
      {newOpen ? (
        <WbModal
          title="新建文件"
          hint={cwd ? `会在 ${cwd} 创建一个空文件。` : '请先为任务选择本机工作区。'}
          onClose={() => setNewOpen(false)}
          footer={
            <>
              <button type="button" className="wb-btn" onClick={() => setNewOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="wb-btn primary"
                onClick={() => {
                  useWorkbenchStore.getState().newFile(newName.trim() || 'untitled.md', cwd)
                  setNewOpen(false)
                }}
              >
                创建
              </button>
            </>
          }
        >
          <div className="wb-field">
            <label>文件名</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
        </WbModal>
      ) : null}
    </div>
  )
}

function folderTail(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path
}
