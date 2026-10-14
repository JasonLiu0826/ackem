import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

function I(props: P & { d: string }): JSX.Element {
  const { d, ...rest } = props
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden {...rest}>
      <path d={d} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconPlus(p: P): JSX.Element {
  return <I {...p} d="M8 3v10M3 8h10" />
}
export function IconSearch(p: P): JSX.Element {
  return <I {...p} d="M7 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm7 1-3.2-3.2" />
}
export function IconClock(p: P): JSX.Element {
  return <I {...p} d="M8 3a5 5 0 1 1 0 10A5 5 0 0 1 8 3Zm0 2.2V8l2 1.4" />
}
export function IconFolder(p: P): JSX.Element {
  return <I {...p} d="M2.5 13V5.2A1.2 1.2 0 0 1 3.7 4h2.3l1.2 1.4h5.1A1.2 1.2 0 0 1 13.5 6.6V13a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1Z" />
}
export function IconChat(p: P): JSX.Element {
  return <I {...p} d="M3 12.5 4.2 10H12a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 2H4A1.5 1.5 0 0 0 2.5 3.5v7.2L3 12.5Z" />
}
export function IconDiff(p: P): JSX.Element {
  return <I {...p} d="M4 3h8M4 8h8M4 13h5M11.5 11v4M9.5 13h4" />
}
export function IconGlobe(p: P): JSX.Element {
  return <I {...p} d="M8 13.5A5.5 5.5 0 1 0 8 2.5a5.5 5.5 0 0 0 0 11ZM3 8h10M8 2.5c1.8 1.8 1.8 9.2 0 11M8 2.5c-1.8 1.8-1.8 9.2 0 11" />
}
export function IconTerm(p: P): JSX.Element {
  return <I {...p} d="M3 5.5 6 8l-3 2.5M8 11.5h5" />
}
export function IconFiles(p: P): JSX.Element {
  return <I {...p} d="M5 3.5h4l3 3V12.5H5Z M9 3.5V6.5h3" />
}
export function IconDoc(p: P): JSX.Element {
  return <I {...p} d="M5 2.5h4l3 3V13.5H5Z M8 8h3M8 10.5h3" />
}
export function IconMic(p: P): JSX.Element {
  return <I {...p} d="M8 2.5a2 2 0 0 1 2 2v3a2 2 0 1 1-4 0v-3a2 2 0 0 1 2-2Zm-3.5 5.2A3.5 3.5 0 0 0 8 11.2a3.5 3.5 0 0 0 3.5-3.5M8 11.2V14" />
}
export function IconSend(p: P): JSX.Element {
  return <I {...p} d="M8 12.5V3.5M5 6.5 8 3.5 11 6.5" />
}
export function IconGear(p: P): JSX.Element {
  return <I {...p} d="M8 10.2A2.2 2.2 0 1 0 8 5.8a2.2 2.2 0 0 0 0 4.4ZM8 2.5v1.3M8 12.2v1.3M3.3 4.2l.9.9M11.8 10.9l.9.9M2.5 8h1.3M12.2 8h1.3M3.3 11.8l.9-.9M11.8 5.1l.9-.9" />
}
export function IconStop(p: P): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden {...p}>
      <rect x="2" y="2" width="8" height="8" rx="1.5" />
    </svg>
  )
}
export function IconChevron(p: P): JSX.Element {
  return <I {...p} d="M6 4.5 9.5 8 6 11.5" />
}
export function IconPin(p: P): JSX.Element {
  return <I {...p} d="M6 2.5h4l.8 3.2L13 7.5H3l2.2-1.8L6 2.5ZM8 7.5v6" />
}
export function IconSidebar(p: P): JSX.Element {
  return <I {...p} d="M2.5 3.2h11v9.6h-11zM6.2 3.2v9.6" />
}
export function IconExpand(p: P): JSX.Element {
  return <I {...p} d="M6.2 3.5H3.5V6.2M9.8 3.5h2.7V6.2M3.5 9.8v2.7H6.2M12.5 9.8v2.7H9.8" />
}
export function IconBack(p: P): JSX.Element {
  return <I {...p} d="M10 4 6 8l4 4" />
}
export function IconForward(p: P): JSX.Element {
  return <I {...p} d="M6 4l4 4-4 4" />
}
export function IconClose(p: P): JSX.Element {
  return <I {...p} d="M5 5l6 6M11 5l-6 6" />
}
export function IconRefresh(p: P): JSX.Element {
  return <I {...p} d="M12.4 8A4.4 4.4 0 1 1 10.2 4M12.4 8V4.4H8.8" />
}
export function IconChevronDown(p: P): JSX.Element {
  return <I {...p} d="M4.5 6.5 8 10l3.5-3.5" />
}
