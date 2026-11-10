import { create } from 'zustand'

/** Pause only the obscured park renderer while the gacha's own scene is visible. */
export const useGachaOverlay=create(()=>({open:false}))
