import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent
} from 'react'
import { resolveAvatarState } from '../components/resolveAvatarState'
import {
  type ComposerSurfaceId,
  isAnyComposerActive,
  isAnyComposerTyping,
  mergeComposerSurface
} from '../lib/composerAvatar'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'

type ComposerElement = HTMLInputElement | HTMLTextAreaElement

export function useCompanionAvatar(opts: {
  surface: ComposerSurfaceId
  busy: boolean
  streamingAssistantLen: number
  input: string
  syncToStore?: boolean
}): {
  avatarState: ReturnType<typeof resolveAvatarState>
  inputActive: boolean
  inputTyping: boolean
  bindComposerInput: <E extends ComposerElement>(
    props: {
      value: string
      onChange: (e: ChangeEvent<E>) => void
    } & Partial<
      Pick<
        InputHTMLAttributes<E>,
        'onKeyDown' | 'onFocus' | 'onBlur' | 'onCompositionStart' | 'onCompositionEnd'
      >
    >
  ) => {
    value: string
    onChange: (e: ChangeEvent<E>) => void
    onFocus: (e: FocusEvent<E>) => void
    onBlur: (e: FocusEvent<E>) => void
    onCompositionStart: (e: CompositionEvent<E>) => void
    onCompositionEnd: (e: CompositionEvent<E>) => void
    onKeyDown: (e: KeyboardEvent<E>) => void
  }
} {
  const { surface, busy, streamingAssistantLen, input, syncToStore = false } = opts
  const composerSurfaces = useUiStore((s) => s.composerSurfaces)
  const voiceListening = useUiStore((s) => s.voiceListening)
  const setComposerSurface = useUiStore((s) => s.setComposerSurface)
  const clearComposerSurface = useUiStore((s) => s.clearComposerSurface)
  const setCompanionAvatarState = useAppStore((s) => s.setCompanionAvatarState)

  const [focused, setFocused] = useState(false)
  const [imeComposing, setImeComposing] = useState(false)
  const imeComposingRef = useRef(false)

  const localSurface = useMemo(
    () => ({
      focused,
      textLength: input.length,
      imeComposing
    }),
    [focused, input.length, imeComposing]
  )

  const mergedSurfaces = useMemo(
    () => mergeComposerSurface(composerSurfaces, surface, localSurface),
    [composerSurfaces, surface, localSurface]
  )

  const inputActive = isAnyComposerActive(mergedSurfaces) || voiceListening
  const inputTyping = isAnyComposerTyping(mergedSurfaces) || voiceListening

  const avatarState = useMemo(
    () =>
      resolveAvatarState({
        busy,
        assistantContentLength: streamingAssistantLen,
        composing: inputActive
      }),
    [busy, streamingAssistantLen, inputActive]
  )

  const bindComposerInput = useCallback(
    <E extends ComposerElement>(
      props: {
        value: string
        onChange: (e: ChangeEvent<E>) => void
      } & Partial<
        Pick<
          InputHTMLAttributes<E>,
          'onKeyDown' | 'onFocus' | 'onBlur' | 'onCompositionStart' | 'onCompositionEnd'
        >
      >
    ) => {
      const { onChange, onFocus, onBlur, onCompositionStart, onCompositionEnd, onKeyDown, value } =
        props

      return {
        value,
        onFocus: (e: FocusEvent<E>) => {
          setFocused(true)
          onFocus?.(e)
        },
        onBlur: (e: FocusEvent<E>) => {
          if (!imeComposingRef.current) setFocused(false)
          onBlur?.(e)
        },
        onCompositionStart: (e: CompositionEvent<E>) => {
          imeComposingRef.current = true
          setImeComposing(true)
          setFocused(true)
          onCompositionStart?.(e)
        },
        onCompositionEnd: (e: CompositionEvent<E>) => {
          imeComposingRef.current = false
          setImeComposing(false)
          setFocused(true)
          onCompositionEnd?.(e)
        },
        onKeyDown: (e: KeyboardEvent<E>) => {
          setFocused(true)
          onKeyDown?.(e)
        },
        onChange: (e: ChangeEvent<E>) => {
          setFocused(true)
          onChange(e)
        }
      }
    },
    []
  )

  useLayoutEffect(() => {
    setComposerSurface(surface, localSurface)
  }, [surface, localSurface, setComposerSurface])

  useEffect(() => {
    return () => clearComposerSurface(surface)
  }, [surface, clearComposerSurface])

  useEffect(() => {
    if (!syncToStore) return
    setCompanionAvatarState(avatarState, inputTyping)
  }, [avatarState, inputTyping, syncToStore, setCompanionAvatarState])

  useEffect(() => {
    if (!syncToStore) return
    return () => setCompanionAvatarState('idle', false)
  }, [syncToStore, setCompanionAvatarState])

  return { avatarState, inputActive, inputTyping, bindComposerInput }
}
