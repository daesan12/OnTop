import { equipSlots, type PublicEquipment } from '../../network/equipment'
import type { CharacterVariant } from './characterLook'

/** A whole surface replaces the base mesh, including hair and face. The five server slots form one
 * exclusive set so changing any piece removes the whole skin through the existing equip contract. */
export const ssafyBlackMale = Object.freeze({
  imageKey: 'skin/ssafy-black-male/v3',
  source: 'skin-ssafy-black-male-v3',
  url: '/art/characters/skins/ssafy-black-male-v3.glb',
  variant: 'man' as CharacterVariant,
  setCode: 'SSAFY_BLACK_MALE_V3',
})
const skins = [ssafyBlackMale] as const

export const knownWholeSkin = (imageKey: string | null) => skins.find(skin => skin.imageKey === imageKey)
export const wholeSkinUrl = (source: string) => skins.find(skin => skin.source === source)?.url
export function wholeSkinCompatible(variant: CharacterVariant, imageKey: string | null) {
  const skin = knownWholeSkin(imageKey)
  return !skin || skin.variant === variant
}

/** Partial, mixed, unknown or incompatible equipment never replaces the base body. */
export function resolveWholeSkin(variant: CharacterVariant, equipment: readonly PublicEquipment[]) {
  if (equipment.length !== equipSlots.length) return undefined
  const skin = knownWholeSkin(equipment[0]?.imageKey ?? null)
  return skin?.variant === variant && equipSlots.every(slot =>
    equipment.filter(item => item.equipSlot === slot && item.imageKey === skin.imageKey).length === 1)
    ? skin : undefined
}
