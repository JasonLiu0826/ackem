import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { ChatRow } from '../store/appStore'
import '../assets/chat.css'

export function ChatPositionRail({ scrollRef, rows, onNavigate, minimumItems=4, label='用户消息定位' }: { scrollRef: RefObject<HTMLDivElement>; rows: ChatRow[]; onNavigate: () => void; minimumItems?:number;label?:string }): JSX.Element | null {
  const list = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const moved = useRef(false)
  const pointerItem = useRef<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [previewY, setPreviewY] = useState(0)
  const [active, setActive] = useState<number[]>([])
  const items = rows.flatMap((row, index) => row.kind === 'message' && row.role === 'user' ? [{ index, row }] : [])
  useEffect(() => {
    const panel = scrollRef.current
    if (!panel) return
    let frame: number | null = null
    const measure = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        const bounds = panel.getBoundingClientRect()
        const nodes = [...panel.querySelectorAll<HTMLElement>('[data-chat-row]')]
        const turns = nodes.filter(node => rows[Number(node.dataset.chatRow)]?.kind === 'message' && (rows[Number(node.dataset.chatRow)] as { role?: string }).role === 'user')
        setActive(turns.flatMap((node, position) => {
          const top = node.getBoundingClientRect().top
          const bottom = turns[position + 1]?.getBoundingClientRect().top ?? bounds.top + panel.scrollHeight - panel.scrollTop
          return top < bounds.bottom && bottom > bounds.top + 16 ? [Number(node.dataset.chatRow)] : []
        }))
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    if (panel.firstElementChild) observer.observe(panel.firstElementChild)
    panel.addEventListener('scroll', measure, { passive: true })
    measure()
    return () => { observer.disconnect(); panel.removeEventListener('scroll', measure); if (frame !== null) cancelAnimationFrame(frame) }
  }, [scrollRef, rows])
  useEffect(() => {
    if (dragging.current || !list.current) return
    const button = list.current.querySelector<HTMLElement>(`[data-rail-row="${active[0]}"]`)
    if (!button) return
    const top = button.offsetTop
    if (top < list.current.scrollTop) list.current.scrollTop = top
    else if (top + 10 > list.current.scrollTop + list.current.clientHeight) list.current.scrollTop = top + 10 - list.current.clientHeight
  }, [active])
  if (items.length < minimumItems) return null
  const jump = (index: number, smooth: boolean) => {
    const panel = scrollRef.current
    const node = panel?.querySelector<HTMLElement>(`[data-chat-row="${index}"]`)
    if (!panel || !node) return
    onNavigate()
    panel.scrollTo({ top: panel.scrollTop + node.getBoundingClientRect().top - panel.getBoundingClientRect().top - 24,
      behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' })
  }
  const pick = (clientY: number) => {
    const bounds = list.current?.getBoundingClientRect()
    if (!bounds || !list.current) return null
    const position = Math.max(0, Math.min(items.length - 1, Math.floor((Math.max(bounds.top, Math.min(clientY, bounds.bottom - 1)) - bounds.top + list.current.scrollTop) / 10)))
    setHovered(position)
    setPreviewY(Math.max(20, Math.min(bounds.height - 20, position * 10 + 5 - list.current.scrollTop)))
    return position
  }
  const preview = hovered !== null ? items[hovered] : undefined
  const response = preview ? rows.slice(preview.index + 1, items[(hovered ?? 0) + 1]?.index ?? rows.length).filter(row => row.kind === 'message' && row.role === 'assistant').map(row => row.kind === 'message' ? row.content : '').join('\n') : ''
  return <nav className="chat-position-rail" aria-label={label}>
    <div ref={list} className="chat-position-list" onPointerLeave={() => { if (!dragging.current) setHovered(null) }}
      onPointerDown={event => {
        if (event.button !== 0) return
        dragging.current = true; moved.current = false
        pointerItem.current = pick(event.clientY)
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        const position = pick(event.clientY)
        if (dragging.current && position !== null && position !== pointerItem.current) {
          moved.current = true; pointerItem.current = position; jump(items[position].index, false)
        }
      }}
      onPointerUp={event => {
        if (!dragging.current) return
        dragging.current = false
        if (!moved.current && pointerItem.current !== null) jump(items[pointerItem.current].index, true)
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        if (event.pointerType !== 'mouse') setHovered(null)
      }} onPointerCancel={() => { dragging.current = false; setHovered(null) }}
      onLostPointerCapture={() => { dragging.current = false }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHovered(null) }}>
      {items.map((item, position) => {
        const distance = hovered === null ? 4 : Math.abs(position - hovered)
        const progress = [1, .7, .4, .2][distance] ?? 0
        return <button type="button" key={item.index} data-rail-row={item.index} className="chat-position-marker"
          aria-label={`定位到第 ${position + 1} 条用户消息：${item.row.content.slice(0, 80)}`}
          aria-current={active.includes(item.index) ? 'true' : undefined} data-hovered={position === hovered || undefined}
          style={{ '--rail-progress': progress } as CSSProperties}
          onFocus={event => { setHovered(position); setPreviewY(event.currentTarget.offsetTop + 5 - (list.current?.scrollTop ?? 0)) }}
          onClick={event => { if (event.detail === 0) jump(item.index, true) }}>
          <span className="chat-position-line" />
        </button>
      })}
    </div>
    {preview && <div className="chat-position-preview" style={{ top: previewY }}>
      {preview.row.createdAt && <time dateTime={new Date(preview.row.createdAt).toISOString()}>{new Date(preview.row.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>}
      <div className="chat-position-preview-prompt">{preview.row.content || '（无文本内容）'}</div>
      {response && <div className="chat-position-preview-response">{response}</div>}
    </div>}
  </nav>
}
