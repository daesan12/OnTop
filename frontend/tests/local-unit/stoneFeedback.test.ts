import { expect, it } from 'vitest'
import fixture from '../fixtures/stone-rumble-eight.json'
import { audibleStoneCues, StoneFeedbackTracker, type StoneCue } from '../../src/game/stone-rumble/feedback'
import { parseStoneState, type StoneState } from '../../src/game/stone-rumble/protocol'

function state(time = 10000): StoneState {
  const value = structuredClone(parseStoneState(fixture))
  value.phase = 'RUNNING'; value.serverTime = time
  value.players.forEach(player => { player.y = 24; player.grounded = true; player.pigeonReadyAt = 0; player.hitAt = 0 })
  return value
}
function fire(value: StoneState, index = 0) { value.players[index]!.pigeonReadyAt = value.serverTime + 1500; return value }
function hit(value: StoneState, index = 0) { value.players[index]!.hitAt = value.serverTime; return value }

it('처음 입장한 스냅샷의 발사와 피격 이력을 재생하지 않는다', () => {
  expect(new StoneFeedbackTracker().read(hit(fire(state())), true)).toEqual([])
})
it('서버가 확인한 발사와 피격만 각각 한 번 전달하며 즉시 명중해 비둘기가 없어도 발사를 감지한다', () => {
  const tracker = new StoneFeedbackTracker()
  tracker.read(state(), true)
  const next = hit(fire(state(10020)), 1)
  expect(next.pigeons).toEqual([])
  expect(tracker.read(next, true).map(cue => [cue.kind, cue.userId])).toEqual([['fire', '101'], ['hit', '202']])
  expect(tracker.read(structuredClone(next), true)).toEqual([])
  next.serverTime += 20
  expect(tracker.read(next, true)).toEqual([])
})
it('쿨타임 중 거절된 발사 입력은 서버 시각이 바뀌지 않아 소리가 나지 않는다', () => {
  const tracker = new StoneFeedbackTracker()
  tracker.read(state(), true)
  expect(tracker.read(state(10020), true)).toEqual([])
})
it('오래되거나 역순인 스냅샷이 새로운 소리를 만들지 않는다', () => {
  const tracker = new StoneFeedbackTracker()
  tracker.read(state(), true)
  expect(tracker.read(fire(state(9000)), true)).toEqual([])
  const late = hit(fire(state(10500)))
  late.players[0]!.hitAt = 10020; late.players[0]!.pigeonReadyAt = 11520
  expect(tracker.read(late, true)).toEqual([])
})
it.each(['disabled', 'long-gap', 'new-game'])('복구·긴 갱신 중단·새 경기에서는 지난 사건을 새로 재생하지 않는다: %s', reason => {
  const tracker = new StoneFeedbackTracker()
  tracker.read(state(), true)
  if (reason === 'disabled') tracker.read(state(10020), false)
  const restored = hit(fire(state(reason === 'long-gap' ? 12000 : 10040)))
  if (reason === 'new-game') restored.gameId = 'next-game'
  expect(tracker.read(restored, true)).toEqual([])
})
it('준비 중 예약은 조용하고 카운트다운 직후 첫 정상 발사는 들린다', () => {
  const tracker = new StoneFeedbackTracker(), countdown = state()
  countdown.phase = 'COUNTDOWN'; countdown.startsAt = 10020
  tracker.read(countdown, true)
  const running = fire(state(10020)); running.startsAt = 10020
  expect(tracker.read(running, true).map(cue => cue.kind)).toEqual(['fire'])
})
it('같은 공격의 피격을 복제하지 않지만 다음 정상 피격은 전달한다', () => {
  const tracker = new StoneFeedbackTracker()
  tracker.read(state(), true)
  expect(tracker.read(hit(state(10020)), true)).toHaveLength(1)
  expect(tracker.read(hit(state(10480)), true)).toHaveLength(1)
  tracker.reset()
  expect(tracker.read(hit(state(10480)), true)).toEqual([])
})
it('동시8인 소리는 본인/관전 대상부터 최대4개를 선택하고 먼 층의 소리는 제외한다', () => {
  const cues: StoneCue[] = Array.from({ length: 8 }, (_, index) => ({ kind: 'hit', userId: String(index), at: 10, x: index, y: 0, z: 0 }))
  cues.push({ ...cues[0]!, userId: 'far', y: 30 })
  const selected = audibleStoneCues(cues, { userId: '7', x: 0, y: 0, z: 0 })
  expect(selected.map(cue => cue.userId)).toEqual(['7', '0', '1', '2'])
  expect(cues).toHaveLength(9)
})
