import { useCallback, useEffect, useRef, useState } from 'react'
import { selectedTaskOf, useWorkbenchStore, type RailTab } from '../../store/workbenchStore'
import { IconDiff, IconDoc, IconExpand, IconFiles, IconGlobe, IconPlus } from './icons'
import { BrowserPanel } from './panels/BrowserPanel'
import { ChangesPanel } from './panels/ChangesPanel'
import { DocPreviewPanel } from './panels/DocPreviewPanel'
import { FilesPanel } from './panels/FilesPanel'
import { cx } from './ui/cx'
import { useDismiss } from './ui/useDismiss'
import { WbMenu } from './ui/WbMenu'

const ICONS: { id: RailTab; label: string; icon: JSX.Element }[] = [
  { id: 'changes', label: '改动', icon: <IconDiff /> },
  { id: 'browser', label: '浏览器', icon: <IconGlobe /> },
  { id: 'files', label: '文件', icon: <IconFiles /> }
]

const LABELS: Record<RailTab, string> = {
  changes: '改动',
  browser: '浏览器',
  terminal: '终端',
  files: '文件',
  doc: '文档'
}

export function RightRail(): JSX.Element {
  const selectedTaskId = useWorkbenchStore((s) => s.selectedTaskId)
  const pane = useWorkbenchStore((s) => selectedTaskOf(s)?.pane)
  const width = useWorkbenchStore((s) => s.railWidth)
  const onLabel = useWorkbenchStore((s) => {
    const task = selectedTaskOf(s)
    if (task?.pinned) return 'Ackem'
    return s.workspaces.find((w) => w.id === task?.workspaceId)?.name || '独立'
  })
  const changeCount = useWorkbenchStore((s) => {
    const task = selectedTaskOf(s)
    return [...(task?.turns ?? [])].reverse().find((t) => t.filesChanged)?.filesChanged?.count ?? 0
  })
  const [plus, setPlus] = useState(false)
  const plusRef = useRef<HTMLDivElement>(null)
  const closePlus = useCallback(() => setPlus(false), [])
  useDismiss(plus, closePlus, plusRef)
  // Old persisted terminal tabs must not remount an embedded CLI on upgrade.
  const tabs = (pane?.railTabs ?? ['changes']).filter(id => id !== 'terminal')
  const tab = pane?.railTab === 'terminal' ? tabs[tabs.length - 1] ?? 'changes' : pane?.railTab ?? 'changes'
  const open = (pane?.railOpen ?? false) && tabs.length > 0
  useEffect(() => {
    setPlus(false)
  }, [selectedTaskId])

  return (
    <aside className="wb-rail" style={open ? { width: width + 52 } : { width: 52 }} data-task={selectedTaskId || ''}>
      {open ? (
        <>
          <div
            className="wb-resize"
            onMouseDown={(e) => {
              const startX = e.clientX
              const startW = width
              const move = (ev: MouseEvent) => {
                useWorkbenchStore.getState().setRailWidth(startW + (startX - ev.clientX))
              }
              const up = () => {
                window.removeEventListener('mousemove', move)
                window.removeEventListener('mouseup', up)
              }
              window.addEventListener('mousemove', move)
              window.addEventListener('mouseup', up)
            }}
          />
          <div className="wb-rail-panel">
            <div className="wb-rail-tabs">
              {tabs.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={cx('wb-rail-tab', tab === id && 'is-on')}
                  onClick={() => useWorkbenchStore.getState().openRail(id)}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault()
                      useWorkbenchStore.getState().closeRailTab(id)
                    }
                  }}
                >
                  {LABELS[id]}
                  <span
                    className="wb-tab-x"
                    title="关掉这个标签"
                    onClick={(e) => {
                      e.stopPropagation()
                      useWorkbenchStore.getState().closeRailTab(id)
                    }}
                  >
                    ×
                  </span>
                </button>
              ))}
              <div ref={plusRef} className="wb-rail-plus">
                <button type="button" className="wb-icon-btn" title="再开一个" onClick={() => setPlus((v) => !v)}>
                  <IconPlus width={14} height={14} />
                </button>
                {plus ? (
                  <WbMenu at="plus" onClose={() => setPlus(false)}>
                    {[...ICONS, { id: 'doc' as const, label: '文档', icon: <IconDoc /> }].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          useWorkbenchStore.getState().openRail(item.id)
                          setPlus(false)
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </WbMenu>
                ) : null}
              </div>
              <div className="wb-bar-spacer" />
              <button
                type="button"
                className="wb-icon-btn"
                title="加宽"
                onClick={() => useWorkbenchStore.getState().setRailWidth(640)}
              >
                <IconExpand width={14} height={14} />
              </button>
              <button
                type="button"
                className="wb-icon-btn"
                title="收回"
                onClick={() => {
                  setPlus(false)
                  useWorkbenchStore.getState().closeRail()
                }}
              >
                ×
              </button>
            </div>
            {tab === 'changes' ? <ChangesPanel key={selectedTaskId} /> : null}
            {tab === 'browser' ? <BrowserPanel key={selectedTaskId} /> : null}
            {tab === 'files' ? <FilesPanel key={selectedTaskId} /> : null}
            {tab === 'doc' ? <DocPreviewPanel key={selectedTaskId} /> : null}
          </div>
        </>
      ) : null}
      <div className="wb-rail-strip">
        <div className="wb-rail-on">
          当前
          <b title={onLabel}>{onLabel}</b>
        </div>
        <div className="wb-rail-icons">
          {ICONS.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.label}
              className={cx('wb-rail-icon', open && tab === item.id && 'is-on')}
              onClick={() => {
                if (open && tab === item.id) useWorkbenchStore.getState().closeRail()
                else useWorkbenchStore.getState().openRail(item.id)
              }}
            >
              {item.icon}
              {item.id === 'changes' && changeCount > 0 ? <span className="wb-badge">{changeCount}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
