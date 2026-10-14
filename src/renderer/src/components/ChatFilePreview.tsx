import { createContext, useEffect, useState } from 'react'
import { CopyButton } from './CopyButton'
import type { FilePreviewResult } from '../../../main/chat/filePreview'

export const ChatFilePreviewContext = createContext<((path: string) => void) | null>(null)

export function ChatFilePreview({ path, onClose, onSelect }: { path: string; onClose: () => void; onSelect: (path: string) => void }): JSX.Element {
  const [result, setResult] = useState<FilePreviewResult | null>(null)
  useEffect(() => {
    let active = true
    setResult(null)
    void window.ackem.previewChatFile(path).then((value) => { if (active) setResult(value) })
      .catch(() => { if (active) setResult({ ok: false, error: '文件读取失败，请稍后重试。' }) })
    return () => { active = false }
  }, [path])
  const filePath = result?.ok ? result.path : result?.candidates?.length === 1 ? result.candidates[0] : path
  return <aside className="chat-file-preview" aria-label="文件预览">
    <header className="chat-file-preview-header">
      <div><strong>文件预览</strong><div className="chat-file-preview-path" title={filePath}>{result?.ok ? result.name : path}</div></div>
      <button type="button" className="chat-copy-button" onClick={onClose} aria-label="关闭文件预览">关闭</button>
    </header>
    <div className="chat-file-preview-toolbar">
      {result?.ok && <CopyButton text={result.content} label="复制全文" />}
      <CopyButton text={filePath} label="复制路径" />
      <button type="button" className="chat-copy-button" onClick={() => {
        void window.ackem.revealPath(filePath).then((r) => { if (!r.ok) setResult({ ok: false, error: '文件不存在或不可访问。' }) })
          .catch(() => setResult({ ok: false, error: '无法在资源管理器中定位文件。' }))
      }}>在资源管理器中定位</button>
    </div>
    {!result ? <div className="chat-file-preview-notice" role="status">正在读取文件…</div> : result.ok ? <>
      <div className="chat-file-preview-path">{result.path} · {result.bytes.toLocaleString()} 字节</div>
      {result.content ? <pre className="chat-file-preview-text" tabIndex={0}>{result.content}</pre> : <div className="chat-file-preview-notice">此文件为空</div>}
    </> : <div className="chat-file-preview-notice" role="alert">
      <p>{result.error}</p>
      {result.candidates && result.candidates.length > 1 && result.candidates.map((candidate) => <button type="button" className="chat-file-candidate" key={candidate} onClick={() => onSelect(candidate)}>{candidate}</button>)}
    </div>}
  </aside>
}
