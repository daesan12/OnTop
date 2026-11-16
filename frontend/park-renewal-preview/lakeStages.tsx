import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'

export const LakeStage = {
  Bridge: 1, Fence: 2, Dock: 3, FishingAccess: 4, FishingDeck: 5,
  IslandPavilion: 6, FishingShop: 7, FishingFurniture: 8,
  Willows: 9, Fish: 13, Boats: 14,
} as const

export function createLakeProgress() {
  let stage = 0
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getStage: () => stage,
    advance() {
      stage += 1
      for (const listener of listeners) listener()
    },
  }
}

export const LakeProgress = createContext<ReturnType<typeof createLakeProgress> | null>(null)
const noSubscription = () => () => {}

export function LakePart({ at, children }: { at: number; children: ReactNode }) {
  const progress = useContext(LakeProgress)
  const visible = useSyncExternalStore(progress?.subscribe ?? noSubscription, () => !progress || progress.getStage() >= at)
  return visible ? children : null
}
