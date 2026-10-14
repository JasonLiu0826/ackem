import type { ReactNode } from 'react'
import { cx } from './cx'

/** 盖住整页的透明层。点菜单以外的任何地方都会收起。 */
export function WbPopDismiss(props: { onClose: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className="wb-pop-dismiss"
      aria-label="关闭"
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        props.onClose()
      }}
    />
  )
}

export function WbMenu(props: {
  children: ReactNode
  at?: 'plus' | 'effort' | 'trust'
  onClose: () => void
}): JSX.Element {
  return (
    <>
      <WbPopDismiss onClose={props.onClose} />
      <div className={cx('wb-menu', props.at && `is-${props.at}`)}>{props.children}</div>
    </>
  )
}
