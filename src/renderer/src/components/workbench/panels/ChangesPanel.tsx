import { useMemo, useState } from 'react'
import { parseUnifiedDiff, type DiffRow } from '../../../lib/unifiedDiff'
import { lastChangedFiles, selectedTaskOf, useWorkbenchStore } from '../../../store/workbenchStore'
import { cx } from '../ui/cx'

export function ChangesPanel(): JSX.Element {
  const task = useWorkbenchStore((s) => selectedTaskOf(s))
  const files = task ? lastChangedFiles(task) : undefined
  const filePath = task?.pane.changeFilePath ?? ''

  if (!files) {
    return (
      <div className="wb-panel">
        <div className="wb-panel-head">还没有收到文件改动事件</div>
        <div className="wb-panel-body wb-scroll wb-muted">
          AckemCode 的写入工具完成后，这里会显示实际文件及工作区差异。
        </div>
      </div>
    )
  }

  const active = files.files.find((f) => f.path === filePath) ?? files.files[0]

  return (
    <div className="wb-panel">
      <div className="wb-panel-head">
        工作区差异 <span className="wb-plus">+{files.added}</span> <span className="wb-minus">-{files.removed}</span>
      </div>
      {files.files.length > 1 ? (
        <div className="wb-file-switch">
          {files.files.map((f) => (
            <button
              key={f.path}
              type="button"
              className={cx('wb-seg', f.path === active.path && 'is-on')}
              onClick={() => useWorkbenchStore.getState().openChange(f.path)}
            >
              {f.path.split(/[/\\]/).pop()}
            </button>
          ))}
        </div>
      ) : null}
      <div className="wb-panel-body wb-scroll wb-flush">
        <div className="wb-files-meta wb-pad">
          {active.path}
        </div>
        <UnifiedDiffView diff={active.diff} />
      </div>
    </div>
  )
}

function UnifiedDiffView(props: { diff: string }): JSX.Element {
  const rows = useMemo(() => parseUnifiedDiff(props.diff), [props.diff])
  const [open, setOpen] = useState<Record<number, boolean>>({})

  return (
    <div className="wb-diff">
      {rows.map((row, i) => (
        <DiffLine
          key={i}
          row={row}
          expanded={!!open[i]}
          onToggle={() => setOpen((s) => ({ ...s, [i]: !s[i] }))}
        />
      ))}
    </div>
  )
}

function DiffLine(props: { row: DiffRow; expanded: boolean; onToggle: () => void }): JSX.Element {
  const { row } = props
  if (row.kind === 'hunk') {
    return <div className="wb-diff-line hunk">{row.text}</div>
  }
  if (row.kind === 'skip') {
    return (
      <button type="button" className="wb-diff-skip" onClick={props.onToggle}>
        {row.count} 行未改{props.expanded ? ' · 正文不在这份 diff 里' : ''}
      </button>
    )
  }
  const cls = row.kind === 'add' ? 'add' : row.kind === 'del' ? 'del' : 'ctx'
  const mark = row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ' '
  return (
    <div className={`wb-diff-line ${cls}`}>
      <span className="wb-diff-no">{row.oldNo ?? ''}</span>
      <span className="wb-diff-no">{row.newNo ?? ''}</span>
      <span className="wb-diff-mark">{mark}</span>
      <span className="wb-diff-text">{row.text || ' '}</span>
    </div>
  )
}
