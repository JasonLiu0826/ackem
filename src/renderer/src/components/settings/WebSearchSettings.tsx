import { useEffect, useRef, useState } from 'react'
import type { WebSearchProvider, WebSearchStatus, WebSearchSetupRequest } from '../../../../shared/webSearch'

export function WebSearchConfigForm({ onSaved }: { onSaved?: () => void }): JSX.Element {
  const [status, setStatus] = useState<WebSearchStatus | null>(null)
  const [provider, setProvider] = useState<WebSearchProvider>('tavily')
  const [key, setKey] = useState(''), [url, setUrl] = useState(''), [max, setMax] = useState(8)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  useEffect(() => {
    let live = true
    void window.ackem.webSearch.status().then(s => {
      if (!live) return
      setStatus(s); setProvider(s.configuredProvider === 'auto' && !s.ready ? 'tavily' : s.configuredProvider); setUrl(s.customUrl ?? ''); setMax(s.maxResults)
    }).catch(e => { if (live) setError(String(e)) })
    return () => { live = false }
  }, [])
  async function save(): Promise<void> {
    setBusy(true); setError(''); setSaved(false)
    try {
      const result = await window.ackem.webSearch.configure({ provider, ...(key.trim() ? { apiKey: key.trim() } : {}), customUrl: url.trim(), maxResults: max })
      setStatus(result); setKey(''); setSaved(true); onSaved?.()
    } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }
  const link = { tavily: 'https://app.tavily.com', serpapi: 'https://serpapi.com/manage-api-key', brave: 'https://api.search.brave.com' }[provider as 'tavily' | 'serpapi' | 'brave']
  return <form className="web-search-form" onSubmit={e => { e.preventDefault(); void save() }}>
    <p>与 AckemCode 共用搜索配置。搜索需要服务商提供的 API Key；配置后可搜索新闻、文档等实时信息。</p>
    <label>搜索服务商<select aria-label="搜索服务商" className="field-input" value={provider} onChange={e => { setProvider(e.target.value as WebSearchProvider); setSaved(false) }}>
      <option value="tavily">Tavily</option><option value="serpapi">SerpAPI</option><option value="brave">Brave Search</option><option value="auto">自动（已有密钥或环境配置）</option><option value="custom">自定义搜索服务</option>
    </select></label>
    {link && <a href={link} target="_blank" rel="noreferrer">获取 {provider === 'brave' ? 'Brave Search' : provider === 'tavily' ? 'Tavily' : 'SerpAPI'} API Key</a>}
    <label>API Key<input aria-label="搜索 API Key" autoComplete="off" type="password" className="field-input" value={key} placeholder={status?.hasApiKey ? '已配置；留空保留现有密钥' : '粘贴搜索服务商的 API Key'} onChange={e => setKey(e.target.value)} /></label>
    {provider === 'custom' && <label>搜索地址<input aria-label="自定义搜索地址" className="field-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-service/search?q={query}" required /></label>}
    <label>最多返回条数<input aria-label="最多返回条数" type="number" min={1} max={20} step={1} className="field-input" value={max} onChange={e => setMax(Number(e.target.value))} /></label>
    {status && <small>{status.ready ? `当前搜索服务已配置：${status.provider}` : status.enabled ? '尚未配置搜索服务' : '搜索已被运行环境禁用'}</small>}
    {error && <p role="alert">{error}</p>}{saved && <p role="status">搜索配置已保存。</p>}
    <button type="submit" className="btn btn-primary" disabled={busy || !status}>{busy ? '保存中…' : onSaved ? '保存并继续本次搜索' : '保存搜索配置'}</button>
  </form>
}

function SetupDialog({ request, dismiss }: { request: WebSearchSetupRequest; dismiss: () => void }): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  async function cancel(): Promise<void> {
    try { await window.ackem.webSearch.cancel(request.requestId); dismiss() }
    catch (e) { setError(String(e)) }
  }
  return <dialog ref={dialog} className="web-search-dialog" aria-labelledby="web-search-title" onCancel={e => { e.preventDefault(); void cancel() }}>
    <h2 id="web-search-title">先配置 web-search</h2><p>配置完成后，继续搜索“{request.query}”。</p>
    <WebSearchConfigForm onSaved={dismiss} />{error && <p role="alert">{error}</p>}
    <button type="button" className="btn" onClick={() => void cancel()}>暂不配置</button>
  </dialog>
}
export function WebSearchSetup(): JSX.Element | null {
  const [request, setRequest] = useState<WebSearchSetupRequest | null>(null)
  useEffect(() => {
    let live = true, received = false
    const off = window.ackem.webSearch.onSetup(r => { received = true; setRequest(prev => r.status === 'pending' ? r : prev?.requestId === r.requestId ? null : prev) })
    void window.ackem.webSearch.pending().then(list => { if (live && !received) setRequest(list.find(r => r.status === 'pending') ?? null) }).catch(() => {})
    return () => { live = false; off() }
  }, [])
  return request ? <SetupDialog key={request.requestId} request={request} dismiss={() => setRequest(null)} /> : null
}
export function WebSearchSettings(): JSX.Element {
  const [open, setOpen] = useState(false)
  return <section className="web-search-settings"><button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>web-search 搜索配置</button>{open && <WebSearchConfigForm />}</section>
}
