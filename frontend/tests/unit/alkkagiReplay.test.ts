import { describe, expect, it } from 'vitest'
import { AlkkagiReplay, type Snapshot } from '../../src/game/alkkagi/replay'

function state(x: number, alive = true): Snapshot {
  return { gameId: 'game-1', version: 2, tick: 3, simulationId: 1, stage: 'SIMULATING', turn: 0,
    turnNumber: 1, turnDeadline: 30000, matchDeadline: 720000, serverNow: 100, winner: null,
    endReason: null, timeouts: [0, 0], provisional: true,
    settings: { halfWidth: 4.5, halfHeight: 5, maximumImpulse: 12, deceleration: 5, restitution: .9 },
    pieces: Array.from({ length: 32 }, (_, i) => ({ id: `p${i}`, owner: 0, type: '兵', x, y: 0,
      vx: 1, vy: 0, radius: .24, mass: .8, alive })) }
}
describe('알까기 서버 결과 재생', () => {
  it('지연 비교는 동일 스냅샷에서 재생 시각만 바꾸고 물리는 바꾸지 않는다', () => {
    const a = new AlkkagiReplay(100), b = new AlkkagiReplay(150)
    for (const r of [a,b]) { r.push(1,state(0),0); r.push(2,state(2),100) }
    expect(a.sample(200)?.pieces[0].x).toBe(2)
    expect(b.sample(200)?.pieces[0].x).toBe(1)
    expect(() => new AlkkagiReplay(Number.NaN)).toThrow('INVALID_REPLAY_DELAY')
  })
  it('100ms 버퍼에서 두 스냅샷을 보간하고 지연 시 외삽하지 않는다', () => {
    const replay = new AlkkagiReplay()
    replay.push(1, state(0), 0); replay.push(2, state(2), 100)
    expect(replay.sample(150)?.pieces[0].x).toBe(1)
    expect(replay.sample(1000)?.pieces[0].x).toBe(2)
  })
  it('중복과 역순 메시지는 화면을 되돌리지 않는다', () => {
    const replay = new AlkkagiReplay()
    replay.push(2, state(2), 100); replay.push(1, state(0), 150); replay.push(2, state(0), 200)
    expect(replay.sample(500)?.pieces[0].x).toBe(2)
  })
  it('탈락을 앞당겨 만들지 않고 재접속 때 새 시퀀스를 받을 수 있다', () => {
    const replay = new AlkkagiReplay()
    replay.push(1, state(0), 0); replay.push(2, state(2, false), 100)
    expect(replay.sample(150)?.pieces[0].alive).toBe(true)
    expect(replay.sample(200)?.pieces[0].alive).toBe(false)
    const oldGeneration = replay.generation
    replay.clear(); replay.push(1, state(4), 300)
    expect(replay.generation).toBe(oldGeneration + 1)
    expect(replay.sample(500)?.pieces[0].x).toBe(4)
  })
})
