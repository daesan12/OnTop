import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as config from '../../src/config'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const server = json('../../../backend/src/main/resources/world/park.json')
const facilities = json('../../../backend/src/main/resources/world/facilities.json')
const plain = (value: unknown) => JSON.parse(JSON.stringify(value))

describe('FE legacy map against the committed BE collision-feedback data', () => {
  it('matches the provenance fingerprint and facility version, not an arbitrary replacement string', () => {
    const manifest = readFileSync(new URL('../../../docs/integration/collision-feedback/source-manifest.json', import.meta.url))
    expect(server.schemaVersion).toBe(1)
    expect(createHash('sha256').update(manifest).digest('hex')).toBe(EXPECTED_MAP_VERSION)
    expect(server.sourceSha256).toBe(EXPECTED_MAP_VERSION)
    expect(facilities.mapVersion).toBe(EXPECTED_MAP_VERSION)
  })
  it('matches every authoritative collider including the circular fountain and all 28 outdoor seats', () => {
    const boxes = config.WORLD_COLLIDERS.filter(b => !config.staticStructureBatch(b.id)).map(b => {
      const half = [...(b.movementHalf ?? b.half)]
      if (b.movementHeight !== undefined) half[1] = b.movementHeight / 2
      return { id: b.id, half, center: [b.center[0], b.center[1] - b.half[1] + half[1]!, b.center[2]], yaw: b.movementYaw ?? 0 }
    })
    expect(boxes).toEqual(server.boxes)
    expect(boxes).toHaveLength(1205)
    expect(boxes.filter(b => b.id.startsWith('fountain-basin-'))).toHaveLength(48)
    expect(boxes.filter(b => /-stone-seat-|-stool-/.test(b.id))).toHaveLength(28)
  })
  it('preserves terrain, structures, spawn, water, movement settings and table placements', () => {
    for (const [key, value] of Object.entries({ world: config.WORLD, movement: config.MOVEMENT,
      lake: config.LAKE, swimming: config.SWIMMING, tower: config.OBSERVATION_TOWER,
      tables: config.TABLES, steppingStones: config.STEPPING_STONES })) expect(plain(value), key).toEqual(server[key])
    expect(plain(config.spawnPosition(0))).toEqual(server.spawn.first)
    const mesh = (id: string, data: { vertices: ArrayLike<number>; indices: ArrayLike<number> }) =>
      ({ id, vertices: Array.from(data.vertices), indices: Array.from(data.indices) })
    expect([
      mesh('terrain', config.createTerrainMesh()), mesh('pavilion-stairs', config.createPavilionStairs()),
      mesh('tower', config.mergeCollisionMeshes([config.createTowerRamp(), config.createTowerDeck(), config.createTowerRailCollision()])),
      mesh('pavilion-fences', config.boxesToCollisionMesh(config.pavilionFenceBounds())),
    ]).toEqual(server.meshes)
    const hulls = config.PARK_PAVILIONS.map(p => {
      const vertices: number[] = []
      for (const y of [p.ground, p.floor]) for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + i * Math.PI / 4
        vertices.push(p.x + Math.cos(a) * config.PAVILION.radius * p.scale, y, p.z + Math.sin(a) * config.PAVILION.radius * p.scale)
      }
      return { id: p.id, vertices }
    })
    expect(hulls).toEqual(server.hulls)
  })
})
