import { useCallback, useEffect, useRef, useState } from 'react'

/** Follow streamed growth with one animation; explicit user input cancels it immediately. */
export function useChatScroll() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const frame = useRef<number | null>(null)
  const [isFollowing, setIsFollowing] = useState(true)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const updateBottom = useCallback(() => {
    const panel = scrollRef.current
    const atBottom = !panel || panel.scrollHeight - panel.clientHeight - panel.scrollTop <= 2
    setIsAtBottom(atBottom)
    return atBottom
  }, [])
  const cancel = useCallback(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current)
    frame.current = null
  }, [])
  const pause = useCallback(() => {
    following.current = false
    setIsFollowing(false)
    cancel()
    updateBottom()
  }, [cancel, updateBottom])
  const animate = useCallback(() => {
    if (!following.current || frame.current != null) return
    let previous = performance.now()
    const tick = (now: number) => {
      frame.current = null
      const panel = scrollRef.current
      if (!panel || !following.current) return
      const target = Math.max(0, panel.scrollHeight - panel.clientHeight)
      const gap = target - panel.scrollTop
      if (Math.abs(gap) < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        panel.scrollTop = target
        return
      }
      const dt = Math.min(64, Math.max(1, now - previous))
      previous = now
      const step = gap * (1 - Math.exp(-dt / 65))
      // Scroll offsets may round to whole CSS pixels; always advance the final few pixels.
      panel.scrollTop += Math.sign(gap) * Math.max(1, Math.abs(step))
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }, [])
  const resume = useCallback(() => {
    following.current = true
    setIsFollowing(true)
    animate()
  }, [animate])
  const jumpToBottom=useCallback(()=>{
    cancel()
    following.current=true
    setIsFollowing(true)
    const panel=scrollRef.current
    if(panel)panel.scrollTop=Math.max(0,panel.scrollHeight-panel.clientHeight)
    updateBottom()
  },[cancel,updateBottom])
  useEffect(() => {
    const panel = scrollRef.current
    const content = contentRef.current
    if (!panel || !content) return
    const keys = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) pause()
    }
    const scrollbar = (event: PointerEvent) => { if (event.target === panel) pause() }
    const wheel = (event: WheelEvent) => {
      if (event.deltaY >= 0 && updateBottom()) resume()
      else pause()
    }
    panel.addEventListener('wheel', wheel, { passive: true })
    panel.addEventListener('touchstart', pause, { passive: true })
    panel.addEventListener('pointerdown', scrollbar)
    panel.addEventListener('keydown', keys)
    const onScroll = () => {
      if (updateBottom()) {
        following.current = true
        setIsFollowing(true)
      }
    }
    panel.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(() => { updateBottom(); animate() })
    observer.observe(panel)
    observer.observe(content)
    animate()
    return () => {
      cancel()
      observer.disconnect()
      panel.removeEventListener('scroll', onScroll)
      panel.removeEventListener('wheel', wheel)
      panel.removeEventListener('touchstart', pause)
      panel.removeEventListener('pointerdown', scrollbar)
      panel.removeEventListener('keydown', keys)
    }
  }, [animate, cancel, pause, resume, updateBottom])
  return { scrollRef, contentRef, isFollowing, isAtBottom, pause, resume, jumpToBottom }
}
