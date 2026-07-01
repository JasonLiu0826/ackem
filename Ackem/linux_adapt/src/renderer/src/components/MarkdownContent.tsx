import { useMemo } from 'react'
import { t } from '../lib/i18n'
import { renderMarkdown } from './md'

/** 聊天、知识卡等场景共用的 Markdown 排版样式 */
export const MD_CONTENT_CLASS =
  'md-content text-sm leading-relaxed [&_code]:rounded [&_code]:bg-surface-raised [&_code]:px-1 [&_code]:text-xs [&_del]:opacity-70 [&_em]:italic [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:font-mono [&_pre]:text-xs [&_strong]:font-semibold [&_table]:w-full [&_td]:align-top [&_th]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5'

type Props = {
  source: string
  className?: string
  /** 聊天伴侣气泡：不显示 --- 横线 */
  chat?: boolean
}

export function MarkdownContent({ source, className, chat }: Props): JSX.Element {
  const html = useMemo(() => renderMarkdown(source, { chat }), [source, chat])
  return (
    <div
      className={[MD_CONTENT_CLASS, className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
