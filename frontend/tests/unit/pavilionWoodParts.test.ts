import { expect, it } from 'vitest'
import { Box3, Matrix4, Object3D, Vector3 } from 'three'
import { pavilionWoodParts } from '../../src/features/tables/PavilionWoodTable'

it('keeps the original table footprint and chair/hardware counts when wood draws are combined', () => {
  const two = pavilionWoodParts(2), four = pavilionWoodParts(4)
  expect(two.body).toBe(four.body)
  expect(four.body).toHaveLength(22)
  expect(two.chairs).toHaveLength(46); expect(four.chairs).toHaveLength(92)
  expect(two.hardware).toHaveLength(8); expect(four.hardware).toHaveLength(12)
  const object = new Object3D(), bounds = new Box3(), unit = new Box3(new Vector3(-.5, -.5, -.5), new Vector3(.5, .5, .5))
  for (const part of four.body) {
    object.position.set(...part.p); object.scale.set(...part.s); object.rotation.set(...(part.r ?? [0, 0, 0])); object.updateMatrix()
    bounds.union(unit.clone().applyMatrix4(object.matrix as Matrix4))
  }
  expect(bounds.min.x).toBeCloseTo(-1.05); expect(bounds.max.x).toBeCloseTo(1.05)
  expect(bounds.min.z).toBeCloseTo(-.8); expect(bounds.max.z).toBeCloseTo(.8)
  expect(bounds.max.y).toBeCloseTo(1.06)
  expect(new Set(four.chairs.map(p => p.c)).size).toBeGreaterThan(3)
})
