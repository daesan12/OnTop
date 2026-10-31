import { describe, expect, it } from 'vitest'
import { JumpGrace } from '../../src/features/jumpmap/jumpGrace'

/**
 * 같은 연속 시간 시나리오(발판 이탈 τ / 착지 λ, 점프 입력 시각, 무작위 FE·서버 위상)를 실제 FE JumpGrace(60Hz)와
 * 서버 규칙(30Hz, WorldPhysics.applyJumpGrace: 입력은 처리할 다음 틱을 요청 틱으로, 매 틱 직전 접지 상태로
 * `틱 - 마지막접지틱 ≤ 3` 코요테, `틱 - 요청틱 ≤ 4` 버퍼)에 넣어 판정 경계를 비교한다.
 * 두 쪽 모두 같은 3/4틱 창이지만 갱신 주기가 달라, 경계 근처에서는 위상에 따라 결과가 갈릴 수 있다.
 */
const FRAME = 1000 / 60, TICK = 1000 / 30

function fe(grounded: (t: number) => boolean, press: number, phase: number) {
  const grace = new JumpGrace()
  grace.reset(grounded(phase - FRAME))
  for (let k = 1; k < 120; k++) {
    const at = phase + k * FRAME
    const pressed = press > at - FRAME && press <= at
    if (grace.step(pressed, grounded(at - FRAME), 1 / 60)) return true
  }
  return false
}

function server(grounded: (t: number) => boolean, press: number, phase: number) {
  let lastGrounded = -1000, request = -1, leftByJump = false, coyoteUsed = false
  for (let j = 1; j < 60; j++) {
    const at = phase + j * TICK
    if (press > at - TICK && press <= at) request = j
    if (request >= 0 && j - request > 4) request = -1
    const onGround = grounded(at - TICK)
    if (onGround) { lastGrounded = j - 1; leftByJump = false; coyoteUsed = false }
    const coyote = !onGround && !leftByJump && !coyoteUsed && j - lastGrounded <= 3
    if (request >= 0 && (onGround || coyote)) return true
  }
  return false
}

function sweep(make: (offset: number) => { grounded: (t: number) => boolean; press: number }, offsets: number[]) {
  let seed = 7
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  return offsets.map(offset => {
    let feYes = 0, serverYes = 0, differ = 0
    for (let i = 0; i < 400; i++) {
      const { grounded, press } = make(offset)
      const a = fe(grounded, press, random() * FRAME), b = server(grounded, press, random() * TICK)
      feYes += +a; serverYes += +b; differ += +(a !== b)
    }
    return { offset, fe: feYes / 400, server: serverYes / 400, differ: differ / 400 }
  })
}

describe('FE 60Hz와 서버 30Hz 점프 보조 경계', () => {
  it('코요테: 이탈 후 66ms 안 입력은 둘 다 뛰고 100ms 뒤는 둘 다 버리며, 차이는 그 사이 위상 구간뿐이다', () => {
    const leave = 1000
    const rows = sweep(age => ({ grounded: t => t < leave, press: leave + age }), [0, 20, 40, 60, 66, 75, 85, 95, 101, 110, 130])
    for (const r of rows) {
      if (r.offset <= 66) expect([r.offset, r.fe, r.server]).toEqual([r.offset, 1, 1])
      if (r.offset >= 101) expect([r.offset, r.fe, r.server]).toEqual([r.offset, 0, 0])
      // 서버는 더 거친 30Hz라 FE보다 넓어지는 일은 없다(FE가 뛰는데 서버가 뛰지 않는 쪽만 남는다).
      expect(r.server).toBeLessThanOrEqual(r.fe)
    }
  })
  it('버퍼: 착지 100ms 안 입력은 둘 다 착지하자마자 뛰고 150ms 앞은 둘 다 버리며, 차이는 그 사이 위상 구간뿐이다', () => {
    const land = 1000
    const rows = sweep(lead => ({ grounded: t => t >= land, press: land - lead }), [10, 40, 70, 100, 110, 120, 133, 140, 151, 170])
    for (const r of rows) {
      if (r.offset <= 100) expect([r.offset, r.fe, r.server]).toEqual([r.offset, 1, 1])
      if (r.offset >= 151) expect([r.offset, r.fe, r.server]).toEqual([r.offset, 0, 0])
    }
    const band = rows.filter(r => r.differ > 0).map(r => r.offset)
    expect(Math.max(...band) - Math.min(...band)).toBeLessThanOrEqual(TICK + FRAME)
  })
})
