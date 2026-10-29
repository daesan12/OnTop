/** Public WORLD_STATE appearance fields only; private inventory stays in the shop. */
export const equipSlots = ['HAIR', 'FACE', 'TOP', 'BOTTOM', 'SHOES'] as const
export type EquipSlot = typeof equipSlots[number]
export interface PublicEquipment {
  itemId: number
  itemCode: string
  equipSlot: EquipSlot
  imageKey: string | null
}
export const emptyEquipment: readonly PublicEquipment[] = Object.freeze([])
export const isEquipSlot = (value: unknown): value is EquipSlot => equipSlots.includes(value as EquipSlot)
export function validPublicEquipment(value: unknown): value is PublicEquipment[] {
  return Array.isArray(value) && value.length <= 5 && value.every(item =>
    item && typeof item === 'object' && Number.isSafeInteger(item.itemId) && item.itemId > 0
    && typeof item.itemCode === 'string' && !!item.itemCode.trim() && isEquipSlot(item.equipSlot)
    && (item.imageKey === null || typeof item.imageKey === 'string'))
    && new Set(value.map(item => item.equipSlot)).size === value.length
    && new Set(value.map(item => item.itemId)).size === value.length
}
export function sameEquipment(a: readonly PublicEquipment[] | undefined, b: readonly PublicEquipment[]) {
  return a?.length === b.length && a.every(item => b.some(next => next.itemId === item.itemId
    && next.itemCode === item.itemCode && next.equipSlot === item.equipSlot && next.imageKey === item.imageKey))
}
