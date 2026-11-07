import { expect, it } from 'vitest'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { parkExteriorGeometry } from '../../src/features/skewer/chef/parkExteriorGeometry'

it('현재 공원 원본은 보존하고 식당 바깥 삼각형과 보간한 색상만 복사한다', () => {
  const source = new BufferGeometry()
  source.setAttribute('position', new Float32BufferAttribute([-1, 0, -1, 1, 0, 1, -1, 0, 1, 100, 0, 5, 101, 0, 5, 100, 0, 6], 3))
  source.setAttribute('color', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 3))
  const before = [...source.getAttribute('position').array]
  const result = parkExteriorGeometry(source, { x: 0, z: 0, halfWidth: 10, depth: 20 })
  const positions = result.getAttribute('position')
  expect(positions.count).toBe(6)
  for (let i = 0; i < positions.count; i++) {
    expect(positions.getZ(i)).toBeGreaterThanOrEqual(0)
    expect(Math.abs(positions.getX(i))).toBeLessThanOrEqual(1)
  }
  expect(result.getAttribute('color').count).toBe(positions.count)
  expect([...source.getAttribute('position').array]).toEqual(before)
  expect(result).not.toBe(source)
  result.dispose(); source.dispose()
})
