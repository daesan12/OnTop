import { expect, it } from 'vitest'
import type { ChessGame } from '../../src/game/protocol'
import { ChessClockSound } from '../../src/game/chess/clockSound'

const NOW = Date.parse('2026-11-22T00:00:00Z')
function game(now: number, remaining: number, turn = '101'): ChessGame {
  return { gameId: 'g', role: 'PLAYER', version: 1, chess: { status: 'PLAYING', whiteUserId: '101', blackUserId: '202',
    turnUserId: turn, turnDeadline: new Date(now + remaining).toISOString(), remainingMs: [remaining, remaining] } } as ChessGame
}

it('백흑 모두 자기 시계의 30초와 10초 통과에 각 한 번만 경고한다', () => {
  for (const own of ['101','202']) {
    const feedback=new ChessClockSound()
    const tick=(elapsed:number,remaining:number)=>feedback.update(game(NOW+elapsed,remaining,own),own,NOW+elapsed,true,true)
    expect(tick(0,30_100)).toBeNull()
    expect(tick(200,29_900)).toBe('chess-time-warning')
    expect(tick(200,29_900)).toBeNull()
    expect(tick(400,29_700)).toBeNull()
    expect(tick(20_000,10_100)).toBeNull()
    expect(tick(20_200,9_900)).toBe('chess-time-warning')
    expect(tick(20_400,9_700)).toBeNull()
  }
})
it('상대 차례의 시계는 경고하지 않고 자기 차례가 이어질 때만 통과를 알린다', () => {
  const f=new ChessClockSound()
  const opponent=game(NOW,30_100,'202')
  expect(f.update(opponent,'101',NOW,true,true)).toBeNull()
  expect(f.update({...opponent,chess:{...opponent.chess,turnDeadline:new Date(NOW+29_900).toISOString()}},'101',NOW+200,true,true)).toBeNull()
  expect(f.update(game(NOW+1000,30_100),'101',NOW+1000,true,true)).toBeNull()
  expect(f.update(game(NOW+1200,29_900),'101',NOW+1200,true,true)).toBe('chess-time-warning')
})
it('입장·복구·숨김·연결 불확실 중 지난 경고는 뒤늦게 재생하지 않는다', () => {
  for (const [live,visible] of [[false,true],[true,false],[false,false]]) {
    const f=new ChessClockSound()
    f.update(game(NOW,30_100),'101',NOW,true,true)
    expect(f.update(game(NOW+200,29_900),'101',NOW+200,live,visible)).toBeNull()
    expect(f.update(game(NOW+400,29_700),'101',NOW+400,true,true)).toBeNull()
    expect(f.update(game(NOW+20_000,10_100),'101',NOW+20_000,true,true)).toBeNull()
    expect(f.update(game(NOW+20_200,9_900),'101',NOW+20_200,true,true)).toBe('chess-time-warning')
  }
  const f=new ChessClockSound()
  expect(f.update(game(NOW,9_900),'101',NOW,true,true)).toBeNull()
  expect(f.update(game(NOW+200,9_700),'101',NOW+200,true,true)).toBeNull()
})
it('관전자·비참가자·다른 게임·종료 상태에서는 경고하지 않는다', () => {
  for (const role of ['SPECTATOR','PLAYER'] as const) {
    const f=new ChessClockSound(), own=role==='PLAYER'?'outsider':'101'
    f.update({...game(NOW,30_100),role},own,NOW,true,true)
    expect(f.update({...game(NOW+200,29_900),role},own,NOW+200,true,true)).toBeNull()
  }
  const f=new ChessClockSound()
  f.update(game(NOW,30_100),'101',NOW,true,true)
  expect(f.update({...game(NOW+200,29_900),chess:{...game(NOW+200,29_900).chess,status:'FINISHED'}},'101',NOW+200,true,true)).toBeNull()
  expect(f.update(null,'101',NOW+400,true,true)).toBeNull()
})
it('시계 보정·오래 멈춘 타이머·시간 만료에는 경고를 몰아서 재생하지 않는다', () => {
  for (const [elapsed,remaining] of [[200,9000],[2000,29_000],[31_000,-900],[0,29_900],[-200,29_900]]) {
    const f=new ChessClockSound()
    f.update(game(NOW,30_100),'101',NOW,true,true)
    // Equal time with a 200ms decrease is a clock correction, not elapsed play.
    expect(f.update(game(NOW+elapsed,remaining),'101',NOW+elapsed,true,true)).toBeNull()
  }
})
it('차례 변경과 재동기화로 시간이 늘어나도 이미 지난 기준은 반복하지 않는다', () => {
  const f=new ChessClockSound()
  f.update(game(NOW,30_100),'101',NOW,true,true)
  expect(f.update(game(NOW+200,29_900),'101',NOW+200,true,true)).toBe('chess-time-warning')
  f.update(game(NOW+400,35_000,'202'),'101',NOW+400,true,true)
  f.update(game(NOW+600,30_100),'101',NOW+600,true,true)
  expect(f.update(game(NOW+800,29_900),'101',NOW+800,true,true)).toBeNull()
  expect(f.update({...game(NOW+1000,30_100),gameId:'new'},'101',NOW+1000,true,true)).toBeNull()
  expect(f.update({...game(NOW+1200,29_900),gameId:'new'},'101',NOW+1200,true,true)).toBe('chess-time-warning')
})
