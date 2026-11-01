import { expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { notesBoardArt } from '../../src/world/art/notesBoardGeometry'
import { NOTES_BOARD_BODY, NOTES_BOARD_SCALE } from '../../src/config/notes'
import { PARK_DATA, PARK_DEFINITION, resolveParkLayout } from '../../src/map/park'

it('keeps both notes-board LODs within the authoring envelope and makes the distant model cheaper', () => {
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
    expect(bounds.min.x * NOTES_BOARD_SCALE).toBeGreaterThanOrEqual(-NOTES_BOARD_BODY.halfWidth)
    expect(bounds.max.x * NOTES_BOARD_SCALE).toBeLessThanOrEqual(NOTES_BOARD_BODY.halfWidth)
    expect(bounds.min.z * NOTES_BOARD_SCALE).toBeGreaterThanOrEqual(-NOTES_BOARD_BODY.halfDepth)
    expect(bounds.max.z * NOTES_BOARD_SCALE).toBeLessThanOrEqual(NOTES_BOARD_BODY.halfDepth)
    expect(bounds.max.y * NOTES_BOARD_SCALE).toBeLessThanOrEqual(NOTES_BOARD_BODY.height)
    counts.push(triangles)
  }
  expect(counts[1]!).toBeLessThan(counts[0]! * .7)
})

it('moves the solid memo body and its reachable front with the summit', () => {
  const notes = PARK_DATA.interactions.notes
  const body = PARK_DATA.physics.boxes.find(box => box.id === 'tower-notes-board')!
  expect(body.role).toBe('solid')
  expect(body.half).toEqual([NOTES_BOARD_BODY.halfWidth, NOTES_BOARD_BODY.height / 2, NOTES_BOARD_BODY.halfDepth])
  expect(body.center).toEqual([notes.position[0], notes.position[1] + body.half[1], notes.position[2]])
  // The avatar can stand in front of the body while remaining in interaction range.
  expect(body.half[2] + .4).toBeLessThan(notes.radius)
  const definition = structuredClone(PARK_DEFINITION)
  definition.sites.tower.x += 3
  definition.sites.tower.z -= 2
  const moved = resolveParkLayout(definition).data
  const next = moved.physics.boxes.find(box => box.id === body.id)!
  expect(next.center).toEqual([body.center[0] + 3, body.center[1], body.center[2] - 2])
  expect(next.half).toEqual(body.half)
})
