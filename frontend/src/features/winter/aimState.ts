import { create } from 'zustand'
import type { SnowballAim } from './trajectory'
export const useSnowballAim = create<{ aim: SnowballAim | null }>(() => ({ aim: null }))
