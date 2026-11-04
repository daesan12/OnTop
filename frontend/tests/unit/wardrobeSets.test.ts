import { describe, expect, it } from 'vitest'
import type { OwnedItem } from '../../src/features/shop/contracts'
import { itemLabel, previewEquipment, wearing } from '../../src/features/wardrobe/state'

const own = (userItemId: number, equipSlot: OwnedItem['item']['equipSlot'], name: string, setCode?: string, equipped = false): OwnedItem =>
  ({ userItemId, quantity: 1, equipped, item: { itemId: userItemId, itemCode: `I${userItemId}`, name, itemType: 'EQUIPMENT', equipSlot,
    price: 0, imageKey: setCode ? 'outfit/general/g' : `outfit/girl/${userItemId}`, ...(setCode ? { setCode } : {}) } })
const set = [own(1, 'HAIR', '장군 투구', 'GENERAL'), own(2, 'FACE', '장군 선글라스', 'GENERAL'), own(3, 'TOP', '장군 갑옷', 'GENERAL'),
  own(4, 'BOTTOM', '장군 바지', 'GENERAL'), own(5, 'SHOES', '장군 장화', 'GENERAL')]

describe('wardrobe sets (the server rule, previewed)', () => {
  it('wears a whole set from any piece and takes the old items in those slots off', () => {
    const items = [...set, own(6, 'TOP', '분홍 후드티', undefined, true)]
    expect(wearing(items, items[3]!).map(owned => owned.userItemId).sort()).toEqual([1, 2, 3, 4, 5])
    expect(previewEquipment(items, 2)!.map(item => item.equipSlot).sort()).toEqual(['BOTTOM', 'FACE', 'HAIR', 'SHOES', 'TOP'])
  })
  it('takes a whole set off when another item goes on one of its slots', () => {
    const items = [...set.map(owned => ({ ...owned, equipped: true })), own(6, 'TOP', '분홍 후드티')]
    expect(wearing(items, items[5]!).map(owned => owned.userItemId)).toEqual([6])
  })
  it('keeps the other slots when a single item goes on', () => {
    const items = [own(6, 'TOP', '분홍 후드티', undefined, true), own(7, 'HAIR', '단발머리')]
    expect(wearing(items, items[1]!).map(owned => owned.userItemId)).toEqual([6, 7])
  })
  it('wears the outfit as one: a single top takes the other outfit pieces off and keeps the head', () => {
    const items = [own(6, 'TOP', '분홍 후드티'), own(7, 'HAIR', '단발머리', undefined, true), own(8, 'BOTTOM', '흰 바지', undefined, true)]
    expect(wearing(items, items[0]!).map(owned => owned.userItemId).sort()).toEqual([6, 7])
  })
  it('names a set by its pieces', () => {
    expect(itemLabel(set, set[0]!)).toBe('장군 세트')
    expect(itemLabel([own(6, 'TOP', '분홍 후드티')], own(6, 'TOP', '분홍 후드티'))).toBe('분홍 후드티')
  })
})
