export const TREE_TARGET = 50
export const TREE_ORNAMENTS = [
  { id: 'STOCKING', name: '포근한 양말', image: new URL('./assets/stocking.webp', import.meta.url).href, model: new URL('./assets/stocking.glb', import.meta.url).href },
  { id: 'BAUBLE', name: '반짝이는 구슬', image: new URL('./assets/bauble.webp', import.meta.url).href, model: new URL('./assets/bauble.glb', import.meta.url).href },
  { id: 'BELL', name: '금빛 종', image: new URL('./assets/bell.webp', import.meta.url).href, model: new URL('./assets/bell.glb', import.meta.url).href },
  { id: 'GIFT', name: '작은 선물', image: new URL('./assets/gift.webp', import.meta.url).href, model: new URL('./assets/gift.glb', import.meta.url).href },
] as const
export type TreeOrnamentKind = typeof TREE_ORNAMENTS[number]['id']
export type TreeOrnament = { id: number; ornament: TreeOrnamentKind }
export const isTreeOrnament = (value: unknown): value is TreeOrnamentKind => TREE_ORNAMENTS.some(item => item.id === value)

/** 기존 12m 트리의 72개 Memo_Anchor를 사용하고 ID 공백이 있어도 장식이 겹치지 않게 한다. */
export function treeOrnamentSlots(ornaments: readonly TreeOrnament[]) {
  const occupied = new Set<number>()
  return [...ornaments].sort((a, b) => a.id - b.id).slice(-50).map(item => {
    let slot = (item.id - 1) % 72
    while (occupied.has(slot)) slot = (slot + 1) % 72
    occupied.add(slot)
    return { ...item, anchor: `Memo_Anchor_${String(slot + 1).padStart(3, '0')}` }
  })
}
