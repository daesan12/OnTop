import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createStoneTileGeometry } from '../../src/game/stone-rumble/tileGeometry'
import { STONE_TILE_SIZE } from '../../src/game/stone-rumble/layout'

it('깎인 모서리도 서버 육각 셀 안에 있고 상판 기준 높이가 이동하지 않는다', () => {
  const geometry = createStoneTileGeometry()
  try {
    geometry.computeBoundingBox()
    expect(geometry.boundingBox!.max.z).toBeCloseTo(0, 6)
    expect(geometry.boundingBox!.min.z).toBeLessThan(-.25)
    expect(geometry.boundingBox!.min.z).toBeGreaterThan(-.6)
    const position = geometry.getAttribute('position')
    const directions = Array.from({ length: 6 }, (_, i) => new Vector3(Math.cos(i * Math.PI / 3), Math.sin(i * Math.PI / 3), 0))
    for (let index = 0; index < position.count; index++) {
      const point = new Vector3().fromBufferAttribute(position, index)
      for (const direction of directions) expect(point.dot(direction)).toBeLessThan(STONE_TILE_SIZE / 2)
    }
  } finally { geometry.dispose() }
})

it('옆면 여섯 방향과 깎인 면이 실제 법선을 가져 시점에 따라 입체 면을 구별한다', () => {
  const geometry = createStoneTileGeometry()
  try {
    const normals = geometry.getAttribute('normal'), sides = new Set<string>()
    let chamfer = 0, cap = 0
    for (let index = 0; index < normals.count; index++) {
      const normal = new Vector3().fromBufferAttribute(normals, index)
      expect(normal.length()).toBeCloseTo(1, 5)
      if (Math.abs(normal.z) < .001) sides.add(`${normal.x.toFixed(3)},${normal.y.toFixed(3)}`)
      else if (Math.abs(normal.z) < .999) chamfer++
      else if (normal.z > .999) cap++
    }
    expect(sides.size).toBe(6)
    expect(chamfer).toBeGreaterThan(0)
    expect(cap).toBeGreaterThan(0)
  } finally { geometry.dispose() }
})
