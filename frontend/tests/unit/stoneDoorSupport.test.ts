import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import RAPIER from '@dimforge/rapier3d-compat'
import { gunzipSync } from 'node:zlib'
import { decodeStaticPark } from '../../park-renewal-preview/static/codec'
import { installStaticPark } from '../../park-renewal-preview/static/store'
import { addGeneratedPredictionColliders } from '../../src/network/predictionMap'
import { stoneDoorApproach } from '../../park-renewal-preview/interiorAccess'
const bytes = gunzipSync(readFileSync(new URL('../../park-renewal-preview/original-park.bin.gz', import.meta.url)))
installStaticPark(decodeStaticPark(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
const { groundSurfaceHeight } = await import('../../park-renewal-preview/groundSurface')

const artifact = JSON.parse(readFileSync(new URL('../../generated/park-renewal/server-map.json', import.meta.url), 'utf8'))
let world: RAPIER.World
beforeAll(async () => {
  await RAPIER.init()
  world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  addGeneratedPredictionColliders(world, artifact.data.physics)
  world.step()
})
afterAll(() => { world?.free(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('계단 아래 돌문 바깥 지면', () => {
  it('돌문 양옆의 보이는 지면과 충돌면 높이가 일치한다', () => {
    const gaps: string[] = []
    for (let x = 2.75; x <= 7.75; x += .5) for (let z = -48.25; z <= -38.25; z += .5) {
      const ground = groundSurfaceHeight(x, z)
      const hit = world.castRay(new RAPIER.Ray({ x, y: ground + .15, z }, { x: 0, y: -1, z: 0 }), .35, true)
      if (!hit) {
        const top = world.castRay(new RAPIER.Ray({ x, y: ground + 3, z }, { x: 0, y: -1, z: 0 }), 10, true)
        gaps.push(`${x},${z}: visible=${ground.toFixed(3)}, collision=${top ? (ground + 3 - top.timeOfImpact).toFixed(3) : 'none'}`)
      }
    }
    expect(gaps, gaps.slice(0, 25).join('; ')).toEqual([])
  })

  it('돌문 양옆을 왕복할 때 보이는 흙 아래로 발이 꺼지지 않는다', async () => {
    vi.stubGlobal('location', { hostname: 'localhost', search: '' })
    vi.stubEnv('MODE', 'park-renewal-integration')
    vi.stubEnv('DEV', true)
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => artifact }))
    vi.resetModules()
    const { createPredictionPhysics } = await import('../../src/network/predictionPhysics')
    const simulation = await createPredictionPhysics('PARK_V1')
    const stop = { dx: 0, dz: 0, run: false, jump: false }
    try {
      for (const x of [2.75, 3.4, 4.24, 5.8]) for (const z of [-47.75, -47, -45.5, -43.1, -40.5, -39]) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          simulation.reset({ x, y: groundSurfaceHeight(x, z) + .85, z, yaw: 0 }, 0, false)
          for (let i = 0; i < 30; i++) simulation.step(stop, 1 / 60)
          for (let i = 0; i < 30; i++) {
            simulation.step({ ...stop, dx: dx!, dz: dz! }, 1 / 60)
            const p = simulation.pose()
            if (p.x < stoneDoorApproach.x0 || p.x > stoneDoorApproach.x1
              || p.z < stoneDoorApproach.z0 || p.z > stoneDoorApproach.z1) break
            expect(p.y - groundSurfaceHeight(p.x, p.z), `${x},${z}: ${JSON.stringify(p)}`).toBeGreaterThan(.25)
          }
        }
      }
    } finally { simulation.dispose() }
  })
})
