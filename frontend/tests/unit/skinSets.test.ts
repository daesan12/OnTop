import { describe, it, expect } from 'vitest'
import { occupies, overlaps, places, placeNames } from '../../src/features/skins/sets'
import type { SkinEntry, SkinSlot } from '../../src/features/skins/api'
const item = (id: string, slots: SkinSlot[]): SkinEntry => ({ id, definition: { productCode: id, name: id, grade: 2, compatibility: 'ANY', wearMode: 'PARTS', slots }, state: 'PUBLISHED', version: 1, publishedUploadId: id, updatedAt: '' })
describe('세트 점유는 머리·얼굴·옷 세 칸', () => {
  it('머리+얼굴은 한 아이템으로 두 칸을 차지하고 옷과는 겹치지 않는다', () => {
    const head = item('head', ['HAIR', 'FACE']), clothes = item('robe', ['TOP', 'BOTTOM', 'SHOES'])
    expect(places).toEqual(['HAIR', 'FACE', 'OUTFIT'])
    expect(placeNames(head)).toBe('머리·얼굴'); expect(placeNames(clothes)).toBe('옷')
    expect(occupies(head, 'HAIR')).toBe(true);expect(occupies(head, 'FACE')).toBe(true)
    expect(overlaps([head], clothes)).toBe(false)
    expect(overlaps([head], item('hat', ['HAIR']))).toBe(true)
    expect(overlaps([head], item('face', ['FACE']))).toBe(true)
  })
  it('선택 아이템 자체는 제거 가능하고 빼면 모든 부위가 풀린다', () => {
    const head = item('head', ['HAIR', 'FACE'])
    expect(overlaps([head], head)).toBe(false)
    expect(overlaps([], item('hat', ['HAIR']))).toBe(false)
    expect(overlaps([], item('face', ['FACE']))).toBe(false)
  })
  it('전체 통합은 세 칸 모두를 차지한다', () => {
    const whole = item('whole', ['HAIR', 'FACE', 'TOP', 'BOTTOM', 'SHOES'])
    expect(places.every(p => occupies(whole, p))).toBe(true)
    expect(overlaps([whole], item('robe', ['TOP', 'BOTTOM', 'SHOES']))).toBe(true)
  })
})

import { skinModelMode } from '../../src/features/skins/api'
function modelFile(doc: unknown) {
  const json = new TextEncoder().encode(JSON.stringify(doc)), bytes = new Uint8Array(20 + json.length), view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true)
  view.setUint32(12, json.length, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(json, 20)
  return new File([bytes], 'outfit.glb')
}
it('전체 슬롯을 가진 분리 모델도 파일 조각을 보고 PARTS로 판정한다', async () => {
  expect(await skinModelMode(modelFile({ meshes: [{extras: {pieces: [['item__HAIR__a',0,3],['item__FACE__a',3,3],['item__TOP__a',6,3],['item__BOTTOM__a',9,3],['item__SHOES__a',12,3]]}}] }))).toBe('PARTS')
  expect(await skinModelMode(modelFile({ nodes: [{extras: {pieces: [['item__HAIR__a',0,3]]}}] }))).toBe('PARTS')
})
it('통합 외형 파일은 WHOLE로 판정하고 잘못된 파일은 거절한다', async () => {
  expect(await skinModelMode(modelFile({ nodes: [{name:'CharacterRig'}], meshes: [{}] }))).toBe('WHOLE')
  expect(await skinModelMode(modelFile({meshes:[{extras:{pieces:[['body',0,3],['item__HAIR__a',3,3]]}}]}))).toBe('WHOLE')
  await expect(skinModelMode(new File(['not a model'], 'broken.glb'))).rejects.toThrow()
})
