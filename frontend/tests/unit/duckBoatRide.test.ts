import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { duckBoatRidePose, duckBoatSeatPose, routeLength, type DuckBoatRoute } from '../../park-renewal-preview/duckBoatRidePath'
import { buildDuckBoatRoute, buildRenewalBoats, DUCK_BOAT_PICKUP } from '../../park-renewal-preview/live/boats'
import { LAKE, deckHeightAt, inLake, site } from '../../park-renewal-preview/plan'
import { boatPlacement } from '../../src/features/duckBoat/model'
import type { FacilityLease } from '../../src/features/facilities/protocol'

const map = JSON.parse(readFileSync(new URL('../../generated/park-renewal/server-map.json', import.meta.url), 'utf8'))
const generated = map.data.interactions.boats[0]
const route: DuckBoatRoute = generated.route

describe('오리배 운항 경로', () => {
  it('생성된 서버 맵이 현재 경로·선착장 코드와 같다', () => {
    expect(JSON.parse(JSON.stringify(buildRenewalBoats()))).toEqual(map.data.interactions.boats)
    expect(map.data.interactions.construction.map((c: { id: string }) => c.id)).not.toContain('dock')
  })

  it('한 바퀴 1분 동안 선착장 앞에서 출발해 같은 자리로 돌아온다', () => {
    expect(route.seconds).toBe(60)
    const start = duckBoatRidePose(route, 0), end = duckBoatRidePose(route, 60), half = duckBoatRidePose(route, 30)
    expect([start.x, start.z]).toEqual([...DUCK_BOAT_PICKUP])
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(1e-9)
    expect(half.z).toBeLessThan(LAKE.z - 15)
    // Departs facing the lake (-Z), returns facing the dock (+Z).
    expect(Math.cos(start.riderYaw)).toBeLessThan(-.99)
    expect(Math.cos(duckBoatRidePose(route, 59.95).riderYaw)).toBeGreaterThan(.95)
    expect(routeLength(route) / route.seconds).toBeGreaterThan(1.5)
    expect(routeLength(route) / route.seconds).toBeLessThan(3)
  })

  it('선체가 물 위에만 있고 데크·섬·묶인 배와 겹치지 않는다', () => {
    const dock = site('dock'), moored = [-2.1, 2.1].map(dx => [dock.x + dx, dock.z - 3.7])
    // Collider half extents for water/deck/island; visual GLB half extents for the moored neighbours.
    const hull = [[0, 0], [.83, 1.45], [-.83, 1.45], [.83, -1.45], [-.83, -1.45], [.83, 0], [-.83, 0], [0, 1.45], [0, -1.45]]
    const visual = [[1.227, 2.37], [-1.227, 2.37], [1.227, -2.1], [-1.227, -2.1], [1.227, 0], [-1.227, 0]]
    for (let t = 0; t <= 60; t += .1) {
      const p = duckBoatRidePose(route, t), c = Math.cos(p.boatYaw), s = Math.sin(p.boatYaw)
      const world = ([lx, lz]: number[]) => [p.x + lx! * c + lz! * s, p.z - lx! * s + lz! * c] as const
      for (const sample of hull) {
        const [x, z] = world(sample)
        expect(inLake(x, z), `t=${t.toFixed(1)} (${x.toFixed(2)},${z.toFixed(2)})`).toBe(true)
        expect(deckHeightAt(x, z), `t=${t.toFixed(1)} deck`).toBeNull()
      }
      for (const sample of visual) {
        const [x, z] = world(sample)
        for (const [mx, mz] of moored) expect(Math.abs(x - mx!) < 1.227 && z > mz! - 2.37 && z < mz! + 2.1, `t=${t.toFixed(1)} moored`).toBe(false)
      }
    }
  })

  it('좌석 자세는 배를 따라 돌고 탑승자는 진행 방향을 본다', () => {
    const boat = duckBoatRidePose(route, 12), left = duckBoatSeatPose(route, boat, 0), right = duckBoatSeatPose(route, boat, 1)
    expect(Math.hypot(left.x - right.x, left.z - right.z)).toBeCloseTo(.94, 5)
    expect(left.yaw).toBe(boat.riderYaw)
    expect(left.y).toBeCloseTo(LAKE.y + .08 + 1.06, 6)
  })

  it('코드로 만든 경로의 진입로 시간이 출발 간격 10초보다 짧다', () => {
    const built = buildDuckBoatRoute()
    expect(built.laneSeconds).toBeGreaterThan(0)
    expect(built.laneSeconds * 2).toBeLessThan(10)
  })
})

describe('오리배 이용권 좌석 해석', () => {
  const lease = (seatIndex: number) => ({ kind: 'BOAT', seatIndex } as FacilityLease)
  const team = { slot: 1, members: ['a', 'b'], phase: 'READY' as const, partnerId: null, deadline: null, departAt: 9_000 }
  const boats = { fare: 30, lapMillis: 60_000, teams: [team], trips: [{ boat: 1, departedAt: 5_000 }] }

  it('0~3번은 두 팀의 대기 자리, 4번부터는 배마다 두 좌석이다', () => {
    expect(boatPlacement(lease(3), boats)).toEqual({ phase: 'queue', team, spot: 1 })
    expect(boatPlacement(lease(0), boats)).toEqual({ phase: 'queue', team: null, spot: 0 })
    expect(boatPlacement(lease(7), boats)).toEqual({ phase: 'riding', boat: 1, seat: 1, departedAt: 5_000 })
    expect(boatPlacement(lease(4), boats)).toBeNull()
    expect(boatPlacement({ kind: 'BENCH', seatIndex: 0 } as FacilityLease, boats)).toBeNull()
  })
})

describe('오리배 대기 자리', () => {
  it('두 팀이 묶인 배 옆 손가락 데크에 서고 각자 옆의 배를 본다', () => {
    const dock = site('dock'), [boat] = buildRenewalBoats()
    expect(boat!.queue).toHaveLength(4)
    for (const [i, spot] of boat!.queue.entries()) {
      const side = i < 2 ? -1 : 1
      expect(Math.sign(spot.x - dock.x)).toBe(side)
      expect(deckHeightAt(spot.x, spot.z)).toBeCloseTo(LAKE.y + .65 * 1.25, 6)
      // Faces the moored boat on the inner side of its finger.
      expect(Math.sign(Math.sin(spot.yaw))).toBe(-side)
    }
  })
})
