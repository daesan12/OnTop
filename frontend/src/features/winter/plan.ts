/** 통행로·게임 진입점 바깥의 고정 겨울 장식. 충돌과 렌더링이 같은 배치를 사용한다. */
export const WINTER_DECOR = [
  { id: 'plaza-tree', kind: 'tree', x: 0, z: 38, radius: 2.5, height: 7.8 },
  { id: 'santa', kind: 'santa', x: 4, z: 42, radius: .55, height: 2.8 },
  { id: 'entry-snowman', kind: 'snowman', x: -5, z: 98, radius: .85, height: 3.1 },
  { id: 'plaza-snowman', kind: 'snowman', x: 0, z: 48, radius: .85, height: 3.1 },
  { id: 'lake-snowman', kind: 'snowman', x: 47, z: 33, radius: .85, height: 3.1 },
  { id: 'tree-gifts', kind: 'gifts', x: -3.7, z: 38, radius: 1.25, height: 1.3 },
  { id: 'plaza-gifts', kind: 'gifts', x: 3.7, z: 36, radius: 1.25, height: 1.3 },
] as const
export const SANTA = WINTER_DECOR[1]!
