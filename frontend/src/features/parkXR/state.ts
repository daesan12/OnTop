import { create } from 'zustand'

export const useParkXR = create<{
  ready: boolean; phase: 'idle' | 'requesting' | 'active' | 'ending'; mode: 'park-preview' | 'jumpmap'; error: string; notice: string
}>(() => ({ ready: false, phase: 'idle', mode: 'jumpmap', error: '', notice: '' }))
export const parkXRActions: { start: (() => Promise<void>) | null; startJumpmap: (() => Promise<void>) | null; end: (() => Promise<void>) | null; guide: (() => void) | null } = { start: null, startJumpmap: null, end: null, guide: null }
