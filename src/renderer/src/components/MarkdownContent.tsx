import { useContext, useMemo } from 'react'
import { ChatFilePreviewContext } from './ChatFilePreview'
import { renderMarkdown } from './md'
import { useAppStore } from '../store/appStore'

/** 聊天、知识卡等场景共用的 Markdown 排版样式 */
export const MD_CONTENT_CLASS =
  'md-content text-sm leading-relaxed [&_code]:rounded [&_code]:bg-surface-raised [&_code]:px-1 [&_code]:text-xs [&_del]:opacity-70 [&_em]:italic [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-sm [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:font-mono [&_pre]:text-xs [&_strong]:font-semibold [&_table]:w-full [&_td]:align-top [&_th]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5'

type Props = {
  source: string
  className?: string
  /** 聊天伴侣气泡：不显示 --- 横线 */
  chat?: boolean
}

export function MarkdownContent({ source, className, chat }: Props): JSX.Element {
  const openPreview = useContext(ChatFilePreviewContext)
  const html = useMemo(() => renderMarkdown(source, { chat }).replace(/<pre([^>]*)>/g, (_match, attrs: string) => {
    const language = attrs.match(/data-language="([^"]*)"/)?.[1] ?? ''
    const label = ['', 'txt', 'text', 'plaintext'].includes(language) ? '复制文本' : '复制代码'
    return `<pre${attrs}><button type="button" class="md-copy-code" data-copy-code="true" aria-label="${label}">${label}</button>`
  }), [source, chat])
  return (
    <div
      className={[MD_CONTENT_CLASS, className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const copy = (e.target as HTMLElement).closest?.('[data-copy-code]') as HTMLElement | null
        if (copy) {
          const text = copy.closest('pre')?.querySelector('code')?.textContent ?? ''
          void navigator.clipboard.writeText(text).then(() => {
            useAppStore.getState().pushToast('内容已复制')
          }).catch(() => useAppStore.getState().pushToast('复制失败，请选中代码复制'))
          return
        }
        // 产出文件路径链接 (md.ts linkifyFilePaths): 点击在资源管理器中定位。
        const target = (e.target as HTMLElement).closest?.('a[data-reveal-path]') as HTMLElement | null
        if (!target) return
        e.preventDefault()
        const path = target.getAttribute('data-reveal-path') ?? ''
        if (openPreview) { openPreview(path); return }
        void window.ackem.revealPath(path).then((r) => {
          if (!r?.ok) useAppStore.getState().pushToast(`文件不存在或不可访问：${path}`)
        }).catch(() => useAppStore.getState().pushToast(`文件不存在或不可访问：${path}`))
      }}
    />
  )
}
