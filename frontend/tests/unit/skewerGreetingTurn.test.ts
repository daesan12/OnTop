import { describe, expect, it } from 'vitest'
import { Euler, Quaternion } from 'three'
import { GreetingTurn } from '../../src/features/skewer/chef/GreetingTurn'

const pose = (degrees: number, pitch = 0, roll = 0) => new Quaternion().setFromEuler(new Euler(pitch, degrees * Math.PI / 180, roll, 'YXZ'))
function spin(turn: GreetingTurn, start: number, end: number, at = 0, event = '0:0') {
  let successes = 0, now = at
  for (let n = 0; n <= 72; n++) if (turn.update(event, pose(start + (end - start) * n / 72), now += 30)) successes++
  return { successes, now }
}
describe('VR 인사 실제 한 바퀴 회전', () => {
  it.each([360, -360])('%s도는 ±180도 경계를 지나도 한 번만 완료한다', degrees => {
    const turn = new GreetingTurn()
    expect(spin(turn, 137, 137 + degrees).successes).toBe(1)
    expect(turn.progress).toBe(1)
    expect(spin(turn, 137, 137 + degrees, 3000).successes).toBe(0)
  })
  it('반 바퀴와 반복적인 좌우 흔들기는 완료되지 않는다', () => {
    const turn = new GreetingTurn()
    let at = 0
    for (let n = 0; n < 5; n++) {
      const out = spin(turn, 0, 170, at); at = out.now
      const back = spin(turn, 170, 0, at); at = back.now
      expect(out.successes + back.successes).toBe(0)
    }
    expect(turn.progress).toBeLessThan(.5)
  })
  it.each([180, 270, -180, -270])('%s도 뒤 방향을 바꾸면 전환 지점부터 한 바퀴로 완료한다', partial => {
    const turn = new GreetingTurn(), direction = Math.sign(partial)
    const first = spin(turn, 0, partial)
    const almost = spin(turn, partial, partial - direction * 359, first.now)
    expect(almost.successes).toBe(0)
    expect(turn.progress).toBeCloseTo(359 / 360)
    expect(spin(turn, partial - direction * 359, partial - direction * 360, almost.now).successes).toBe(1)
    expect(spin(turn, partial - direction * 360, partial - direction * 720, almost.now + 2200).successes).toBe(0)
  })
  it.each([1, -1])('방향 %s의 미세한 자세 흔들림은 진행도를 초기화하거나 늘리지 않는다', direction => {
    const turn = new GreetingTurn(), first = spin(turn, 0, direction * 180)
    let now = first.now
    for (let n = 0; n < 20; n++) {
      turn.update('0:0', pose(direction * 179.4), now += 20)
      turn.update('0:0', pose(direction * 180), now += 20)
    }
    expect(turn.progress).toBeCloseTo(.5)
    const almost = spin(turn, direction * 180, direction * 359, now)
    expect(almost.successes).toBe(0)
    expect(spin(turn, direction * 359, direction * 360, almost.now).successes).toBe(1)
  })
  it.each([270, -270])('%s도 뒤 작은 프레임 이동으로 천천히 반대로 돌아도 완료한다', partial => {
    const turn = new GreetingTurn(), first = spin(turn, 0, partial)
    let now = first.now, successes = 0
    for (let n = 1; n <= 1440; n++) {
      if (turn.update('0:0', pose(partial - Math.sign(partial) * n / 4), now += 10)) successes++
    }
    expect(successes).toBe(1)
    expect(turn.progress).toBe(1)
  })
  it('인사 밖의 회전은 다음 인사에 더해지지 않고 이벤트가 바뀌면 새로 측정한다', () => {
    const turn = new GreetingTurn()
    expect(spin(turn, 0, 360, 0, '').successes).toBe(0)
    spin(turn, 0, 180, 3000)
    expect(spin(turn, 180, 360, 6000, '0:1').successes).toBe(0)
    expect(spin(turn, 360, 540, 8200, '0:1').successes).toBe(1)
    expect(spin(turn, 0, 180, 11000, '1:0').successes).toBe(0)
  })
  it('추적 소실·일시정지 뒤에는 이전 진행도를 이어 합산하지 않는다', () => {
    const turn = new GreetingTurn(), first = spin(turn, 0, 180)
    turn.update('0:0', null, first.now + 30)
    expect(turn.progress).toBe(0)
    expect(spin(turn, 180, 360, first.now + 60).successes).toBe(0)
    turn.reset()
    expect(turn.progress).toBe(0)
  })
  it('장시간 프레임 공백과 순간 자세 점프는 회전으로 인정하지 않는다', () => {
    const turn = new GreetingTurn(), first = spin(turn, 0, 180)
    turn.update('0:0', pose(270), first.now + 1000)
    expect(turn.progress).toBe(0)
    turn.update('0:0', pose(0), first.now + 1010)
    expect(turn.progress).toBe(0)
  })
  it('위아래 보기·잘못된 자세로는 성공하지 않는다', () => {
    const turn = new GreetingTurn()
    for (let n = 0; n < 90; n++) turn.update('0:0', pose(n * 8, Math.PI / 2), n * 30)
    turn.update('0:0', { x: NaN, y: 0, z: 0, w: 1 }, 3000)
    expect(turn.progress).toBe(0)
  })
  it('추적이 끊겨도 이미 완료한 같은 이벤트는 다시 전송하지 않는다', () => {
    const turn = new GreetingTurn(), first = spin(turn, 0, 360)
    turn.update('0:0', null, first.now + 30)
    expect(spin(turn, 0, 360, first.now + 60).successes).toBe(0)
  })
})
