import { expect, it } from 'vitest'
import { StoneFeedbackTimeline } from '../../src/game/stone-rumble/feedbackTimeline'
import type { StoneCue } from '../../src/game/stone-rumble/feedback'

const hit: StoneCue = { kind: 'hit', userId: '202', x: 2, y: .8, z: 0, at: 1000 }
it('내 발사 확인음은 서버 수락 직후, 상대 발사와 명중은 표시 시각에 실행한다', () => {
  const timeline = new StoneFeedbackTimeline()
  const own = { ...hit, kind: 'fire' as const, userId: '101' }, other = { ...hit, kind: 'fire' as const }
  timeline.accept('game', 1020, [own, other, hit], 0, '101')
  expect(timeline.drain(0)).toEqual([own])
  expect(timeline.drain(100)).toEqual([other, hit])
})
it('새 패킷이 먼저 와도 명중 연출은 보간된 충돌 시각에 한 번 실행된다', () => {
  const timeline = new StoneFeedbackTimeline()
  timeline.accept('game', 1020, [hit], 0)
  expect(timeline.drain(99)).toEqual([])
  timeline.accept('game', 1100, [], 80)
  expect(timeline.drain(100)).toEqual([hit])
  expect(timeline.drain(120)).toEqual([])
})
it('재접속·역순·다음 경기·오래 정지한 화면에는 지나간 명중을 재생하지 않는다', () => {
  for (const next of [{ game: 'game', time: 2000 }, { game: 'game', time: 900 }, { game: 'next', time: 1020 }]) {
    const timeline = new StoneFeedbackTimeline(); timeline.accept('game', 1020, [hit], 0)
    timeline.accept(next.game, next.time, [], 20)
    expect(timeline.drain(500)).toEqual([])
  }
  const timeline = new StoneFeedbackTimeline(); timeline.accept('game', 1020, [hit], 0)
  expect(timeline.drain(500)).toEqual([])
})
