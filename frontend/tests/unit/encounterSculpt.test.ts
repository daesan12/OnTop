import { describe, expect, it } from 'vitest'
import { Box3, Vector3, type BufferGeometry } from 'three'
import {
  EYE_DIRS, HEAD_SCALE, faceShape, hairGeometry, handGeometry, headGeometry, hoodGeometry, limbGeometry, tatteredGeometry,
  teethGeometry,
} from '../../park-renewal-preview/encounterSculpt'

const finite = (g: BufferGeometry) => Array.from(g.getAttribute('position').array as Float32Array).every(Number.isFinite)
const size = (g: BufferGeometry) => new Box3().setFromBufferAttribute(g.getAttribute('position') as never).getSize(new Vector3())

describe('encounter sculpting (S15P31B105-450)', () => {
  it('sinks the eye sockets and opens the mouth of a face', () => {
    for (const d of EYE_DIRS) expect(faceShape(d, { mouth: 'gape', gaunt: 1 }).s).toBeLessThan(.9)
    expect(faceShape([0, -.55, .84], { mouth: 'scream', gaunt: 1 }).s).toBeLessThan(faceShape([0, -.55, .84], { mouth: 'shut', gaunt: 1 }).s)
  })

  it('builds a head of human size with baked shading', () => {
    const g = headGeometry({ mouth: 'gape', gaunt: 1.2 }), s = size(g)
    expect(finite(g)).toBe(true)
    expect(g.getAttribute('color')).toBeDefined()
    expect(s.y).toBeGreaterThan(HEAD_SCALE[1] * 1.6)
    expect(s.y).toBeLessThan(.7)
  })

  it('makes hands whose fingers point along +y from the wrist', () => {
    const g = handGeometry('test', { finger: .2, spread: .15, curl: .3, thick: .009 }), box = new Box3().setFromBufferAttribute(g.getAttribute('position') as never)
    expect(finite(g)).toBe(true)
    expect(box.max.y).toBeGreaterThan(.2)
    expect(box.min.y).toBeGreaterThan(-.05)
  })

  it('keeps hair, cloth, limbs, teeth and hoods finite and bounded', () => {
    for (const g of [hairGeometry('t', .8), hairGeometry('veil', .8, [0, -1, 0], true), tatteredGeometry('t', .3), limbGeometry('t', [[0, 0, 0], [0, .3, .1], [0, .6, 0]], [.05, .04, .03]), teethGeometry('t', 7, .03, .006, [0, -1, 0], .004), hoodGeometry()]) {
      expect(finite(g)).toBe(true)
      const s = size(g)
      expect(Math.max(s.x, s.y, s.z)).toBeLessThan(2.5)
    }
    // A veil adds the strands that hang over the face.
    expect(hairGeometry('veil2', .8, [0, -1, 0], true).getAttribute('position').count).toBeGreaterThan(hairGeometry('open2', .8).getAttribute('position').count)
  })
})
