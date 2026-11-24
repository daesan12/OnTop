import { expect, it } from 'vitest'
import { DRAW_MS, flightPose, pendingPose, supplyPose, uniformTileScale } from '../../src/game/davinci/layout'
import { newTileEvent, noteLiveMatch, victoryStampUntil } from '../../src/game/davinci/effects'
import type { DavinciState } from '../../src/game/davinci/protocol'

it('긴 손패에 맞춘 공통 배율로 모든 좌석이 테이블 폭 안에 들어간다', () => {
  for (const count of [3, 4, 9, 18, 26]) {
    const rows = [{ slot: 0, count: 4 }, { slot: 1, count }, { slot: 2, count: 8 }, { slot: 3, count: 3 }]
    const scale = uniformTileScale(rows)
    expect(scale).toBeGreaterThan(0); expect(scale).toBeLessThanOrEqual(1)
    for (const row of rows) expect(row.count * .69 * scale).toBeLessThanOrEqual(row.slot % 2 ? 4.8 : 7.1)
  }
})
it('동일 크기의 중앙 패 18개는 뽑기 전부터 서로 다른 충분한 간격으로 배치한다', () => {
  const centers = Array.from({ length: 18 }, (_, i) => {
    const p = supplyPose(i, 18, 1)
    return { x: p.x + Math.sin(p.yaw) * .445, z: p.z + Math.cos(p.yaw) * .445 }
  })
  for (let i = 0; i < centers.length; i++) for (let j = i + 1; j < centers.length; j++) {
    const a = centers[i]!, b = centers[j]!
    expect(Math.abs(a.x - b.x) >= .7 || Math.abs(a.z - b.z) >= 1).toBe(true)
  }
})
it('뽑기 이동은 중앙에서 시작해 내 자리에서 끝나고 모션 감소 시 즉시 도착한다', () => {
  const from = supplyPose(7, 18, 1), to = pendingPose(0)
  expect(flightPose(from, to, 0)).toEqual(from)
  const end = flightPose(from, to, 1)
  expect(end.x).toBeCloseTo(to.x); expect(end.y).toBeCloseTo(to.y); expect(end.z).toBeCloseTo(to.z); expect(end.tilt).toBe(0)
  expect(flightPose(from, to, .5).y).toBeGreaterThan(Math.max(from.y, to.y))
  expect(flightPose(from, to, 1 / DRAW_MS, true)).toEqual(end)
})
it('배치·중복·낡은 스냅샷은 뽑기나 정답 반응을 재생하지 않는다', () => {
  const base = { version: 2, lastEvent: { kind: 'DRAW', tileId: 'tile', actorUserId: '101', targetUserId: null, value: null, correct: null } } as DavinciState
  expect(newTileEvent(null, base)).toBeNull()
  expect(newTileEvent(base, { ...base, version: 3 })).toBeNull()
  expect(newTileEvent(base, { ...base, version: 1 })).toBeNull()
  const correct = { ...base, version: 4, lastEvent: { ...base.lastEvent!, kind: 'GUESS' as const, correct: true } }
  expect(newTileEvent(base, correct)?.correct).toBe(true)
  expect(newTileEvent(correct, correct)).toBeNull()
})
it('승리 도장은 직접 본 최근 경기에서 한 번만 표시하고 재조회·다른 경기는 건너뛴다', () => {
  expect(victoryStampUntil('unknown', 100)).toBe(0)
  noteLiveMatch('live', 100)
  expect(victoryStampUntil('live', 200)).toBe(1800)
  expect(victoryStampUntil('live', 210)).toBe(1800)
  expect(victoryStampUntil('live', 1801)).toBe(0)
  noteLiveMatch('old', 100)
  expect(victoryStampUntil('old', 6000)).toBe(0)
})
