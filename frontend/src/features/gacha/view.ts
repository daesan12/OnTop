import { create } from 'zustand'

/** The machine leaves the park visible. The capsule screen covers it. */
export const useGachaOverlay = create<{ surface: 'machine' | 'boxes' | null }>(() => ({ surface: null }))
