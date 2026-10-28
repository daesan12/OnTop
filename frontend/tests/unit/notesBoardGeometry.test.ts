import { expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { notesBoardArt } from '../../src/world/art/notesBoardGeometry'

it('keeps both notes-board LODs within the unchanged summit collider and makes the distant model cheaper', () => {
  const counts: number[] = []
  for (const art of [notesBoardArt.near, notesBoardArt.far]) {
    const bounds = new Box3(), point = new Vector3()
    let triangles = 0
    for (const geometry of Object.values(art)) {
      const position = geometry.getAttribute('position')
      for (let i = 0; i < position.count; i++) bounds.expandByPoint(point.fromBufferAttribute(position, i))
      triangles += (geometry.index?.count ?? position.count) / 3
    }
    expect(bounds.min.x).toBeGreaterThanOrEqual(-.651)
    expect(bounds.max.x).toBeLessThanOrEqual(.651)
    expect(bounds.min.z).toBeGreaterThanOrEqual(-.481)
    expect(bounds.max.z).toBeLessThanOrEqual(.481)
    expect(bounds.min.y).toBeGreaterThanOrEqual(-.001)
    expect(bounds.max.y).toBeLessThanOrEqual(1.721)
    counts.push(triangles)
  }
  expect(counts[1]!).toBeLessThan(counts[0]! * .7)
})
