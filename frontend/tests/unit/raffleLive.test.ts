import { beforeEach, describe, expect, it } from 'vitest'
import { MockLiveServer, MOCK_SCENARIOS, mockSlots } from '../../src/features/raffleLive/mock'
import { parseSnapshot, type LiveSnapshot } from '../../src/features/raffleLive/protocol'
import { boardCells, buildReel, currentPlace, currentResult, detent, EMPTY_LABEL, fillDelay, headline, HIGHLIGHT_MS,
  planReveal, ReelDirector, revealedBefore, revealMotion, SPIN, spinPosition, spinSpeed, type DirectorInput }
  from '../../src/features/raffleLive/reel'
import { phaseElapsed, useRaffleLive } from '../../src/features/raffleLive/store'

const [crowd, few] = MOCK_SCENARIOS as [typeof MOCK_SCENARIOS[0], typeof MOCK_SCENARIOS[0]]
const T0 = Date.parse('2026-11-19T06:00:00Z')

function server(scenario = crowd, order: 'lowFirst' | 'highFirst' = 'lowFirst') {
  let now = T0
  const mock = new MockLiveServer(scenario, 1, () => now, order)
  return { mock, advance: (ms: number) => { now += ms }, now: () => now }
}

/** 화면 한 대: 저장소 상태로 연출 입력을 만들어 프레임을 계산한다. */
function screen() {
  const director = new ReelDirector()
  return {
    director,
    frame(now: number) {
      const state = useRaffleLive.getState()
      const status = state.status
      const input: DirectorInput = {
        phase: status?.phase ?? null,
        slotKey: `${status?.liveEventId}:${status?.currentSlotIndex}`,
        seed: (status?.liveEventId ?? 0) * 1000 + (status?.currentSlotIndex ?? 0),
        place: currentPlace(status),
        candidates: state.candidates,
        exclude: status ? revealedBefore(status) : new Set(),
        result: currentResult(status),
        spinElapsedMs: status?.spinElapsedMs ?? 0,
        phaseElapsedMs: phaseElapsed(state, now),
      }
      return director.update(input)
    },
  }
}

beforeEach(() => useRaffleLive.getState().clear())

describe('roller timeline', () => {
  it('spins up, runs fast, slows down and keeps crawling until the server reveals', () => {
    expect(spinSpeed(0)).toBe(0)
    expect(spinSpeed(SPIN.upMs)).toBe(SPIN.max)
    expect(spinSpeed(3000)).toBe(SPIN.max)
    expect(spinSpeed(5000)).toBeLessThan(SPIN.max)
    expect(spinSpeed(5000)).toBeGreaterThan(SPIN.crawl)
    expect(spinSpeed(SPIN.decelUntilMs)).toBeCloseTo(SPIN.crawl, 6)
    expect(spinSpeed(60_000)).toBe(SPIN.crawl)
    let previous = -1
    for (let ms = 0; ms <= 20_000; ms += 25) {
      const position = spinPosition(ms)
      expect(position).toBeGreaterThan(previous)
      // 위치는 속도의 적분과 맞아야 구간 경계에서 튀지 않는다.
      if (ms) expect(position - previous).toBeCloseTo((spinSpeed(ms) + spinSpeed(ms - 25)) / 2 * .025, 2)
      previous = position
    }
  })

  it('snaps cell by cell with a small kick when slow, but moves continuously when fast', () => {
    expect(detent(10.3, SPIN.max)).toBe(10.3)
    expect(detent(10.3, SPIN.crawl)).toBe(10)
    expect(detent(10.999, SPIN.crawl)).toBeCloseTo(11, 2)
    const kick = Math.max(...Array.from({ length: 50 }, (_, i) => detent(10.5 + i / 100, SPIN.crawl)))
    expect(kick).toBeGreaterThan(11)
  })

  it('stops exactly on the revealed cell for reveals before, at and long after the slowdown', () => {
    for (const spinMs of [1200, SPIN.decelUntilMs, 9300, 30_000]) {
      const plan = planReveal(spinMs, false)
      expect(Number.isInteger(plan.target)).toBe(true)
      expect(plan.target).toBeGreaterThan(spinPosition(spinMs))
      expect(revealMotion(plan, 0).position).toBeCloseTo(spinPosition(spinMs), 9)
      expect(revealMotion(plan, plan.landAfterMs - .001).position).toBeCloseTo(plan.target, 3)
      expect(revealMotion(plan, plan.landAfterMs + 10_000).position).toBe(plan.target)
      // 감속 구간이 끝나기 전에 공개돼도 일정대로 감속한 뒤 멈춘다.
      expect(spinMs + plan.landAfterMs).toBeGreaterThanOrEqual(SPIN.decelUntilMs)
    }
    const quick = planReveal(1200, true)
    expect(quick.landAfterMs).toBeLessThan(1200)
  })

  it('lands on the winner the server revealed, not on a name the reel picked', () => {
    const { mock, advance, now } = server()
    const view = screen()
    useRaffleLive.getState().accept(mock.snapshot(true), now())
    useRaffleLive.getState().accept(mock.start(), now())
    advance(SPIN.decelUntilMs)
    expect(view.frame(now()).mode).toBe('spin')
    expect(view.frame(now()).result).toBeUndefined()
    const revealed = mock.reveal()!
    const winner = revealed.revealed.at(-1)!.nickname!
    useRaffleLive.getState().accept(revealed, now())
    let frame = view.frame(now())
    expect(frame.mode).toBe('landing')
    for (let i = 0; i < 100 && frame.mode !== 'landed'; i++) { advance(50); frame = view.frame(now()) }
    expect(frame.mode).toBe('landed')
    expect(frame.highlight).toBeGreaterThan(.9)
    expect(frame.target).not.toBeNull()
    expect(view.director.label(frame.target!)).toBe(winner)
    expect(frame.filled).toBe(false)
    advance(fillDelay(3, false))
    frame = view.frame(now())
    expect(frame.filled).toBe(true)
    expect(boardCells(useRaffleLive.getState().status, frame.filled)[0]).toMatchObject({ state: 'winner', nickname: winner })
  })

  it('builds a ticket-weighted reel without already revealed winners', () => {
    const reel = buildReel([{ nickname: 'a', tickets: 30 }, { nickname: 'b', tickets: 10 }, { nickname: 'c', tickets: 1 }], new Set(['c']), 7)
    expect(reel.filter(n => n === 'a').length).toBe(30)
    expect(reel.filter(n => n === 'b').length).toBe(10)
    expect(reel).not.toContain('c')
    const capped = buildReel(crowd.candidates, new Set(), 3, 120)
    expect(capped.length).toBeLessThanOrEqual(120)
    expect(new Set(capped).size).toBe(crowd.candidates.length)
    expect(capped.some((n, i) => i > 0 && n === capped[i - 1])).toBe(false)
    expect(buildReel(crowd.candidates, new Set(), 3, 120)).toEqual(capped)
  })
})

describe('empty slots', () => {
  it('stops quickly on 당첨자 없음 without highlight and fills the board as empty', () => {
    const { mock, advance, now } = server(few)
    const view = screen()
    useRaffleLive.getState().accept(mock.snapshot(true), now())
    useRaffleLive.getState().accept(mock.start(), now())
    advance(1200)
    useRaffleLive.getState().accept(mock.reveal(), now())
    advance(1100)
    let frame = view.frame(now())
    const status = useRaffleLive.getState().status!
    expect(status.revealed).toEqual([{ slotIndex: 0, nickname: null }])
    expect(frame.mode).toBe('landed')
    expect(frame.highlight).toBe(0)
    expect(view.director.label(frame.target!)).toBe(EMPTY_LABEL)
    expect(headline(status, frame).title).toBe('3등 당첨자 없음')
    advance(fillDelay(3, true))
    frame = view.frame(now())
    expect(boardCells(status, frame.filled)[0]).toMatchObject({ state: 'empty', nickname: null, fresh: true })
  })

  it('leaves the lowest places empty when there are fewer entrants than slots, in either order', () => {
    for (const order of ['lowFirst', 'highFirst'] as const) {
      const { mock } = server(few, order)
      mock.start()
      for (let i = 0; i < 8; i++) { mock.reveal(); mock.next() }
      const done = parseSnapshot(mock.snapshot(false)).status
      expect(done.phase).toBe('COMPLETED')
      const byPlace = boardCells(done, false).sort((a, b) => a.place - b.place || a.slotIndex - b.slotIndex).map(c => [c.place, c.state])
      expect(byPlace).toEqual([[1, 'winner'], [2, 'winner'], [2, 'winner'], [3, 'empty'], [3, 'empty'], [3, 'empty'], [3, 'empty'], [3, 'empty']])
    }
  })

  it('reveals the same winners per place whatever the reveal order', () => {
    const winners = (order: 'lowFirst' | 'highFirst') => {
      const { mock } = server(crowd, order)
      mock.start()
      for (let i = 0; i < 8; i++) { mock.reveal(); mock.next() }
      const done = parseSnapshot(mock.snapshot(false)).status
      return [1, 2, 3].map(place => done.slots.filter(s => s.place === place).map(s => done.revealed[s.slotIndex]!.nickname))
    }
    expect(winners('lowFirst')).toEqual(winners('highFirst'))
    expect(mockSlots('highFirst').map(s => s.place)).toEqual([1, 2, 2, 3, 3, 3, 3, 3])
  })
})

describe('pause, resume and late join', () => {
  it('freezes the roller on pause and continues from the same cell on resume', () => {
    const { mock, advance, now } = server()
    const view = screen()
    useRaffleLive.getState().accept(mock.snapshot(true), now())
    useRaffleLive.getState().accept(mock.start(), now())
    advance(2000)
    const before = view.frame(now()).position
    useRaffleLive.getState().accept(mock.pause(), now())
    const paused = view.frame(now())
    expect(paused.mode).toBe('paused')
    expect(paused.position).toBeCloseTo(before, 9)
    advance(60_000)
    expect(view.frame(now()).position).toBeCloseTo(before, 9)
    useRaffleLive.getState().accept(mock.resume(), now())
    expect(view.frame(now()).position).toBeCloseTo(before, 9)
    advance(500)
    expect(view.frame(now()).spinMs).toBe(2500)
  })

  it('shows a late joiner exactly the same roller as a screen that watched from the start', () => {
    const { mock, advance, now } = server()
    const watcher = screen()
    useRaffleLive.getState().accept(mock.snapshot(true), now())
    useRaffleLive.getState().accept(mock.start(), now())
    for (let i = 0; i < 37; i++) { advance(173); watcher.frame(now()) }
    useRaffleLive.getState().accept(mock.reveal(), now())
    advance(400)
    const seen = watcher.frame(now())
    const late = screen().frame(now())
    expect(late.position).toBe(seen.position)
    expect(late.mode).toBe(seen.mode)
  })

  it('fills already revealed slots at once and resumes the current reveal at the right point', () => {
    const { mock, advance, now } = server()
    mock.start()
    for (let i = 0; i < 3; i++) { mock.reveal(); mock.next() }
    advance(SPIN.decelUntilMs)
    mock.reveal()
    advance(200)
    expect(useRaffleLive.getState().accept(mock.snapshot(true), now())).toBe(true)
    const late = screen()
    let frame = late.frame(now())
    const status = useRaffleLive.getState().status!
    expect(frame.mode).toBe('landing')
    expect(boardCells(status, frame.filled).map(c => c.state)).toEqual(['winner', 'winner', 'winner', 'pending', 'pending', 'pending', 'pending', 'pending'])
    advance(1500 + fillDelay(3, false))
    frame = late.frame(now())
    expect(frame.mode).toBe('landed')
    expect(late.director.label(frame.target!)).toBe(status.revealed[3]!.nickname)
    expect(boardCells(status, frame.filled)[3]!.state).toBe('winner')
  })

  it('skips the effects when the reveal is long over and uses the server clock', () => {
    const { mock, advance, now } = server()
    mock.start(); advance(7000); mock.reveal()
    advance(20_000)
    const deviceNow = now() - 90_000
    useRaffleLive.getState().accept(mock.snapshot(true), deviceNow)
    const frame = screen().frame(deviceNow)
    expect(phaseElapsed(useRaffleLive.getState(), deviceNow)).toBe(20_000)
    expect(frame.mode).toBe('landed')
    expect(frame.highlight).toBe(0)
    expect(frame.fly).toBe(-1)
    expect(frame.filled).toBe(true)
  })

  it('emphasises first place longer than the others', () => {
    expect(HIGHLIGHT_MS[1]).toBeGreaterThan(HIGHLIGHT_MS[2])
    expect(fillDelay(1, false)).toBeGreaterThan(fillDelay(3, false))
  })
})

describe('server decides, screen only animates', () => {
  it('never carries a winner of a slot that has not been revealed', () => {
    const { mock, now } = server()
    const seen: LiveSnapshot[] = [mock.snapshot(true), mock.start()!, mock.pause()!, mock.resume()!]
    for (const snapshot of seen) {
      expect(snapshot.revealed).toEqual([])
      useRaffleLive.getState().accept(snapshot, now())
      expect(useRaffleLive.getState().status!.revealed).toEqual([])
    }
    // Mock 서버의 확정 결과는 비공개 필드에만 있고 직렬화되지 않는다.
    expect(Object.keys(mock).sort()).toEqual(['clock', 'liveEventId', 'scenario'])

    const revealed = mock.reveal()!
    expect(revealed.revealed).toHaveLength(1)
    const next = mock.next()!
    expect(next.phase).toBe('SPINNING')
    expect(next.revealed).toHaveLength(1)
    expect(next.currentSlotIndex).toBe(1)
    expect(next.spinElapsedMs).toBe(0)
  })

  it('keeps crawling without a winner while the reveal is late', () => {
    const { mock, advance, now } = server()
    const view = screen()
    useRaffleLive.getState().accept(mock.snapshot(true), now())
    useRaffleLive.getState().accept(mock.start(), now())
    advance(40_000)
    const frame = view.frame(now())
    expect(frame.mode).toBe('spin')
    expect(frame.result).toBeUndefined()
    expect(frame.target).toBeNull()
    expect(frame.speed).toBe(SPIN.crawl)
  })

  it('copies only known fields and rejects results ahead of the current slot', () => {
    const { mock } = server()
    const spinning = mock.start()!
    const leaked = { ...spinning, winners: ['온탑고수'], revealed: [], extra: { nickname: 'x' } }
    const parsed = parseSnapshot(leaked)
    expect(Object.keys(parsed.status).sort()).toEqual(['currentSlotIndex', 'liveEventId', 'phase', 'phaseStartedAt',
      'revealed', 'serverTime', 'slots', 'spinElapsedMs', 'version'])
    expect(() => parseSnapshot({ ...spinning, revealed: [{ slotIndex: 0, nickname: '온탑고수' }] })).toThrow()
    expect(() => parseSnapshot({ ...spinning, phase: 'REVEALING', revealed: [] })).toThrow()
    expect(() => parseSnapshot({ ...spinning, phase: 'COMPLETED', currentSlotIndex: null })).toThrow()
    expect(() => parseSnapshot({ ...spinning, spinElapsedMs: -1 })).toThrow()
    expect(() => parseSnapshot({ ...spinning, slots: [...spinning.slots, { slotIndex: 8, place: 1, prizeName: 'x' }] })).toThrow()
    expect(() => parseSnapshot({ ...spinning, slots: spinning.slots.map(s => ({ ...s, place: 1 })) })).toThrow()
  })

  it('applies only newer versions and keeps REST candidates when WS omits them', () => {
    const { mock, now } = server()
    expect(useRaffleLive.getState().accept(mock.snapshot(true), now())).toBe(true)
    const started = mock.start()!
    const paused = mock.pause()!
    expect(started.candidates).toBeUndefined()
    expect(useRaffleLive.getState().accept(paused, now())).toBe(true)
    expect(useRaffleLive.getState().accept(started, now())).toBe(false)
    expect(useRaffleLive.getState().status!.phase).toBe('PAUSED')
    expect(useRaffleLive.getState().candidates).toHaveLength(crowd.candidates.length)
    expect(useRaffleLive.getState().accept({ ...paused, version: paused.version + 1, phase: 'NOPE' }, now())).toBe(false)

    const other = new MockLiveServer(few, 2, () => now())
    expect(useRaffleLive.getState().accept(other.snapshot(false), now())).toBe(true)
    expect(useRaffleLive.getState().candidates).toEqual([])
  })
})
