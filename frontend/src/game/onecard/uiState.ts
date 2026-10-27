import { create } from 'zustand'

/** Local presentation only. Keep a selected card protected until the version changes. */
export const useOneCardUI = create<{ scope: string; selectedId: string }>(() => ({ scope: '', selectedId: '' }))
export const handScope = (userId: string, roomId: string, gameId: string, version: number) => JSON.stringify([userId, roomId, gameId, version])
export function flipCandidates(ids: readonly string[], protectedId: string, count = 2) {
  return ids.filter(id => id !== protectedId).slice(0, Math.max(0, Math.min(2, count)))
}
export const HAND_PAGE_SIZE = 10
export function fanPose(index: number, count: number) {
  const center = (count - 1) / 2, offset = index - center
  return { angle: count <= 1 ? 0 : offset * Math.min(5, 32 / Math.max(1, count - 1)), lift: Math.abs(offset) ** 2 * 1.7 }
}
