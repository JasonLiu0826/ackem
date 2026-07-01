import { create } from 'zustand'
import {
  createInitialComposerSurfaces,
  type ComposerSurfaceId,
  type ComposerSurfaceState
} from '../lib/composerAvatar'

export type ViewLevel = 0 | 1 | 2 | 3

type UiState = {
  viewLevel: ViewLevel
  theaterOpen: boolean
  planOpen: boolean
  arcMenuOpen: boolean
  ambientAff: number
  /** 语音 ASR 正在检测用户说话（驱动光球倾听动效） */
  voiceListening: boolean
  composerSurfaces: Record<ComposerSurfaceId, ComposerSurfaceState>
  setViewLevel: (l: ViewLevel) => void
  setTheaterOpen: (v: boolean) => void
  planReloadNonce: number
  bumpPlanReload: () => void
  setPlanOpen: (v: boolean) => void
  setArcMenuOpen: (v: boolean) => void
  setAmbientAff: (aff: number) => void
  setVoiceListening: (v: boolean) => void
  setComposerSurface: (id: ComposerSurfaceId, patch: Partial<ComposerSurfaceState>) => void
  clearComposerSurface: (id: ComposerSurfaceId) => void
}

export const useUiStore = create<UiState>((set) => ({
  viewLevel: 2,
  theaterOpen: false,
  planOpen: false,
  planReloadNonce: 0,
  arcMenuOpen: false,
  ambientAff: 0,
  voiceListening: false,
  composerSurfaces: createInitialComposerSurfaces(),
  setViewLevel: (viewLevel) => set({ viewLevel }),
  setTheaterOpen: (theaterOpen) => set({ theaterOpen }),
  setPlanOpen: (planOpen) => set({ planOpen }),
  bumpPlanReload: () => set((s) => ({ planReloadNonce: s.planReloadNonce + 1 })),
  setArcMenuOpen: (arcMenuOpen) => set({ arcMenuOpen }),
  setAmbientAff: (ambientAff) => set({ ambientAff }),
  setVoiceListening: (voiceListening) => set({ voiceListening }),
  setComposerSurface: (id, patch) =>
    set((state) => ({
      composerSurfaces: {
        ...state.composerSurfaces,
        [id]: { ...state.composerSurfaces[id], ...patch }
      }
    })),
  clearComposerSurface: (id) =>
    set((state) => ({
      composerSurfaces: {
        ...state.composerSurfaces,
        [id]: { focused: false, textLength: 0, imeComposing: false }
      }
    }))
}))
