import { describe, expect, it, vi } from 'vitest'
import { equipSlots, type PublicEquipment } from '../../src/network/equipment'
import { resolveWholeSkin, ssafyBlackMale, wholeSkinCompatible, wholeSkinUrl } from '../../src/world/art/wholeSkin'
import { previewEquipment, useWardrobe, wearing, wearPreviewedItem } from '../../src/features/wardrobe/state'
import type { OwnedItem } from '../../src/features/shop/contracts'
import { useSession } from '../../src/network/worldClient'
import { parkRuntime } from '../../src/park/runtime/runtime'

const items: OwnedItem[] = equipSlots.map((equipSlot, i) => ({
  userItemId: i + 1, quantity: 1, equipped: false,
  item: { itemId: i + 1, itemCode: `SSAFY_BLACK_MALE_V3_${equipSlot}`, name: `SSAFY 검정 후드 ${equipSlot}`,
    itemType: 'EQUIPMENT', equipSlot, price: 0, imageKey: ssafyBlackMale.imageKey, setCode: ssafyBlackMale.setCode },
}))
const equipment = previewEquipment(items, 3)!

describe('whole skin selection through public equipment', () => {
  it('checks the same compatibility rule for a card and the wear button', () => {
    expect(wholeSkinCompatible('man', ssafyBlackMale.imageKey)).toBe(true)
    expect(wholeSkinCompatible('girl', ssafyBlackMale.imageKey)).toBe(false)
    expect(wholeSkinCompatible('girl', 'outfit/gat/h')).toBe(true)
    expect(wholeSkinCompatible('man', null)).toBe(true)
  })
  it('sends no equipment request for an incompatible skin, even through a direct action', async () => {
    const beforeSession = useSession.getState(), beforeWardrobe = useWardrobe.getState()
    const request = vi.spyOn(parkRuntime, 'requestJSON')
    try {
      useSession.setState({ sessionId: 'skin-review', roomId: 'review', status: 'connected',
        profiles: { 'skin-review': { character: 'girl', nickname: '검수' } } })
      useWardrobe.setState({ open: true, owner: 'skin-review', items, previewId: 3, equipping: 0, loading: false })
      await wearPreviewedItem()
      expect(request).not.toHaveBeenCalled()
      expect(useWardrobe.getState().equipError).toBe('이 스킨은 남자 캐릭터 전용이에요.')
      expect(useWardrobe.getState().equipping).toBe(0)
    } finally {
      useSession.setState(beforeSession, true); useWardrobe.setState(beforeWardrobe, true); request.mockRestore()
    }
  })
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
