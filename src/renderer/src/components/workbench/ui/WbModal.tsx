import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function WbModal(props: {
  title: string
  hint?: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}): JSX.Element {
  const titleId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = dialog.current?.querySelector<HTMLElement>('input, button:not(:disabled), select, textarea')
    ;(first ?? dialog.current)?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  return createPortal(
    <div className="wb wb-modal-back" onClick={props.onClose} onKeyDown={(e) => {
      if (e.key === 'Escape') { e.stopPropagation(); props.onClose() }
      if (e.key !== 'Tab') return
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
      ) ?? []).filter((element) => element.getClientRects().length > 0)
      const target = e.shiftKey ? controls[controls.length - 1] : controls[0]
      if (!controls.length || document.activeElement === (e.shiftKey ? controls[0] : controls[controls.length - 1])) {
        e.preventDefault(); (target ?? dialog.current)?.focus()
      }
    }}>
      <div ref={dialog} className="wb-modal" tabIndex={-1} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{props.title}</h2>
        {props.hint ? <p className="wb-modal-hint">{props.hint}</p> : null}
        <div className="wb-modal-body">{props.children}</div>
        <div className="wb-actions">{props.footer}</div>
      </div>
    </div>,
    document.body
  )
}
