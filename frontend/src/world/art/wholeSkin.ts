import { equipSlots, type PublicEquipment } from '../../network/equipment'
import type { CharacterVariant } from './characterLook'
import { catalogAsset, catalogSource } from './skinCatalog'

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

export const knownWholeSkin = (imageKey: string | null): { imageKey: string; source: string; url: string; variant: CharacterVariant; setCode: string } | undefined => {
  const builtin = skins.find(skin => skin.imageKey === imageKey)
  if (builtin) return builtin
  const asset = catalogAsset(imageKey)
  return asset?.wearMode === 'WHOLE' && asset.compatibility !== 'ANY'
    ? { imageKey: asset.imageKey, source: catalogSource(asset), url: asset.modelUrl,
      variant: asset.compatibility === 'FEMALE' ? 'girl' : 'man', setCode: 'SK_' + asset.productCode } : undefined
}
export const wholeSkinUrl = (source: string) => skins.find(skin => skin.source === source)?.url
export function wholeSkinCompatible(variant: CharacterVariant, imageKey: string | null) {
  const asset = catalogAsset(imageKey)
  if (asset && asset.compatibility !== 'ANY') return asset.compatibility === (variant === 'girl' ? 'FEMALE' : 'MALE')
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
