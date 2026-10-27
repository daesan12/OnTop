import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { FOUNTAIN, TABLES, WORLD_COLLIDERS, tableSeats } from '../../src/config'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'

describe('feedback collision manifest for server handoff', () => {
  it('matches the approved server map, facilities and baked feedback collision shapes', () => {
    const baked = JSON.parse(readFileSync('../backend/src/main/resources/world/park.json', 'utf8'))
    const facilities = JSON.parse(readFileSync('../backend/src/main/resources/world/facilities.json', 'utf8'))
    expect(baked.sourceSha256).toBe(EXPECTED_MAP_VERSION)
    expect(facilities.mapVersion).toBe(EXPECTED_MAP_VERSION)
    const shapes = WORLD_COLLIDERS.filter(b => b.id.startsWith('fountain-basin-')
      || b.id.includes('-stone-seat-') || b.id.includes('-stool-'))
    expect(shapes).toHaveLength(76)
    expect(baked.boxes.some((b: { id: string }) => b.id === 'fountain-basin')).toBe(false)
    for (const shape of shapes) {
      const server = baked.boxes.find((b: { id: string }) => b.id === shape.id)
      expect(server, shape.id).toBeDefined()
      const halfY = shape.movementHeight! / 2
      expect(server.center).toEqual([shape.center[0], shape.center[1] - shape.half[1] + halfY, shape.center[2]])
      expect(server.half).toEqual([shape.half[0], halfY, shape.half[2]])
      expect(server.yaw).toBe(shape.movementYaw ?? 0)
    }
  })
  it('encloses the circular fountain base without blocking the old square corners', () => {
    const boxes = WORLD_COLLIDERS.filter(b => b.id.startsWith('fountain-basin-'))
    const contains = (x: number, z: number) => boxes.some(b => Math.abs(x - b.center[0]) <= b.half[0] + 1e-8 && Math.abs(z - b.center[2]) <= b.half[2] + 1e-8)
    for (let i = 0; i < 720; i++) {
      const a = i * Math.PI / 360
      expect(contains(FOUNTAIN.x + Math.cos(a) * 5.4, FOUNTAIN.z + Math.sin(a) * 5.4)).toBe(true)
    }
    for (const x of [-4.5, 4.5]) for (const z of [-4.5, 4.5]) expect(contains(FOUNTAIN.x + x, FOUNTAIN.z + z)).toBe(false)
    expect(new Set(WORLD_COLLIDERS.map(b => b.id)).size).toBe(WORLD_COLLIDERS.length)
  })
  it('includes every stone seat and prevents low stools being auto-stepped through', () => {
    for (const t of TABLES.filter(t => !t.pavilionId)) for (const [i, seat] of tableSeats(t).entries()) {
      const box = WORLD_COLLIDERS.find(b => b.id === `${t.id}-${t.picnicId ? 'stool' : 'stone-seat'}-${i}`)!
      expect(box).toBeDefined()
      expect(box.center[0]).toBe(t.position[0] + seat.x)
      expect(box.center[2]).toBe(t.position[2] + seat.z)
      expect(box.movementHeight).toBe(2.5)
    }
  })
})
