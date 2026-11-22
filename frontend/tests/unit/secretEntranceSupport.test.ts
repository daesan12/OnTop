import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import RAPIER from '@dimforge/rapier3d-compat'
import { addGeneratedPredictionColliders } from '../../src/network/predictionMap'
import { accessAt, annex, interiorAccess } from '../../park-renewal-preview/interiorAccess'
import { HORROR_PORTALS } from '../../park-renewal-preview/horrorPlan'

const artifact = JSON.parse(readFileSync(new URL('../../generated/park-renewal/server-map.json', import.meta.url), 'utf8'))
const physics = artifact.data.physics as NonNullable<typeof import('../../src/park/renewalMap').renewalMap>['data']['physics']
  & { interiorAccess: { annex: typeof annex; routes: typeof interiorAccess } }
let world: RAPIER.World
beforeAll(async () => {
  await RAPIER.init()
  world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  addGeneratedPredictionColliders(world, physics)
  world.step()
})
afterAll(() => { world?.free(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('비밀 출입구 주변 지면 지지', () => {
  it('입구와 출구 절개 셀의 문턱 양옆에도 지면이 남는다', () => {
    for (const p of HORROR_PORTALS) for (const distance of [.4, .65, .9]) {
      for (const dz of [-1.85, -1.55, 1.55, 1.85]) {
        const ray = new RAPIER.Ray({ x: p.x + distance * p.outward, y: p.floor + 2, z: p.z + dz }, { x: 0, y: -1, z: 0 })
        const hit = world.castRay(ray, 3, true)
        expect(hit, `${p.id}: ${distance}, ${dz}`).not.toBeNull()
      }
    }
  })

  it('계단 아래 방 위의 지형을 제거하지 않고 출입 높이는 유지한다', () => {
    const terrain = physics.meshes[0]!, side = physics.terrain.columns
    const cuts = new Set(physics.secretTerrainCuts)
    for (let z = -47; z <= -39; z++) for (let x = -1; x <= 2; x++) {
      const face = ((z + 110 - 1) * (side - 1) + x + 110 - 1) * 2
      expect(cuts.has(face) || cuts.has(face + 1)).toBe(false)
      expect(terrain.vertices[((z + 110) * side + x + 110) * 3 + 1]).toBeGreaterThan(physics.interiorAccess.annex.ceiling)
    }
    for (const [name, route] of Object.entries(interiorAccess)) {
      const [x, y, z] = route.from
      expect(accessAt({ x, y, z }), name).toBe(name)
      expect(physics.interiorAccess.routes[name as keyof typeof interiorAccess]).toEqual(route)
    }
  })

  it('실제 예측 물리로 문 주변을 왕복해도 지하로 떨어지지 않는다', async () => {
    vi.stubGlobal('location', { hostname: 'localhost', search: '' })
    vi.stubEnv('MODE', 'park-renewal-integration')
    vi.stubEnv('DEV', true)
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => artifact }))
    vi.resetModules()
    const { renewalMap } = await import('../../src/park/renewalMap')
    expect(renewalMap?.mapVersion).toBe(artifact.mapVersion)
    const { createPredictionPhysics } = await import('../../src/network/predictionPhysics')
    const stop = { dx: 0, dz: 0, run: false, jump: false }
    const simulation = await createPredictionPhysics('PARK_V1')
    try {
      for (const p of HORROR_PORTALS) {
        simulation.reset({ x: p.x + p.outward * .65, y: p.floor + 1, z: p.z - 1.8, yaw: 0 }, 0, false)
        for (let i = 0; i < 45; i++) simulation.step(stop, 1 / 60)
        for (const dz of [1, -1]) for (let i = 0; i < 25; i++) {
          simulation.step({ ...stop, dz }, 1 / 60)
          expect(simulation.pose().y, `${p.id}: ${JSON.stringify(simulation.pose())}`).toBeGreaterThan(p.floor - 1)
        }
      }
      for (const route of Object.values(interiorAccess)) {
        const [x, y, z] = route.to
        simulation.reset({ x, y, z, yaw: route.yaw }, 0, false)
        for (let i = 0; i < 90; i++) simulation.step(stop, 1 / 60)
        expect(simulation.pose().y).toBeGreaterThan(y - .4)
      }
    } finally { simulation.dispose() }
  })
})
