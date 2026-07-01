import { useCallback, useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import { useAppStore } from '../store/appStore'

type ArchiveFile = { path: string; name: string; isDir: boolean; size: number }

const DOMAIN_LABELS: Record<string, string> = {
  IDENTITY: '自我与身份', SOCIAL: '关系与社交', DAILY_LIFE: '日常生活',
  PURSUITS: '事业与成长', INNER_WORLD: '内心世界', TEMPORAL: '当下与未来'
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
      const r = await window.ackem.archiveList()
      setFiles(r.files)
      setDomains(r.domains)
      setLastExportAt(r.lastExportAt)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadList() }, [loadList])

  useEffect(() => {
    const off = window.ackem.onMemoryUpdated?.(() => {
      void loadList()
      if (selectedFile) {
        void window.ackem.archiveRead(selectedFile).then((r) => {
          if (r.ok && r.text) setContent(r.text)
        })
      }
    })
    return () => off?.()
  }, [loadList, selectedFile])

  const openFile = async (path: string) => {
    setSelectedFile(path)
    const r = await window.ackem.archiveRead(path)
    if (r.ok && r.text) setContent(r.text)
    else setContent(r.error ?? '读取失败')
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
      const r = await window.ackem.archiveExport()
      pushToast(`导出完成：${r.factsExported} 条事实、${r.episodesExported} 段情节、${r.coreCount} 条核心记忆`)
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
          <h1 className="text-base font-semibold text-ink">记忆档案</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {domains.length > 0
              ? `${domains.length} 个领域 · ${files.filter(f => !f.isDir).length} 个文件 · 人类可读`
              : '暂无记录 — 点击「立即导出」手动生成'}
            <span className="mx-1.5 text-surface-inset">|</span>
            <span className="text-accent">
              每 10 轮对话自动更新全部内容
            </span>
            {lastExportAt && (
              <>
                <span className="mx-1.5 text-surface-inset">|</span>
                上次导出：{formatRelative(lastExportAt)}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadList()}
            className="field-btn-secondary rounded-lg px-3 py-1.5 text-xs"
          >刷新</button>
          <button type="button" onClick={() => { setExpanded(new Set(domains)); setSelectedFile(null) }}
            className="field-btn-secondary rounded-lg px-3 py-1.5 text-xs"
          >全部展开</button>
          <button type="button" onClick={() => setExpanded(new Set())}
            className="field-btn-secondary rounded-lg px-3 py-1.5 text-xs"
          >全部收起</button>
          <button type="button" onClick={() => void handleExport()} disabled={exporting}
            className="field-btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50"
          >{exporting ? '导出中...' : '立即导出'}</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 文件树 */}
        <div className="w-64 shrink-0 overflow-y-auto border-r border-surface-inset bg-surface-raised">
          {loading ? (
            <div className="p-4 text-sm text-ink-muted">{t("settings.loading")}</div>
          ) : (
            <div className="py-1">
              {/* 根目录文件（README、情节时间线、核心记忆精选） */}
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

              {/* 领域目录 */}
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
                        {isOpen ? '▼' : '▶'}
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

        {/* 文件内容 */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {!selectedFile ? (
            <div className="flex h-full items-center justify-center text-sm text-ink-muted">
              选择一个文件预览 · 点击「立即导出」刷新档案
            </div>
          ) : !content ? (
            <div className="p-6 text-sm text-ink-muted">{t("settings.loading")}</div>
          ) : (
            <div className="p-6 max-w-3xl">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-xs text-ink-muted font-mono">{selectedFile}</div>
                <button onClick={() => void window.ackem.openDataFolder()}
                  className="rounded-lg border border-surface-inset px-2 py-1 text-[11px] text-ink-muted hover:text-ink"
                >打开目录</button>
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
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const d = Math.floor(hr / 24)
  return `${d} 天前`
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
