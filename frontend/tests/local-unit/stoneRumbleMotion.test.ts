import { expect, it } from 'vitest'
import { followStoneCamera, followStoneYaw, StonePositionBuffer, StoneRenderClock } from '../../src/game/stone-rumble/motion'

it('turns toward a new movement direction across multiple frames and eases into it', () => {
  const target = Math.PI / 2, dt = 1 / 60
  let yaw = followStoneYaw(0, target, dt, 12, 5.2)
  expect(yaw).toBeGreaterThan(0)
  expect(yaw).toBeLessThan(.1)
  for (let frame = 1; frame < 45; frame++) {
    const next = followStoneYaw(yaw, target, dt, 12, 5.2)
    expect(next).toBeGreaterThan(yaw)
    expect(next).toBeLessThanOrEqual(target)
    yaw = next
  }
  expect(yaw).toBeCloseTo(target, 2)
})

it('takes the short arc when a direction change crosses the angle wrap', () => {
  const current = Math.PI - .02
  const target = -Math.PI + .05
  expect(followStoneYaw(current, target, 1 / 60, 12, 5.2)).toBeGreaterThan(current)
})

it.each([false, true])('빠른 방향 반전도 프레임마다 회전 속도를 제한한다: manual=%s', manual => {
  let yaw = 0
  for (let frame = 0; frame < 30; frame++) {
    const next = followStoneCamera(yaw, Math.PI, 1 / 60, manual)
    expect(Math.abs(next - yaw)).toBeLessThanOrEqual((manual ? 2.8 : 1.6) / 60 + 1e-9)
    yaw = next
  }
  expect(yaw).toBeGreaterThan(.5)
  expect(yaw).toBeLessThan(Math.PI / 2)
  expect(Math.abs(followStoneCamera(0, Math.PI, 3, manual))).toBeLessThanOrEqual(.14 + 1e-9)
})

it('100ms 서버 낙하 사이를 매 프레임 이어 그리고 착지면을 뚫지 않는다', () => {
  const buffer = new StonePositionBuffer(), target = { x: 0, y: 0, z: 0 }
  const pose = (y: number) => ({ x: 1, y, z: 2 })
  buffer.sample(pose(12), 1000, 0, target)
  buffer.sample(pose(11), 1100, 100, target)
  buffer.sample(pose(9), 1200, 200, target)
  let previous = target.y
  for (let frame = 1; frame <= 6; frame++) {
    buffer.sample(pose(9), 1200, 200 + frame * 10, target)
    expect(target.y).toBeLessThan(previous)
    expect(previous - target.y).toBeLessThanOrEqual(.2 + 1e-9)
    previous = target.y
  }
  buffer.sample(pose(9), 1300, 300, target)
  buffer.sample(pose(9), 1300, 900, target)
  expect(target.y).toBe(9)
})

it('재접속과 관전 대상 변경은 이전 플레이어의 궤적을 섞지 않는다', () => {
  const buffer = new StonePositionBuffer(), target = { x: 0, y: 0, z: 0 }
  buffer.sample({ x: 1, y: 24, z: 2 }, 1000, 0, target)
  buffer.sample({ x: 3, y: 12, z: 4 }, 3000, 100, target)
  expect(target).toEqual({ x: 3, y: 12, z: 4 })
  buffer.reset()
  buffer.sample({ x: 10, y: 0, z: 20 }, 3100, 200, target)
  expect(target).toEqual({ x: 10, y: 0, z: 20 })
})

it('촘촘한 패킷이 몰려도 120ms 전 내삽 시작점을 조기에 버리지 않는다', () => {
  const buffer = new StonePositionBuffer(), target = { x: 0, y: 0, z: 0 }
  // 렌더 프레임 사이에 촘촘한 상태가 몰리는 경우도 시간 범위로 보존한다.
  for (let elapsed = 0; elapsed <= 2000; elapsed += 5) {
    buffer.sample({ x: elapsed / 1000, y: 24 - elapsed / 1000, z: 2 }, 1000 + elapsed, elapsed, target)
    if (elapsed >= 120) {
      expect(target.x).toBeCloseTo((elapsed - 120) / 1000, 6)
      expect(target.y).toBeCloseTo(24 - (elapsed - 120) / 1000, 6)
    }
  }
  for (const now of [2005, 2030, 2060, 2100, 2500]) {
    buffer.sample({ x: 2, y: 22, z: 2 }, 3000, now, target)
    expect(target.x).toBeCloseTo(Math.min(2, (now - 120) / 1000), 6)
  }
})

it('늦은 패킷과 일시 정지 후에도 낙하·발판 표시 시각이 역행하지 않는다', () => {
  const clock = new StoneRenderClock()
  expect(clock.sample(1000, 0)).toBe(880)
  expect(clock.sample(1100, 100)).toBe(980)
  expect(clock.sample(1100, 300)).toBe(1100)
  expect(clock.sample(1200, 310)).toBe(1100)
  expect(clock.sample(1200, 360)).toBe(1130)
  expect(clock.sample(1200, 3000)).toBe(1200)
  expect(clock.sample(5000, 4000)).toBe(4880)
  expect(clock.sample(0, 4100)).toBe(-120)
  clock.reset()
  expect(clock.sample(1000, 5000)).toBe(880)
})
