import { describe, expect, it } from 'vitest'
import rulesV2 from '../../../backend/src/test/resources/jump-rope/rules-v2.json'
import { completionResultMs } from '../../src/jump-rope-preview/completionFinale'
import { finaleImpactMs, finaleResultMs } from '../../src/jump-rope-preview/gameOverFinale'
import { createGrandpaRuntime, grandpaTiming, grandpaWindupMs, pressRoundDuck, releaseDuck } from '../../src/jump-rope-preview/grandpaEvent'
import { shoutFromMs, strikeLeadMs } from '../../src/jump-rope-preview/grandpaPose'
import {
  broomSwingLeadMs, createAudioCueTracker, cueLateToleranceMs, observeRoundAudio, type AudioFrame, type BgmState, type JumpRopeSfx,
} from '../../src/jump-rope-preview/jumpRopeAudioCues'
import { clearanceWindowMs } from '../../src/jump-rope-preview/jumpRopeJudgement'
import { distractionDefaults } from '../../src/jump-rope-preview/pigeonDistractionMotion'
import { advanceDistractionSchedule, createDistractionSchedule, type DistractionSchedule } from '../../src/jump-rope-preview/pigeonDistractionSchedule'
import { poopImpactMs } from '../../src/jump-rope-preview/poopDistractionMotion'
import { rankedDurationUs, rankedPassageUs } from '../../src/jump-rope-preview/previewMotion'
import {
  advancePreviewRound, createPreviewRound, raidGrandpa, requestRoundJump, resetPreviewRound, roundCue, type PreviewRound,
} from '../../src/jump-rope-preview/previewRound'
import { pressRankedDuck, releaseRankedDuck, startRankedV2 } from '../../src/jump-rope-preview/rankedGrandpa'
import { defaultRopeAcceleration as profile, ropeTempo } from '../../src/jump-rope-preview/ropeAcceleration'

/** The jump rope sound pack follows round state the game already decided; these drive real rounds frame by frame. */
const settings = { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 }
const reactionMs = 1350
const rope = { speed: 1, acceleration: profile }
const timing = grandpaTiming({ peak: 0.6, flightMs: 400 }, settings)!
const window = clearanceWindowMs(0.6, 400, settings)!
const v1 = ropeTempo(1, { profile, playedMs: 0 })
const frameMs = 1000 / 60

type Heard = { sound: JumpRopeSfx; playedMs: number; now: number }

/** Observes every step like JumpRopePreview does, twice per step to stand in for re-renders and key handlers. */
function listen(round: PreviewRound, seed?: number) {
  let schedule: DistractionSchedule | undefined = seed === undefined ? undefined : createDistractionSchedule(seed)
  const tracker = createAudioCueTracker()
  const heard: Heard[] = []
  const loop: { state: BgmState; now: number }[] = []
  return {
    heard, loop,
    get schedule() { return schedule! },
    count: (sound: JumpRopeSfx) => heard.filter(item => item.sound === sound).length,
    at: (sound: JumpRopeSfx) => heard.filter(item => item.sound === sound),
    observe(now: number) {
      if (schedule) {
        const phase = round.phase.kind
        const mode = round.endReason ? 'ended' : phase === 'menu' || phase === 'initialCountdown' ? 'inactive'
          : phase !== 'playing' ? 'miss' : round.motion.ropeSpeed > 0 ? 'playing' : 'paused'
        schedule = advanceDistractionSchedule(schedule, { playedMs: round.playedMs, mode, enabled: true, previewBusy: false, settings: distractionDefaults })
      }
      const frame: AudioFrame = {
        round, cue: roundCue(round, now), grandpa: raidGrandpa(round),
        distractions: (schedule?.active ?? []).map(({ index, cue }) => ({ key: String(index), cue, elapsedMs: round.playedMs - cue.startedAt })),
      }
      const { sfx, bgm } = observeRoundAudio(tracker, frame)
      // Looking at the same step again never repeats a sound.
      expect(observeRoundAudio(tracker, frame)).toEqual({ sfx: [], bgm })
      for (const sound of sfx) heard.push({ sound, playedMs: round.playedMs, now })
      if (loop.at(-1)?.state !== bgm) loop.push({ state: bgm, now })
    },
  }
}

/** The unranked preview round: 3 s countdown from scene time 0, then 60 fps frames. */
function previewGame(seed: number, grandpa = true) {
  const round = createPreviewRound('menu')
  resetPreviewRound(round, 'initialCountdown')
  if (grandpa) round.grandpa = createGrandpaRuntime(seed, rope, timing)
  const swings = round.grandpa?.events.flatMap(event => event.swings.map(swing => ({ ...swing }))) ?? []
  const ear = listen(round, seed)
  let now = 0
  function step(at: number) {
    now = at
    advancePreviewRound(round, at, 1, settings, reactionMs, profile)
    ear.observe(at)
  }
  for (const at of [0, 1000, 2000, 3000]) step(at)
  /** Frames until the play clock reaches `playMs`, waiting through any MISS freeze. */
  function playUntil(playMs: number) {
    for (let guard = 0; round.playedMs < playMs - 1e-7 && !round.endReason; guard++) {
      if (guard > 1e6) throw new Error('round is stuck')
      step(now + (round.phase.kind === 'playing' ? Math.min(frameMs, playMs - round.playedMs) : frameMs))
    }
  }
  function finish() {
    for (let guard = 0; round.phase.kind !== 'ended'; guard++) {
      if (guard > 1e6) throw new Error('round is stuck')
      step(now + frameMs)
    }
  }
  const pass = (turn: number) => v1.timeForTurns(turn)
    + swings.filter(swing => swing.kind === 'danger' && swing.anchor < turn).reduce((sum, swing) => sum + swing.stretchMs, 0)
  const isDanger = (turn: number) => swings.some(swing => swing.kind === 'danger' && swing.anchor === turn)
  function jump(turn: number, leadMs = timing.perfectLeadMs) {
    playUntil(pass(turn) - leadMs)
    return requestRoundJump(round, now, 0.6, 0.4)
  }
  function dodge(turn: number) {
    playUntil(pass(turn) + 200)
    expect(pressRoundDuck(round, 'ArrowDown', now)).toBe(true)
    playUntil(pass(turn) + timing.hitOffsetMs + 5)
    releaseDuck(round.grandpa!.duck, 'ArrowDown')
  }
  return { round, ear, step, playUntil, finish, pass, isDanger, jump, dodge, get now() { return now } }
}

const within = (value: number, from: number) => {
  expect(value).toBeGreaterThanOrEqual(from - 1e-6)
  expect(value).toBeLessThanOrEqual(from + frameMs + 1e-6)
}

describe('jump rope sound cues', () => {
  it('플레이 흐름에 맞춰 카운트다운·GO·BGM·할아버지·방해 소리를 한 번씩 내고 GOOD·PERFECT는 무음이다', () => {
    const game = previewGame(409)
    // An early GOOD clears the rope but misses the PERFECT window.
    const goodLead = (window.earliest + window.ideal + settings.perfectWindowMs) / 2
    for (let turn = 1; game.pass(turn) < 60_000; turn++) {
      // A GOOD every 13th turn still leaves PERFECT streaks past 10, which stay silent as well.
      const good = turn % 13 === 0 && !game.isDanger(turn) && !game.isDanger(turn - 1)
      expect(game.jump(turn, good ? goodLead : timing.perfectLeadMs)).toBe(true)
      if (game.isDanger(turn)) game.dodge(turn)
    }
    game.finish()
    const { round, ear } = game
    expect(round.endReason).toBe('time')
    expect(round.stats.counts.miss).toBe(0)
    expect(round.stats.counts.good).toBeGreaterThan(0)
    expect(round.stats.maxCombo).toBeGreaterThanOrEqual(10)

    expect(ear.at('countdownTick').map(item => item.now)).toEqual([0, 1000, 2000])
    expect(ear.at('gameGo').map(item => item.now)).toEqual([3000])
    expect(ear.count('missLaugh')).toBe(0)
    expect(ear.count('broomHit')).toBe(0)
    expect(ear.count('gameOver')).toBe(0)
    expect(ear.count('victory')).toBe(1)

    const events = round.grandpa!.events
    expect(events.map(event => event.status)).toEqual(['finished', 'finished'])
    const enters = ear.at('grandpaEnter')
    expect(enters).toHaveLength(2)
    enters.forEach((item, visit) => within(item.playedMs, events[visit]!.startMs + shoutFromMs))
    const swings = events.flatMap(event => event.swings)
    expect(swings.map(swing => swing.result)).toEqual(['swung', 'dodged', 'dodged', 'dodged', 'dodged', 'dodged'])
    // The windup sounds only for the five dangerous swings; every swing, the first safe one too, gets the sweep.
    const danger = swings.filter(swing => swing.kind === 'danger')
    const windups = ear.at('broomWindup')
    expect(windups).toHaveLength(5)
    windups.forEach((item, index) => within(item.playedMs, danger[index]!.hitMs! - grandpaWindupMs))
    const sweeps = ear.at('broomSwing')
    // The clip's audible build (from ~80 ms) starts inside the 140 ms strike and peaks at the contact.
    expect(broomSwingLeadMs).toBeGreaterThanOrEqual(strikeLeadMs)
    expect(broomSwingLeadMs - 80).toBeLessThan(strikeLeadMs)
    expect(sweeps).toHaveLength(6)
    sweeps.forEach((item, index) => within(item.playedMs, swings[index]!.hitMs! - broomSwingLeadMs))

    const started = ear.schedule.events.filter(event => event.status === 'finished')
    expect(started.filter(event => event.kind === 'flight').length).toBeGreaterThan(0)
    expect(ear.count('pigeonFlap')).toBe(started.filter(event => event.kind === 'flight').length)
    expect(ear.count('poopSplat')).toBe(started.filter(event => event.kind === 'poop').length)
    for (const raid of started.filter(event => event.kind === 'poop')) {
      expect(ear.at('poopSplat').some(item => Math.abs(item.playedMs - raid.atMs - poopImpactMs) < 1100)).toBe(true)
    }

    // The loop stays off through 3·2·1 and the GO banner, then plays until the 60 s finish.
    expect(ear.loop.map(item => item.state)).toEqual(['off', 'on', 'off'])
    within(ear.loop[1]!.now, 3550)
    expect(ear.loop[2]!.now).toBe(ear.at('victory')[0]!.now)
    // Nothing else ever sounded: no GOOD, PERFECT or combo cue exists.
    const expected = new Set<JumpRopeSfx>(['countdownTick', 'gameGo', 'grandpaEnter', 'broomWindup', 'broomSwing', 'pigeonFlap', 'poopSplat', 'victory'])
    expect(ear.heard.filter(item => !expected.has(item.sound))).toEqual([])
  })

  it('빗자루에 맞는 순간에는 피격음만 내고, 비웃음은 다음 줄의 스턴 MISS에서 낸다', () => {
    const game = previewGame(409)
    const [, , second] = game.round.grandpa!.events[0]!.swings
    for (let turn = 1; turn <= second!.anchor; turn++) {
      expect(game.jump(turn)).toBe(true)
      if (game.isDanger(turn) && turn !== second!.anchor) game.dodge(turn)
    }
    const contact = game.pass(second!.anchor) + timing.hitOffsetMs
    game.playUntil(contact + 1)
    expect(game.round.grandpa!.stun).not.toBeNull()
    const hits = game.ear.at('broomHit')
    expect(hits).toHaveLength(1)
    within(hits[0]!.playedMs, contact)
    expect(game.ear.count('missLaugh')).toBe(0)
    // Space is refused while stunned, and the next passage is the MISS that laughs.
    expect(game.jump(second!.anchor + 1)).toBe(false)
    game.playUntil(game.pass(second!.anchor + 1) + 1)
    expect(game.round.stats.counts.miss).toBe(1)
    const laughs = game.ear.at('missLaugh')
    expect(laughs).toHaveLength(1)
    expect(laughs[0]!.playedMs).toBeCloseTo(game.pass(second!.anchor + 1), 6)
    expect(game.ear.count('broomHit')).toBe(1)
    // The loop keeps playing through the MISS freeze.
    expect(game.ear.loop.map(item => item.state)).toEqual(['off', 'on'])
  })

  it('3번째 MISS는 비웃음 → 피날레 똥 → 결과 화면 게임 오버 순서이며 BGM은 3번째 MISS에서 멈춘다', () => {
    const game = previewGame(7, false)
    while (!game.round.endReason) game.step(game.now + frameMs)
    game.finish()
    const { ear } = game
    expect(game.round.endReason).toBe('missLimit')
    const laughs = ear.at('missLaugh')
    expect(laughs).toHaveLength(3)
    expect(ear.heard.slice(-3).map(item => item.sound)).toEqual(['missLaugh', 'poopSplat', 'gameOver'])
    const last = laughs[2]!.now
    within(ear.at('poopSplat')[0]!.now - last, finaleImpactMs)
    within(ear.at('gameOver')[0]!.now - last, finaleResultMs)
    // The 2 s laugh is over before the sting.
    expect(ear.at('gameOver')[0]!.now - last).toBeGreaterThan(2000)
    expect(ear.count('victory')).toBe(0)
    expect(ear.loop.map(item => item.state)).toEqual(['off', 'on', 'off'])
    expect(ear.loop[2]!.now).toBe(last)
  })

  it('60초 완주 팡파르는 완주 순간 한 번이고 완주 연출이 끝나도 반복하지 않는다', () => {
    const game = previewGame(11, false)
    for (let turn = 1; game.pass(turn) < 60_000; turn++) expect(game.jump(turn)).toBe(true)
    game.playUntil(60_000)
    game.step(game.now + frameMs)
    const victory = game.ear.at('victory')
    expect(victory).toHaveLength(1)
    game.finish()
    expect(game.ear.at('victory')).toEqual(victory)
    expect(game.ear.loop.at(-1)).toEqual({ state: 'off', now: victory[0]!.now })
    // completion → ended takes the finale's 2.7 s, without a second cue.
    expect(game.round.phase.kind).toBe('ended')
    expect(completionResultMs).toBeGreaterThan(0)
  })

  it('비행 방해는 시작에 한 번, 똥 테러는 화면에 묻는 순간 한 번이고 늦게 따라잡은 단계는 조용하다', () => {
    const round = createPreviewRound('menu')
    const tracker = createAudioCueTracker()
    const hear = (key: string, kind: 'flight' | 'walk' | 'manhole' | 'poop', elapsedMs: number) =>
      observeRoundAudio(tracker, { round, cue: 'playing', distractions: [{ key, cue: { kind }, elapsedMs }] }).sfx
    expect(hear('a', 'flight', 0)).toEqual(['pigeonFlap'])
    expect(hear('a', 'flight', 300)).toEqual([])
    expect(hear('b', 'flight', 12)).toEqual(['pigeonFlap'])
    expect(hear('c', 'flight', cueLateToleranceMs + 1)).toEqual([])
    expect(hear('c', 'flight', 600)).toEqual([])
    expect(hear('w', 'walk', 0)).toEqual([])
    expect(hear('m', 'manhole', 0)).toEqual([])
    expect(hear('p', 'poop', poopImpactMs - 1)).toEqual([])
    expect(hear('p', 'poop', poopImpactMs + 5)).toEqual(['poopSplat'])
    // The splat only fades afterwards: no repeat.
    expect(hear('p', 'poop', poopImpactMs + 1000)).toEqual([])
    expect(hear('q', 'poop', poopImpactMs + cueLateToleranceMs + 1)).toEqual([])
    round.endReason = 'missLimit'
    expect(hear('r', 'flight', 0)).toEqual([])
  })
})

/** A ranked park round on the integer play clock, stepped at 60 fps like the dialog. */
function rankedGame(seed: number | null) {
  const startAt = 3000
  const round = createPreviewRound('menu')
  resetPreviewRound(round, 'initialCountdown', startAt)
  if (seed !== null) startRankedV2(round, seed)
  const ear = listen(round)
  let now = 0
  function step(at: number) {
    now = at
    advancePreviewRound(round, at, 1, settings, reactionMs, profile)
    ear.observe(at)
  }
  step(0)
  const playUs = () => Math.round(round.playedMs * 1000)
  /** Frames until the play clock reaches `us`. An input inside a MISS freeze lands on the frozen passage. */
  function reach(us: number) {
    for (let guard = 0; guard < 1e6; guard++) {
      if (round.endReason) return false
      const phase = round.phase.kind
      if (phase === 'playing' ? playUs() >= us : phase !== 'initialCountdown' && playUs() === us) return true
      const clock = round.ranked!
      const target = phase === 'playing' ? clock.segmentAt + (us - clock.segmentUs) / 1000 : Infinity
      step(Math.min(now + frameMs, target))
    }
    throw new Error('round is stuck')
  }
  function finish() {
    for (let guard = 0; round.phase.kind !== 'ended'; guard++) {
      if (guard > 1e6) throw new Error('round is stuck')
      step(now + frameMs)
    }
  }
  return { round, ear, reach, finish, get now() { return now } }
}

type FixtureRound = { name: string; seed: number; jumpOffsetsUs: number[]; duckSpansUs: number[][]; miss: number; hit: number; dodged: number; reason: string }
const fixtureRound = (name: string) => (rulesV2.rounds as FixtureRound[]).find(round => round.name === name && round.seed === 42)!

function replay(name: string) {
  const fixture = fixtureRound(name)
  const game = rankedGame(fixture.seed)
  const inputs = [
    ...fixture.jumpOffsetsUs.map(us => ({ us, act: () => requestRoundJump(game.round, game.now, 0.6, 0.4) })),
    ...fixture.duckSpansUs.flatMap(([start, end]) => [
      { us: start!, act: () => pressRankedDuck(game.round, 'ArrowDown') },
      { us: end!, act: () => releaseRankedDuck(game.round, 'ArrowDown') },
    ]),
  ].sort((a, b) => a.us - b.us)
  for (const { us, act } of inputs) if (game.reach(us)) act()
  game.finish()
  return { ...game, fixture }
}

describe('jump rope sound cues in the ranked park game', () => {
  it('v2 라운드는 서버 판정과 같은 피격·MISS 수만큼 피격음·비웃음을 내고 할아버지 소리를 동기화한다', () => {
    const late = replay('lateDuckIsHitAndStunMissesTheNextPassage')
    expect(late.round.stats.counts.miss).toBe(late.fixture.miss)
    expect(late.ear.count('broomHit')).toBe(late.fixture.hit)
    expect(late.ear.count('missLaugh')).toBe(late.fixture.miss)
    expect(late.ear.count('grandpaEnter')).toBe(2)
    expect(late.ear.count('broomWindup')).toBe(5)
    expect(late.ear.count('broomSwing')).toBe(6)
    expect(late.ear.count('victory')).toBe(1)
    const swings = late.round.grandpa!.events.flatMap(event => event.swings)
    late.ear.at('broomSwing').forEach((item, index) => within(item.playedMs, swings[index]!.hitMs! - broomSwingLeadMs))
    // The hit sounds at the contact; its laugh waits for the next passage.
    const hit = late.ear.at('broomHit')[0]!
    const laugh = late.ear.at('missLaugh')[0]!
    expect(laugh.playedMs).toBeGreaterThan(hit.playedMs)

    const bot = replay('botDodgesEverything')
    expect(bot.ear.count('broomHit')).toBe(0)
    expect(bot.ear.count('missLaugh')).toBe(0)
    expect(bot.ear.count('broomWindup')).toBe(5)

    const never = replay('neverDucks')
    expect(never.round.endReason).toBe('missLimit')
    expect(never.ear.count('broomHit')).toBe(3)
    expect(never.ear.count('missLaugh')).toBe(3)
    expect(never.ear.heard.slice(-2).map(item => item.sound)).toEqual(['poopSplat', 'gameOver'])
  })

  it('v1 라운드는 할아버지 소리를 전혀 내지 않는다', () => {
    const game = rankedGame(null)
    // Even a stray runtime on a v1 round is never treated as the raid on stage.
    game.round.grandpa = createGrandpaRuntime(42, rope, timing)
    expect(raidGrandpa(game.round)).toBeUndefined()
    for (let turn = 1; rankedPassageUs(turn) < rankedDurationUs; turn++) {
      if (game.reach(rankedPassageUs(turn) - 270_000)) expect(requestRoundJump(game.round, game.now, 0.6, 0.4)).toBe(true)
    }
    game.finish()
    expect(game.round.endReason).toBe('time')
    for (const sound of ['grandpaEnter', 'broomWindup', 'broomSwing', 'broomHit'] as const) expect(game.ear.count(sound)).toBe(0)
    expect(game.ear.count('missLaugh')).toBe(0)
    expect(game.ear.count('victory')).toBe(1)
    expect(game.ear.at('countdownTick').length).toBe(3)
    expect(game.ear.count('gameGo')).toBe(1)
  })
})
