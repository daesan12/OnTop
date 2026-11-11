import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry, Group, Mesh, SkinnedMesh } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { availableLook, coveredTokens, drawnVertices, lookKey, pieceGeometry, pieceShown, resolveLook, wornPiece } from '../../src/world/art/characterLook'
import type { PublicEquipment } from '../../src/network/equipment'

const file = (covers: unknown, skinned = true) => {
  const scene = new Group(), mesh = skinned ? new SkinnedMesh(new BufferGeometry()) : new Mesh(new BufferGeometry())
  mesh.userData.covers = covers; scene.add(mesh)
  return { scene } as unknown as GLTF
}

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
  it('shows a hat’s per-character hair only on that character', () => {
    const gat: PublicEquipment = { itemId: 8, itemCode: 'GAT_HAIR', equipSlot: 'HAIR', imageKey: 'outfit/gat/h' }
    const man = resolveLook('man', [gat]), girl = resolveLook('girl', [gat])
    expect(pieceShown('item__HAIR__h', 'gat', 'girl', girl)).toBe(true)
    expect(pieceShown('item__HAIR__h__for_girl', 'gat', 'girl', girl)).toBe(true)
    expect(pieceShown('item__HAIR__h__for_man', 'gat', 'girl', girl)).toBe(false)
    expect(pieceShown('item__HAIR__h__for_man', 'gat', 'man', man)).toBe(true)
    expect(pieceShown('item__HAIR__h__for_girl', 'gat', 'man', man)).toBe(false)
    expect(pieceShown('item__HAIR__h__for_girl', 'gat', 'girl', resolveLook('girl', []))).toBe(false)
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
  it('lets a worn workshop file hide the body like the wardrobe item it says it covers', () => {
    const boots = file(['SHOESg', 'BOTTOMg', 'HAIRg', 'not a token', 7]), hat = file(['HAIRh'])
    const look = { ...resolveLook('man', []), SHOES: { source: 'boots', id: 'a' }, BOTTOM: { source: 'boots', id: 'a' }, HAIR: { source: 'hat', id: 'a' } }
    const covered = coveredTokens(look, new Map([['boots', boots], ['hat', hat]]))
    expect([...covered].sort()).toEqual(['BOTTOMg', 'HAIRh', 'SHOESg'])               // HAIRg: the boots file is not worn as hair
    expect(pieceShown('body__SHOESg', 'man', 'man', look, covered)).toBe(false)
    expect(pieceShown('body__SHOESg', 'man', 'man', look)).toBe(true)                  // without covers the feet stay
    expect(pieceShown('body__HAIRg', 'man', 'man', look, covered)).toBe(true)
    expect(pieceShown('item__HAIR__g__for_girl__under_TOPh', 'general', 'girl', { HAIR: { source: 'general', id: 'g' } }, new Set(['TOPh']))).toBe(false)
    expect(pieceShown('item__SHOES__a', 'boots', 'man', look, covered)).toBe(true)
    expect(coveredTokens(look, undefined).size).toBe(0)
    const cleared = { ...look, HAIR: undefined } as unknown as typeof look                // a slot cleared to undefined
    expect([...coveredTokens(cleared, new Map([['boots', boots], ['hat', hat]]))].sort()).toEqual(['BOTTOMg', 'SHOESg'])
    expect(pieceShown('body__HAIRh', 'man', 'man', cleared)).toBe(true)
    expect(coveredTokens({ SHOES: { source: 'plain', id: 'a' } }, new Map([['plain', file(['SHOESg'], false)]])).size).toBe(0)
  })
})
