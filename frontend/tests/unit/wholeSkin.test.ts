import { describe, expect, it } from 'vitest'
import { equipSlots, type PublicEquipment } from '../../src/network/equipment'
import { resolveWholeSkin, ssafyBlackMale, wholeSkinUrl } from '../../src/world/art/wholeSkin'
import { previewEquipment, wearing } from '../../src/features/wardrobe/state'
import type { OwnedItem } from '../../src/features/shop/contracts'

const items: OwnedItem[] = equipSlots.map((equipSlot, i) => ({
  userItemId: i + 1, quantity: 1, equipped: false,
  item: { itemId: i + 1, itemCode: `SSAFY_BLACK_MALE_V3_${equipSlot}`, name: `SSAFY 검정 후드 ${equipSlot}`,
    itemType: 'EQUIPMENT', equipSlot, price: 0, imageKey: ssafyBlackMale.imageKey, setCode: ssafyBlackMale.setCode },
}))
const equipment = previewEquipment(items, 3)!

describe('whole skin selection through public equipment', () => {
  it('uses one asset only for a complete compatible five-slot set, in any order', () => {
    expect(resolveWholeSkin('man', equipment)).toBe(ssafyBlackMale)
    expect(resolveWholeSkin('man', [...equipment].reverse())).toBe(ssafyBlackMale)
    expect(wholeSkinUrl(ssafyBlackMale.source)).toBe(ssafyBlackMale.url)
  })
  it('keeps the original body for empty, incomplete, mixed, duplicate or unknown equipment', () => {
    const withKey = (imageKey: string) => equipment.map(item => ({ ...item, imageKey }))
    for (const worn of [[], equipment.slice(1), [...equipment.slice(1), equipment[1]!],
      [equipment[0]!, ...equipment.slice(1).map(item => ({ ...item, imageKey: 'outfit/general/g' }))],
      withKey('skin/unknown/v3'), withKey('skin/../../man/v3')]) {
      expect(resolveWholeSkin('man', worn as PublicEquipment[])).toBeUndefined()
    }
    expect(resolveWholeSkin('girl', equipment)).toBeUndefined()
    expect(wholeSkinUrl('unknown')).toBeUndefined()
  })
  it('previews the whole set without changing saved equipment or inventory', () => {
    expect(equipment).toHaveLength(5)
    expect(items.every(item => !item.equipped)).toBe(true)
    expect(previewEquipment(items, 999)).toBeNull()
    expect(resolveWholeSkin('man', [])).toBeUndefined()
  })
  it('removes all five pieces when another hair, face or garment is worn', () => {
    for (const equipSlot of equipSlots) {
      const other: OwnedItem = { ...items[0]!, userItemId: 6, item: { ...items[0]!.item,
        itemId: 6, itemCode: 'OTHER', equipSlot, setCode: null, imageKey: 'outfit/man/d' } }
      const saved = [...items.map(item => ({ ...item, equipped: true })), other]
      expect(wearing(saved, other).map(item => item.userItemId)).toEqual([6])
      expect(resolveWholeSkin('man', previewEquipment(saved, 6)!)).toBeUndefined()
    }
  })
})
