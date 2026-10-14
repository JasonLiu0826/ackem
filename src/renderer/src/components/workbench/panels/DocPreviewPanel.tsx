import { MarkdownContent } from '../../MarkdownContent'
import { selectedTaskOf, useWorkbenchStore } from '../../../store/workbenchStore'
import { cx } from '../ui/cx'

export function DocPreviewPanel(): JSX.Element {
  const pane = useWorkbenchStore((s) => selectedTaskOf(s)?.pane)
  if (!pane) return <div className="wb-panel" />
  const crumbs = pane.docPath.split(/[/\\]/).filter(Boolean)

  return (
    <div className="wb-panel">
      <div className="wb-panel-head">
        <span className="wb-ellipsis">{crumbs.join(' > ') || '未打开文档'}</span>
        <span className="wb-seg-row">
          <button
            type="button"
            className={cx('wb-seg', pane.docMode === 'preview' && 'is-on')}
            onClick={() => useWorkbenchStore.getState().setDocMode('preview')}
          >
            Preview
          </button>
          <button
            type="button"
            className={cx('wb-seg', pane.docMode === 'source' && 'is-on')}
            onClick={() => useWorkbenchStore.getState().setDocMode('source')}
          >
            Source
          </button>
        </span>
      </div>
      <div className="wb-panel-body wb-scroll">
        {pane.docPath ? (
          pane.docMode === 'preview' ? (
            <MarkdownContent source={pane.docSource} className="wb-doc-md" />
          ) : (
            <pre className="wb-doc-src">{pane.docSource}</pre>
          )
        ) : (
          <p className="wb-muted">这条任务还没有打开文档。点中间的 md 文件名会进这里。</p>
        )}
      </div>
    </div>
  )
}
