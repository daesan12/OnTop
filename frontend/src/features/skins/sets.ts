import type { SkinEntry, SkinSlot } from './api'
export const places = ['HAIR', 'FACE', 'OUTFIT'] as const
export const placeLabels = { HAIR: '머리', FACE: '얼굴', OUTFIT: '옷' }
export const physicalSlots: Record<typeof places[number], readonly SkinSlot[]> = {
  HAIR: ['HAIR'], FACE: ['FACE'], OUTFIT: ['TOP', 'BOTTOM', 'SHOES'],
}
export function overlaps(selected: readonly SkinEntry[], candidate: SkinEntry) {
  return selected.some(item => item.id !== candidate.id && item.definition.slots.some(slot => candidate.definition.slots.includes(slot)))
}
export function occupies(item: SkinEntry, place: typeof places[number]) {
  return physicalSlots[place].some(slot => item.definition.slots.includes(slot))
}
export const placeNames = (item: SkinEntry) => places.filter(place => occupies(item, place)).map(place => placeLabels[place]).join('·')
export interface SetDefinition { productCode: string; name: string; grade: number; compatibility: 'MALE' | 'FEMALE' | 'ANY'; imageSkinId: string; itemIds: string[] }
export interface SkinSet { id: string; definition: SetDefinition; state: 'DRAFT' | 'PUBLISHED' | 'DISABLED'; version: number; publishedAt: string | null }
