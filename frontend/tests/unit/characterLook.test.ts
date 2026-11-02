import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry } from 'three'
import { availableLook, drawnVertices, lookKey, pieceGeometry, pieceShown, resolveLook, wornPiece } from '../../src/world/art/characterLook'
import type { PublicEquipment } from '../../src/network/equipment'

const general = (['HAIR', 'FACE', 'TOP', 'BOTTOM', 'SHOES'] as const).map((equipSlot, i): PublicEquipment =>
  ({ itemId: i + 1, itemCode: `GENERAL_${equipSlot}`, equipSlot, imageKey: 'outfit/general/g' }))

describe('character look (wardrobe pieces)', () => {
  it('reads only outfit/<file>/<item> image keys; other items keep the default outfit', () => {
    expect(wornPiece('outfit/general/g')).toEqual({ source: 'general', id: 'g' })
    expect(wornPiece('../general/g')).toBeNull()
    expect(wornPiece('outfit/General/g')).toBeNull()
    expect(wornPiece(null)).toBeNull()
    const look = resolveLook('man', [{ itemId: 9, itemCode: 'TEST', equipSlot: 'TOP', imageKey: 'test-top' }])
    expect(lookKey(look)).toBe('man/b|-|man/d|man/d|man/d')
    expect(lookKey(resolveLook('girl', general))).toBe('general/g|general/g|general/g|general/g|general/g')
  })
  it('hides body pieces under worn items and shows only the worn items of each file', () => {
    const look = resolveLook('man', general)
    expect(pieceShown('body', 'man', 'man', look)).toBe(true)
    expect(pieceShown('body__HAIRg', 'man', 'man', look)).toBe(false)
    expect(pieceShown('body__TOPb_TOPd', 'man', 'man', look)).toBe(true)
    expect(pieceShown('body', 'general', 'man', look)).toBe(false)                   // the body comes from the avatar's own file
    expect(pieceShown('item__TOP__g', 'general', 'man', look)).toBe(true)
    expect(pieceShown('item__TOP__d', 'man', 'man', look)).toBe(false)
    const plain = resolveLook('man', [])
    expect(pieceShown('item__TOP__d', 'man', 'man', plain)).toBe(true)
    expect(pieceShown('item__TOP__d', 'girl', 'man', plain)).toBe(false)              // the girl's pink hoodie is another item
    expect(pieceShown('body__TOPb_TOPd', 'man', 'man', plain)).toBe(false)
    expect(pieceShown('item__BOTTOM__d__under_TOPd', 'man', 'man', plain)).toBe(false)
    expect(pieceShown('item__BOTTOM__d__under_TOPb', 'man', 'man', plain)).toBe(true)
  })
  it('keeps the default in a slot until its file has arrived', () => {
    const look = resolveLook('girl', [general[2]!, { itemId: 7, itemCode: 'BOB', equipSlot: 'HAIR', imageKey: 'outfit/man/b' }])
    expect(lookKey(availableLook('girl', look, source => source !== 'general'))).toBe('man/b|-|girl/d|girl/d|girl/d')
  })
  it('draws the shown pieces from the shared attributes with one cached index per look', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(18), 3))
    geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 3, 4, 5]), 1))
    const ranges: [string, number, number][] = [['body', 0, 3], ['item__TOP__d', 3, 3]]
    const shown = pieceGeometry(geometry, ranges, name => name === 'item__TOP__d')
    expect(Array.from(shown.index!.array)).toEqual([3, 4, 5])
    expect(shown.getAttribute('position')).toBe(geometry.getAttribute('position'))
    expect(pieceGeometry(geometry, ranges, name => name === 'item__TOP__d')).toBe(shown)
    expect(Array.from(drawnVertices(shown)).sort()).toEqual([3, 4, 5])
  })
})
