import { expect, it } from 'vitest'
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, SphereGeometry, Uint8BufferAttribute } from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { weldStaticVertices } from '../../src/world/art/weldStaticVertices'

function equivalent(source: BufferGeometry, tolerance = 1e-6) {
  const expected = mergeVertices(source, tolerance), actual = weldStaticVertices(source, tolerance)
  expect(actual.index?.array).toEqual(expected.index?.array)
  expect(Object.keys(actual.attributes)).toEqual(Object.keys(expected.attributes))
  for (const name of Object.keys(expected.attributes)) {
    expect(actual.getAttribute(name).array).toEqual(expected.getAttribute(name).array)
    expect(actual.getAttribute(name).normalized).toBe(expected.getAttribute(name).normalized)
  }
  expect(actual.groups).toEqual(expected.groups)
  expect(actual.drawRange).toEqual(expected.drawRange)
  expect(actual.userData).toEqual(expected.userData)
  expected.dispose(); actual.dispose()
}

it('preserves every triangle, UV/normal/color/finish seam and metadata of static props', () => {
  const box = new BoxGeometry().toNonIndexed(), sphere = new SphereGeometry(1, 12, 8).toNonIndexed()
  const geometry = mergeGeometries([box, sphere])!
  const count = geometry.getAttribute('position').count
  geometry.setAttribute('color', new Float32BufferAttribute(Array.from({ length: count * 3 }, (_, i) => (i % 7) / 7), 3))
  geometry.setAttribute('surfaceFinish', new Float32BufferAttribute(Array.from({ length: count * 2 }, (_, i) => i % 5), 2))
  geometry.addGroup(0, 36, 1); geometry.setDrawRange(3, 99); geometry.userData.kind = 'static'
  const original = geometry.getAttribute('position').array.slice()
  equivalent(geometry)
  expect(geometry.getAttribute('position').array).toEqual(original)
  box.dispose(); sphere.dispose(); geometry.dispose()
})

it('resolves numeric hash collisions without merging different large coordinates', () => {
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([
    0, 0, 0, 4294967296, 0, 0, -4294967296, 0, 0, 0, 0, 0,
  ], 3))
  equivalent(geometry, 1)
  geometry.dispose()
})

it('matches tolerance rounding on negative coordinates and indexed sources', () => {
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([
    -.00000049, .00000049, 0, -.00000051, .00000051, 0, -1, 1, 2,
  ], 3)).setIndex([2, 0, 1, 0, 2, 1])
  equivalent(geometry)
  geometry.dispose()
})

it.each([0, .03, .1, 2e-5, 1e-8])('matches the reference rounding at tolerance %s', tolerance => {
  const geometry = new SphereGeometry(1, 12, 8).toNonIndexed()
  equivalent(geometry, tolerance)
  geometry.dispose()
})

it('uses the general utility for non-finite vertex data', () => {
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([
    NaN, 0, 0, NaN, 0, 0, Infinity, 0, 0,
  ], 3))
  equivalent(geometry)
  geometry.dispose()
})

it('retains the general path for normalized and morph attributes', () => {
  const geometry = new BoxGeometry()
  geometry.setAttribute('color', new Uint8BufferAttribute(Array(geometry.getAttribute('position').count * 3).fill(128), 3, true))
  geometry.morphAttributes.position = [geometry.getAttribute('position').clone()]
  equivalent(geometry)
  const actual = weldStaticVertices(geometry), expected = mergeVertices(geometry, 1e-6)
  expect(actual.morphAttributes.position?.[0]?.array).toEqual(expected.morphAttributes.position?.[0]?.array)
  actual.dispose(); expected.dispose(); geometry.dispose()
})

it('uses 32-bit indices when the unique vertex count exceeds the 16-bit range', () => {
  const positions = new Float32Array(65536 * 3)
  for (let i = 0; i < 65536; i++) positions[i * 3] = i
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3))
  equivalent(geometry)
  geometry.dispose()
})
