import { selectedTaskOf, useWorkbenchStore } from '../../../store/workbenchStore'
import { IconBack, IconForward, IconRefresh } from '../icons'

const FRAME_BLOCKED =
  /(^|\.)(github\.com|google\.com|googleusercontent\.com|x\.com|twitter\.com|facebook\.com|notion\.so|linkedin\.com|instagram\.com)$/i

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function embedBlocked(url: string): boolean {
  return FRAME_BLOCKED.test(hostOf(url))
}

function openExternal(url: string): void {
  try {
    window.open(url, '_blank', 'noopener')
  } catch {
    /* ignore */
  }
}

export function BrowserPanel(): JSX.Element {
  const pane = useWorkbenchStore((s) => selectedTaskOf(s)?.pane)
  if (!pane) return <div className="wb-panel" />
  const canBack = pane.browserIndex > 0
  const canForward = pane.browserIndex < pane.browserHistory.length - 1
  const blocked = !!pane.browserUrl && embedBlocked(pane.browserUrl)

  return (
    <div className="wb-panel">
      <div className="wb-addr">
        <button
          type="button"
          className="wb-icon-btn"
          title="后退"
          disabled={!canBack}
          onClick={() => useWorkbenchStore.getState().browserBack()}
        >
          <IconBack />
        </button>
        <button
          type="button"
          className="wb-icon-btn"
          title="前进"
          disabled={!canForward}
          onClick={() => useWorkbenchStore.getState().browserForward()}
        >
          <IconForward />
        </button>
        <button
          type="button"
          className="wb-icon-btn"
          title="刷新"
          onClick={() => {
            const url = selectedTaskOf(useWorkbenchStore.getState())?.pane.browserUrl
            if (url) useWorkbenchStore.getState().goBrowser(url)
          }}
        >
          <IconRefresh />
        </button>
        <input
          value={pane.browserInput}
          placeholder="搜索或输入网址"
          onChange={(e) => useWorkbenchStore.getState().setBrowserInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') useWorkbenchStore.getState().goBrowser()
          }}
        />
        <button type="button" className="wb-btn" onClick={() => useWorkbenchStore.getState().goBrowser()}>
          打开
        </button>
        {pane.browserUrl ? (
          <button type="button" className="wb-btn" title="在系统浏览器打开" onClick={() => openExternal(pane.browserUrl)}>
            外开
          </button>
        ) : null}
      </div>
      {pane.browserUrl && !blocked ? <iframe className="wb-iframe" title="browser" src={pane.browserUrl} /> : null}
      {pane.browserUrl && blocked ? (
        <div className="wb-panel-body wb-scroll">
          <div className="wb-browser-fallback">
            <h3>{hostOf(pane.browserUrl) || pane.browserUrl}</h3>
            <p>这页不允许嵌进本栏。点外开到系统浏览器，或从最近换一页。</p>
            <div className="wb-actions">
              <button type="button" className="wb-btn primary" onClick={() => openExternal(pane.browserUrl)}>
                在系统浏览器打开
              </button>
              <button
                type="button"
                className="wb-btn"
                onClick={() => useWorkbenchStore.getState().goBrowser('')}
              >
                回到最近
              </button>
            </div>
          </div>
          {pane.browserRecents.length > 0 ? (
            <>
              <div className="wb-section-label">最近</div>
              {pane.browserRecents.map((r) => (
                <button
                  key={r.url}
                  type="button"
                  className="wb-file-item"
                  onClick={() => useWorkbenchStore.getState().goBrowser(r.url)}
                >
                  <span>
                    <span className="wb-row-title">{r.title}</span>
                    <span className="wb-row-sub wb-block">
                      {r.url}
                    </span>
                  </span>
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
      {!pane.browserUrl ? (
        <div className="wb-panel-body wb-scroll">
          <form
            className="wb-browser-hero"
            onSubmit={(e) => {
              e.preventDefault()
              useWorkbenchStore.getState().goBrowser()
            }}
          >
            <h3>在栏里打开一页</h3>
            <input
              value={pane.browserInput}
              placeholder="搜索或输入网址"
              onChange={(e) => useWorkbenchStore.getState().setBrowserInput(e.target.value)}
            />
          </form>
          <div className="wb-section-label">最近</div>
          {pane.browserRecents.map((r) => (
            <button key={r.url} type="button" className="wb-file-item" onClick={() => useWorkbenchStore.getState().goBrowser(r.url)}>
              <span>
                <span className="wb-row-title">{r.title}</span>
                <span className="wb-row-sub wb-block">
                  {r.url}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
