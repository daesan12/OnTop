import { expect, it } from 'vitest'
import fixture from '../fixtures/stone-rumble-eight.json'
import { StoneActionTracker } from '../../src/game/stone-rumble/actionFeedback'
import { STONE_ACTION_DURATION, stoneActionSamples } from '../../src/game/stone-rumble/stoneActionSounds'
import { parseStoneState, type StoneState } from '../../src/game/stone-rumble/protocol'

function state(time = 10000): StoneState {
  const state = structuredClone(parseStoneState(fixture))
  state.serverTime = time; state.phase = 'RUNNING'; state.startsAt = 9000
  state.tiles.forEach(tile => { tile.breakAt = Number.MAX_SAFE_INTEGER; tile.stepped = false })
  state.players.forEach(player => { player.alive = true; player.y = 24; player.slideStartedAt = 0; player.eliminatedAt = 0 })
  return state
}
const view = { userId: '101', x: 0, y: 24, z: 0 }

it.each(['RUNNING', 'COUNTDOWN'] as const)('접지→상승 점프는 한 번만 알리고 공중 재입력·추락은 조용하다: %s', phase => {
  const tracker = new StoneActionTracker(), initial = state()
  initial.phase = phase
  Object.assign(initial.players[0]!, { x: 0, z: 0, floor: 6, grounded: true })
  tracker.read(initial, true, view)
  const accepted = structuredClone(initial); accepted.serverTime = 10010; accepted.players[0]!.grounded = false
  expect(tracker.read(accepted, true, view)).toEqual([])
  const jump = structuredClone(accepted); jump.serverTime = 10020
  Object.assign(jump.players[0]!, { y: 24.2, grounded: false })
  expect(tracker.read(jump, true, view).map(c => c.kind)).toEqual(['jump'])
  const airborne = structuredClone(jump); airborne.serverTime = 10040; airborne.players[0]!.y = 24.4
  expect(tracker.read(airborne, true, view)).toEqual([])
  const falling = structuredClone(initial); falling.serverTime = 10060
  tracker.read(falling, true, view)
  falling.players[0]!.y = 23.9; falling.players[0]!.grounded = false; falling.serverTime = 10080
  expect(tracker.read(falling, true, view)).toEqual([])
  const restored = new StoneActionTracker()
  expect(restored.read(jump, true, view)).toEqual([])
  expect(restored.read(airborne, true, view)).toEqual([])
})

it('접지한 칸 이동과 착지는 디딤음 한 번이며 공중·정지·다른 층은 무음이다', () => {
  const tracker = new StoneActionTracker(), initial = state()
  Object.assign(initial.players[0]!, { x: 0, z: 0, floor: 6, grounded: true })
  tracker.read(initial, true, view)
  const next = structuredClone(initial); next.serverTime = 10020; next.players[0]!.x = 2.6
  expect(tracker.read(next, true, view).map(c => c.kind)).toEqual(['step'])
  expect(tracker.read({ ...next, serverTime: 10040 }, true, view)).toEqual([])
  const air = structuredClone(next); air.serverTime = 10300; air.players[0]!.grounded = false; air.players[0]!.x = 5.2
  expect(tracker.read(air, true, view)).toEqual([])
  const land = structuredClone(air); land.serverTime = 10320; land.players[0]!.grounded = true
  expect(tracker.read(land, true, view).map(c => c.kind)).toEqual(['step'])
  const lower = structuredClone(land); lower.serverTime = 10600; lower.players[0]!.y = 12; lower.players[0]!.floor = 1
  expect(tracker.read(lower, true, view)).toEqual([])
})

it('밟은 발판의 붕괴350ms 전 같은 층 근처 균열만 한 번 울리고 복구 시 반복하지 않는다', () => {
  const initial = state(), tile = initial.tiles.find(t => t.floor === 6 && t.q === 0 && t.r === 0)!
  tile.stepped = true; tile.breakAt = 10400
  const tracker = new StoneActionTracker(); tracker.read(initial, true, view)
  expect(tracker.read({ ...initial, serverTime: 10060 }, true, view).map(c => c.kind)).toEqual(['crack'])
  expect(tracker.read({ ...initial, serverTime: 10100 }, true, view)).toEqual([])
  const recovery = new StoneActionTracker()
  expect(recovery.read({ ...initial, serverTime: 10060 }, true, view)).toEqual([])
  expect(recovery.read({ ...initial, serverTime: 10100 }, true, view)).toEqual([])
  const lower = new StoneActionTracker(); lower.read(initial, true, { ...view, y: 12 })
  expect(lower.read({ ...initial, serverTime: 10060 }, true, { ...view, y: 12 })).toEqual([])
})

it('새 경기/복구/역순/긴 수신 중단은 과거 상황 소리를 재생하지 않는다', () => {
  for (const reason of ['first', 'recovery', 'reversed', 'gap', 'new-game']) {
    const tracker = new StoneActionTracker()
    if (reason !== 'first') tracker.read(state(), true, view)
    if (reason === 'recovery') tracker.read(state(10020), false, view)
    const next = state(reason === 'reversed' ? 9900 : reason === 'gap' ? 12000 : 10040)
    if (reason === 'new-game') next.gameId = 'new'
    next.players[0]!.slideStartedAt = next.serverTime
    next.players[1]!.alive = false; next.players[1]!.eliminatedAt = next.serverTime
    expect(tracker.read(next, true, view)).toEqual([])
  }
})
it('전원 준비 후 구름 낙하가 실제 시작될 때 한 번 울리고 카운트다운에는 반복하지 않는다', () => {
  const tracker = new StoneActionTracker(), loading = state()
  loading.phase = 'LOADING'; tracker.read(loading, true, view)
  const drop = state(10020); drop.phase = 'DROPPING'; drop.landsAt = 11220
  expect(tracker.read(drop, true, view).map(c => c.kind)).toEqual(['cloud'])
  expect(tracker.read({ ...drop, serverTime: 10040 }, true, view)).toEqual([])
  expect(tracker.read({ ...drop, serverTime: 10100, phase: 'COUNTDOWN' }, true, view)).toEqual([])
})
it('서버가 수락한 지상/공중 슬라이딩만 한 번 전달하고 거절된 입력은 조용하다', () => {
  const tracker = new StoneActionTracker(); tracker.read(state(), true, view)
  expect(tracker.read(state(10020), true, view)).toEqual([])
  const slide = state(10040); slide.players[0]!.slideStartedAt = 10040; slide.players[0]!.grounded = false
  expect(tracker.read(slide, true, view).map(c => c.kind)).toEqual(['slide'])
  expect(tracker.read({ ...slide, serverTime: 10060 }, true, view)).toEqual([])
})
it('탈락은 생존→탈락 전환 한 번이며 마지막 동시 탈락으로 종료돼도 전달한다', () => {
  const tracker = new StoneActionTracker(); tracker.read(state(), true, view)
  const out = state(10020); out.phase = 'FINISHED'; out.status = 'FINISHED'
  out.players[0]!.alive = false; out.players[0]!.eliminatedAt = 10020
  expect(tracker.read(out, true, view).map(c => c.kind)).toEqual(['eliminated'])
  expect(tracker.read({ ...out, serverTime: 10040 }, true, view)).toEqual([])
})
it('동시에 사라지는 발판은 붕괴 직전 경고 한 번과 붕괴음 한 번으로 묶고 다음 줄은 새로 경고한다', () => {
  const tracker = new StoneActionTracker(), initial = state()
  initial.tiles.filter(t => t.floor === 6 && Math.max(Math.abs(t.q), Math.abs(t.r)) === 6).forEach(t => { t.breakAt = 11300 })
  tracker.read(initial, true, view)
  const warning = structuredClone(initial); warning.serverTime = 10120
  expect(tracker.read(warning, true, view).map(c => c.kind)).toEqual(['ring-warning'])
  expect(tracker.read({ ...warning, serverTime: 10140 }, true, view)).toEqual([])
  tracker.read({ ...warning, serverTime: 11100 }, true, view)
  expect(tracker.read({ ...warning, serverTime: 11300 }, true, view).map(c => c.kind)).toEqual(['collapse'])
  const next = structuredClone(warning); next.serverTime = 11320
  next.tiles.filter(t => t.floor === 6 && Math.max(Math.abs(t.q), Math.abs(t.r)) === 5).forEach(t => { t.breakAt = 12400 })
  expect(tracker.read(next, true, view).map(c => c.kind)).toEqual(['ring-warning'])
})
it('복구 때 이미 울릴 시점인 경고는 다시 울리지 않고 머리 위 먼 발판 소리도 걸러낸다', () => {
  const tracker = new StoneActionTracker(), imminent = state()
  imminent.tiles[0]!.breakAt = 11000
  tracker.read(imminent, true, view)
  expect(tracker.read({ ...imminent, serverTime: 10020 }, true, view)).toEqual([])
  tracker.read({ ...imminent, serverTime: 10980 }, true, view)
  expect(tracker.read({ ...imminent, serverTime: 11000 }, true, { ...view, y: 30 })).toEqual([])
})
it.each(Object.keys(STONE_ACTION_DURATION) as (keyof typeof STONE_ACTION_DURATION)[])('상황별 합성음은 유한하고 짧고 클릭 없이 끝난다: %s', kind => {
  for (const rate of [44100, 48000]) {
    const samples = stoneActionSamples(kind, rate)
    expect(samples.length).toBe(Math.ceil(rate * STONE_ACTION_DURATION[kind]))
    expect([...samples].every(Number.isFinite)).toBe(true)
    expect(Math.max(...samples.map(Math.abs))).toBeLessThan(.9)
    expect(Math.abs(samples[0]!)).toBe(0); expect(Math.abs(samples.at(-1)!)).toBeLessThan(.001)
  }
})
