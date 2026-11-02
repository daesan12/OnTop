import { create } from 'zustand'

/** Local presentation only. Keep a selected card protected until the version changes. */
export const useOneCardUI = create<{ scope: string; selectedId: string }>(() => ({ scope: '', selectedId: '' }))
export const clearOneCardSelection = () => useOneCardUI.setState({ selectedId: '' })
export const handScope = (userId: string, roomId: string, gameId: string, version: number) => JSON.stringify([userId, roomId, gameId, version])
export function flipCandidates(ids: readonly string[], protectedId: string, count = 2) {
  return ids.filter(id => id !== protectedId).slice(0, Math.max(0, Math.min(2, count)))
}
export function privateHandLayout(count: number, width: number, height: number) {
  const compact = width <= 600, base = Math.min(compact ? 96 : 144, height < 740 ? 124 : 144)
  const cardWidth = Math.max(40, Math.round(base * Math.min(1, (compact ? 5 : 8) / Math.max(1, count)) ** .6))
  return { cardWidth, step: count <= 1 ? 0 : Math.max(1, Math.min(cardWidth * .85, (width - 40 - cardWidth) / (count - 1))) }
}
export function fanPose(index: number, count: number) {
  const center = (count - 1) / 2, unit = center > 0 ? (index - center) / center : 0
  return { angle: unit * Math.min(9, center * 3), lift: unit ** 2 * 12 }
}
