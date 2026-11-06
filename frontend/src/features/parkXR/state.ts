import { create } from 'zustand'

export const useParkXR = create<{
  ready: boolean; phase: 'idle' | 'requesting' | 'active' | 'ending'; error: string; notice: string
}>(() => ({ ready: false, phase: 'idle', error: '', notice: '' }))
export const parkXRActions: { start: (() => Promise<void>) | null; end: (() => Promise<void>) | null } = { start: null, end: null }
