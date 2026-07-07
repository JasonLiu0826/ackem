import { useCallback, useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import { useAppStore } from '../store/appStore'

type ArchiveFile = { path: string; name: string; isDir: boolean; size: number }

const DOMAIN_LABELS: Record<string, string> = {
  IDENTITY: '鑷垜涓庤韩浠?, SOCIAL: '鍏崇郴涓庣ぞ浜?, DAILY_LIFE: '鏃ュ父鐢熸椿',
  PURSUITS: '浜嬩笟涓庢垚闀?, INNER_WORLD: '鍐呭績涓栫晫', TEMPORAL: '褰撲笅涓庢湭鏉?
}

export function ArchivePage(): JSX.Element {
  const pushToast = useAppStore((s) => s.pushToast)
  const [files, setFiles] = useState<ArchiveFile[]>([])
  const [domains, setDomains] = useState<string[]>([])
  const [lastExportAt, setLastExportAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [exporting, setExporting] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.Ackem.archiveList()
      setFiles(r.files)
      setDomains(r.domains)
      setLastExportAt(r.lastExportAt)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadList() }, [loadList])

  useEffect(() => {
    const off = window.Ackem.onMemoryUpdated?.(() => {
      void loadList()
      if (selectedFile) {
        void window.Ackem.archiveRead(selectedFile).then((r) => {
          if (r.ok && r.text) setContent(r.text)
        })
      }
    })
    return () => off?.()
  }, [loadList, selectedFile])

  const openFile = async (path: string) => {
    setSelectedFile(path)
    const r = await window.Ackem.archiveRead(path)
    if (r.ok && r.text) setContent(r.text)
    else setContent(r.error ?? '璇诲彇澶辫触')
  }

  const toggleDomain = (d: string) => {
    const next = new Set(expanded)
    if (next.has(d)) next.delete(d)
    else next.add(d)
    setExpanded(next)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const r = await window.Ackem.archiveExport()
      pushToast(`瀵煎嚭瀹屾垚锛?{r.factsExported} 鏉′簨瀹炪€?{r.episodesExported} 娈垫儏鑺傘€?{r.coreCount} 鏉℃牳蹇冭蹇哷)
      await loadList()
    } catch (e) {
      pushToast(e instanceof Error ? e.message : String(e))
    } finally { setExporting(false) }
  }

  const rootFiles = files.filter(f => !f.isDir)
  const domainFiles = (d: string) => files.filter(f => !f.isDir && f.path.startsWith(d + '/'))

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-surface-inset bg-surface-raised px-6 py-4">
        <div>
          <h1 className="text-base font-semibold text-ink">璁板繂妗ｆ</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {domains.length > 0
              ? `${domains.length} 涓鍩?路 ${files.filter(f => !f.isDir).length} 涓枃浠?路 浜虹被鍙`
              : '鏆傛棤璁板綍 鈥?鐐瑰嚮銆岀珛鍗冲鍑恒€嶆墜鍔ㄧ敓鎴?}
            <span className="mx-1.5 text-surface-inset">|</span>
            <span className="text-accent">
              姣?10 杞璇濊嚜鍔ㄦ洿鏂板叏閮ㄥ唴瀹?
            </span>
            {lastExportAt && (
              <>
                <span className="mx-1.5 text-surface-inset">|</span>
                涓婃瀵煎嚭锛歿formatRelative(lastExportAt)}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadList()}
            className="field-btn-secondary rounded-lg px-3 py-1.5 text-xs"
          >鍒锋柊</button>
          <button type="button" onClick={() => { setExpanded(new Set(domains)); setSelectedFile(null) }}
            className="field-btn-secondary rounded-lg px-3 py-1.5 text-xs"
          >鍏ㄩ儴灞曞紑</button>
          <button type="button" onClick={() => setExpanded(new Set())}
            className="field-btn-secondary rounded-lg px-3 py-1.5 text-xs"
          >鍏ㄩ儴鏀惰捣</button>
          <button type="button" onClick={() => void handleExport()} disabled={exporting}
            className="field-btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50"
          >{exporting ? '瀵煎嚭涓?..' : '绔嬪嵆瀵煎嚭'}</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 鏂囦欢鏍?*/}
        <div className="w-64 shrink-0 overflow-y-auto border-r border-surface-inset bg-surface-raised">
          {loading ? (
            <div className="p-4 text-sm text-ink-muted">{t("settings.loading")}</div>
          ) : (
            <div className="py-1">
              {/* 鏍圭洰褰曟枃浠讹紙README銆佹儏鑺傛椂闂寸嚎銆佹牳蹇冭蹇嗙簿閫夛級 */}
              {rootFiles.map(f => (
                <button key={f.path}
                  onClick={() => void openFile(f.path)}
                  className={`block w-full truncate px-4 py-2 text-left text-sm transition-colors ${
                    selectedFile === f.path ? 'bg-accent/10 text-accent font-medium' : 'text-ink hover:bg-surface'
                  }`}
                >
                  {f.name.replace('.md', '')}
                </button>
              ))}

              {rootFiles.length > 0 && domains.length > 0 && (
                <div className="mx-3 my-2 border-t border-surface-inset" />
              )}

              {/* 棰嗗煙鐩綍 */}
              {domains.map(d => {
                const isOpen = expanded.has(d)
                const subFiles = domainFiles(d)
                const cnLabel = DOMAIN_LABELS[d] || d
                return (
                  <div key={d}>
                    <button onClick={() => toggleDomain(d)}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-ink hover:bg-surface transition-colors"
                    >
                      <span className="text-[10px] w-3 text-center text-ink-muted">
                        {isOpen ? '鈻? : '鈻?}
                      </span>
                      <span>{cnLabel}</span>
                      <span className="text-[11px] text-ink-muted ml-auto">{subFiles.length}</span>
                    </button>
                    {isOpen && subFiles.map(f => (
                      <button key={f.path}
                        onClick={() => void openFile(f.path)}
                        className={`block w-full truncate py-1.5 pl-10 pr-4 text-left text-sm transition-colors ${
                          selectedFile === f.path ? 'bg-accent/10 text-accent font-medium' : 'text-ink-muted hover:bg-surface hover:text-ink'
                        }`}
                      >
                        {f.name.replace('.md', '')}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 鏂囦欢鍐呭 */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {!selectedFile ? (
            <div className="flex h-full items-center justify-center text-sm text-ink-muted">
              閫夋嫨涓€涓枃浠堕瑙?路 鐐瑰嚮銆岀珛鍗冲鍑恒€嶅埛鏂版。妗?
            </div>
          ) : !content ? (
            <div className="p-6 text-sm text-ink-muted">{t("settings.loading")}</div>
          ) : (
            <div className="p-6 max-w-3xl">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-xs text-ink-muted font-mono">{selectedFile}</div>
                <button onClick={() => void window.Ackem.openDataFolder()}
                  className="rounded-lg border border-surface-inset px-2 py-1 text-[11px] text-ink-muted hover:text-ink"
                >鎵撳紑鐩綍</button>
              </div>
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (target.tagName === 'A') {
                    e.preventDefault()
                    const href = target.getAttribute('href')
                    if (href) {
                      const domain = href.split('/')[0]
                      setExpanded(prev => new Set([...prev, domain]))
                      openFile(href)
                    }
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '鍒氬垰'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 鍒嗛挓鍓峘
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 灏忔椂鍓峘
  const d = Math.floor(hr / 24)
  return `${d} 澶╁墠`
}

function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-ink mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold text-ink mt-6 mb-3 border-b pb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-ink mt-6 mb-4">$1</h1>')
    .replace(/^> (.+)$/gm, '<blockquote class="text-xs text-ink-muted border-l-2 border-surface-inset pl-3 my-2">$1</blockquote>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-surface-raised px-1 rounded text-xs">$1</code>')
    .replace(/^---$/gm, '<hr class="my-4 border-surface-inset" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="text-accent underline cursor-pointer" href="$2">$1</a>')
    .replace(/^- (.+)$/gm, '<li class="text-sm text-ink ml-4">$1</li>')
    .replace(/\n\n/g, '</p><p class="text-sm text-ink leading-relaxed my-2">')
    .replace(/^/, '<p class="text-sm text-ink leading-relaxed my-2">')
    .replace(/$/, '</p>')
    .replace(/<p[^>]*><\/p>/g, '')
}
