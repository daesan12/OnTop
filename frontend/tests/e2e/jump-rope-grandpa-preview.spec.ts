import { expect, test, type Page } from '@playwright/test'
import { grandpaTiming, planGrandpaEvents } from '../../src/jump-rope-preview/grandpaEvent'
import { poopDurationMs, poopImpactMs } from '../../src/jump-rope-preview/poopDistractionMotion'
import { distractionDefaults, distractionDurationMs } from '../../src/jump-rope-preview/pigeonDistractionMotion'
import { createDistractionSchedule } from '../../src/jump-rope-preview/pigeonDistractionSchedule'
import { defaultRopeAcceleration, ropeTempo } from '../../src/jump-rope-preview/ropeAcceleration'

const timing = grandpaTiming({ peak: 0.6, flightMs: 400 }, { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 })!
const v1 = ropeTempo(1, { profile: defaultRopeAcceleration, playedMs: 0 })

/** One seed's grandpa visits, its poop raid and the v2 passages that follow from them. */
function course(seed: number) {
  const plan = planGrandpaEvents(seed, { speed: 1, acceleration: defaultRopeAcceleration }, timing)
  const swings = plan.flatMap(event => event.swings)
  /** v2 passage = v1 passage + every earlier dangerous stretch. */
  const passage = (turn: number) => v1.timeForTurns(turn)
    + swings.filter(swing => swing.kind === 'danger' && swing.anchor < turn).reduce((sum, swing) => sum + swing.stretchMs, 0)
  const isDanger = (turn: number) => swings.some(swing => swing.kind === 'danger' && swing.anchor === turn)
  const poop = createDistractionSchedule(seed).events.find(event => event.kind === 'poop')!
  return { seed, plan, swings, passage, isDanger, poop }
}

const seed = 409
const { plan, swings, passage } = course(seed)

/**
 * The page clock only moves when the test sets it. Every key handler first advances the round to the key's
 * time, so passages, broom contacts and the MISS freeze land at exact play times regardless of frame rate.
 */
function driver(page: Page, { passage, isDanger } = course(seed)) {
  let sceneMs = 0
  let offset = 0
  let next = 1
  const panel = page.getByLabel('할아버지 일정')
  const live = page.getByLabel('할아버지 실시간 상태')
  const judgement = page.getByLabel('실제 판정 상세')
  async function at(ms: number) {
    expect(ms).toBeGreaterThanOrEqual(sceneMs)
    sceneMs = ms
    await page.evaluate(value => (window as unknown as { setTestClock: (ms: number) => void }).setTestClock(value), ms)
  }
  const play = (ms: number) => at(offset + ms)
  async function jump(turn: number) {
    await play(passage(turn) - timing.perfectLeadMs)
    await page.keyboard.press('Space')
  }
  /** PERFECT through `last`, ducking under every dangerous broom unless told not to. */
  async function perfectThrough(last: number, skipDuck: number[] = []) {
    for (; next <= last; next++) {
      await jump(next)
      if (!isDanger(next) || skipDuck.includes(next)) continue
      await play(passage(next) + 200)
      await page.keyboard.down('ArrowDown')
      await play(passage(next) + timing.hitOffsetMs + 10)
      await page.keyboard.up('ArrowDown')
    }
  }
  /** A KeyS tap only advances the round to now: it presses and releases the duck at the same instant. */
  const tick = () => page.keyboard.press('KeyS')
  /** PERFECT jumps and broom ducks merged in time order with `extras`, until the jumps reach `untilMs`. */
  async function playWith(untilMs: number, extras: { at: number; act: () => Promise<void> }[] = []) {
    const actions = extras.filter(extra => extra.at <= untilMs)
    for (; passage(next) - timing.perfectLeadMs < untilMs; next++) {
      const turn = next
      actions.push({ at: passage(turn) - timing.perfectLeadMs, act: () => page.keyboard.press('Space') })
      if (!isDanger(turn)) continue
      actions.push({ at: passage(turn) + 200, act: () => page.keyboard.down('ArrowDown') })
      actions.push({ at: passage(turn) + timing.hitOffsetMs + 10, act: () => page.keyboard.up('ArrowDown') })
    }
    actions.sort((a, b) => a.at - b.at)
    for (const { at: playMs, act } of actions) {
      await play(playMs)
      await act()
    }
  }
  return {
    panel, live, judgement, at, play, jump, perfectThrough, tick, playWith,
    get scene() { return sceneMs },
    begin(ms: number) { offset = ms },
    skip(turn: number) { next = turn + 1 },
    /** After a MISS freeze, play resumes at `resumedAt` from the frozen passage. */
    resume(resumedAt: number, turn: number) { offset = resumedAt - passage(turn) },
  }
}

// The dev page is served only by the jump rope preview server. Run with playwright.jump-rope-grandpa.config.ts.
test.skip(({ baseURL }) => baseURL !== 'http://127.0.0.1:5206', 'jump rope preview server only')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const base = performance.now()
    let offset = 0
    ;(window as unknown as { setTestClock: (ms: number) => void }).setTestClock = ms => { offset = ms }
    performance.now = () => base + offset
  })
})

test('할아버지가 기존 방해와 함께 등장하고 숙이기 회피·피격 MISS·60초 완주가 기록된다', async ({ page }) => {
  await page.goto('/__dev/jump-rope.html')
  await page.getByLabel('고정 시드 (다음 판)').fill(String(seed))
  const game = driver(page)
  await game.at(1000)
  await page.getByRole('button', { name: '게임 시작' }).click()
  await expect(game.panel).toContainText('1차 15~30초 · 예정')
  for (const swing of swings) await expect(game.panel).toContainText(`${swing.anchor}번째 통과 뒤`)
  await game.at(4000)
  // A KeyS tap starts play without a jump, even if a frame already crossed the countdown.
  await page.keyboard.press('KeyS')
  game.begin(4000)

  // ArrowDown never scrolls the page, and either duck key keeps the posture until both are released.
  const scrollY = await page.evaluate(() => window.scrollY)
  await game.play(passage(1) - 700)
  await page.keyboard.down('ArrowDown')
  await page.keyboard.down('KeyS')
  await page.keyboard.down('ArrowDown')
  await game.play(passage(1) - 600)
  await page.keyboard.up('ArrowDown')
  await page.keyboard.press('Space')
  await expect(game.live).toContainText('숙이기 숙임')
  await page.keyboard.up('KeyS')
  await expect(game.live).toContainText('숙이기 서 있음')
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
  // Losing focus releases a held duck.
  await page.keyboard.down('ArrowDown')
  await expect(game.live).not.toContainText('숙이기 서 있음')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(game.live).toContainText('숙이기 서 있음')
  await page.keyboard.up('ArrowDown')

  const [firstSafe, firstDanger, secondDanger] = plan[0]!.swings
  // He shouts as he walks in, over his head on the canvas.
  await game.perfectThrough(firstSafe!.anchor - 1)
  await game.play(Math.max(passage(firstSafe!.anchor - 1) - 200, plan[0]!.startMs + 500))
  await page.keyboard.press('KeyS')
  await expect(page.locator('.grandpa-speech')).toBeVisible()
  await expect(page.locator('.grandpa-speech')).toHaveText('예끼 이놈들!')
  await game.perfectThrough(secondDanger!.anchor, [secondDanger!.anchor])
  await expect(page.locator('.grandpa-speech')).toBeHidden()
  await expect(game.judgement).toContainText(`${secondDanger!.anchor - 1}번째 통과 · PERFECT`)
  await expect(game.panel).toContainText(`2타 위험 · ${firstDanger!.anchor}번째 통과 뒤`)
  await expect(game.panel).toContainText('회피 성공')
  await expect(game.panel).toContainText('휘두름')

  // No duck: the broom stuns, Space is ignored, and the next passage is exactly one MISS.
  await game.play(passage(secondDanger!.anchor) + timing.hitOffsetMs + 5)
  // A tap only advances the round to now; the contact already happened standing up.
  await page.keyboard.press('KeyS')
  await expect(game.live).toContainText('스턴 있음')
  await expect(game.panel).toContainText('피격')
  await game.jump(secondDanger!.anchor + 1)
  await game.play(passage(secondDanger!.anchor + 1) + 0.5)
  await page.keyboard.press('Space')
  const missAt = game.scene
  await expect(game.judgement).toContainText(`${secondDanger!.anchor + 1}번째 통과 · MISS`)
  // The ignored Space left no new jump: the lead still measures the jump before the stun.
  const staleLead = Math.round(passage(secondDanger!.anchor + 1) - passage(secondDanger!.anchor) + timing.perfectLeadMs)
  await expect(game.judgement).toContainText(`입력 → 통과 ${staleLead}ms`)
  await expect(page.getByLabel('3회 중 2회 남음')).toBeVisible()
  await expect(game.live).toContainText('스턴 없음')
  await game.at(missAt + 1350)
  await page.keyboard.press('Space')
  game.resume(missAt + 1350, secondDanger!.anchor + 1)
  game.skip(secondDanger!.anchor + 1)
  await expect(page.getByLabel('현재 게임 상태')).toContainText('플레이 중')

  let last = 1
  while (passage(last + 1) < 60000) last++
  await game.perfectThrough(last)
  await game.play(60010)
  await page.keyboard.press('Space')
  await expect(page.getByLabel('현재 게임 상태')).toContainText('완주 엔딩')
  await game.at(game.scene + 4000)
  await page.keyboard.press('Space')
  await expect(page.getByLabel('현재 게임 상태')).toContainText('게임 종료')
  await expect(game.judgement).toContainText(`${last}번째 통과 · PERFECT`)
  await expect(game.panel).toContainText('1차 15~30초 · 완료')
  await expect(game.panel).toContainText('2차 40~60초 · 완료')
  await expect(game.panel).not.toContainText('예정')
  const stretch = swings.reduce((sum, swing) => sum + swing.stretchMs, 0)
  await expect(game.live).toContainText(`줄 지연 누적 ${stretch.toFixed(3)}ms`)
})

/** A seed whose poop splat lands while the second grandpa visit is on stage. */
function overlappingRaid() {
  for (let candidate = 1; candidate < 50000; candidate++) {
    const raid = course(candidate)
    const visit = raid.plan[1]!
    const impact = raid.poop.atMs + poopImpactMs
    if (visit.status === 'pending' && impact >= visit.startMs + 300 && impact + 1200 <= visit.endMs) return raid
  }
  throw new Error('no seed overlaps the poop raid with a grandpa visit')
}

async function startRound(page: Page, raid: ReturnType<typeof course>) {
  await page.goto('/__dev/jump-rope.html')
  await page.getByLabel('고정 시드 (다음 판)').fill(String(raid.seed))
  const game = driver(page, raid)
  await game.at(1000)
  await page.getByRole('button', { name: '게임 시작' }).click()
  await game.at(4000)
  await page.keyboard.press('KeyS')
  game.begin(4000)
  // Step exactly at every scheduled distraction so each one starts on time.
  const starts = createDistractionSchedule(raid.seed).events.map(event => ({ at: event.atMs, act: game.tick }))
  return { game, starts }
}

function splat(page: Page) {
  const overlay = page.locator('.distraction-splash')
  return { overlay, opacity: () => overlay.evaluate(element => Number((element as HTMLElement).style.opacity)) }
}

test('비둘기 똥 테러가 할아버지와 함께 나와도 점프·숙이기·판정을 막지 않고 정확히 2초 동안 사라진다', async ({ page }) => {
  const raid = overlappingRaid()
  const { game, starts } = await startRound(page, raid)
  const { overlay, opacity } = splat(page)
  const start = raid.poop.atMs
  const impact = start + poopImpactMs
  let duckTurn = 1
  while (raid.passage(duckTurn) < impact + 250 || raid.isDanger(duckTurn)) duckTurn++
  expect(raid.passage(duckTurn) + 350).toBeLessThan(start + poopDurationMs)

  await game.playWith(start + poopDurationMs + 400, [...starts,
    { at: start + 300, act: async () => {
      await game.tick()
      await expect(page.getByLabel('자동 방해 일정')).toContainText('똥 테러 · 진행 중')
      await expect(overlay).toBeHidden()
    } },
    { at: impact, act: async () => {
      await game.tick()
      await expect(overlay).toBeVisible()
      await expect.poll(opacity).toBeCloseTo(1, 3)
      await expect(game.panel).toContainText('2차 40~60초 · 등장 중')
    } },
    // The splat never takes the keys: a duck works under it, and Space still jumps PERFECT.
    { at: raid.passage(duckTurn) + 250, act: async () => {
      await page.keyboard.down('ArrowDown')
      await expect(game.live).not.toContainText('숙이기 서 있음')
    } },
    { at: raid.passage(duckTurn) + 350, act: async () => {
      await page.keyboard.up('ArrowDown')
      await expect(game.live).toContainText('숙이기 서 있음')
    } },
    { at: impact + 1000, act: async () => {
      await game.tick()
      await expect.poll(opacity).toBeCloseTo(0.5, 3)
      await expect(game.judgement).toContainText('PERFECT')
      await expect(page.getByLabel('3회 중 3회 남음')).toBeVisible()
    } },
    { at: impact + 1999, act: async () => {
      await game.tick()
      await expect.poll(opacity).toBeCloseTo(0.0005, 4)
    } },
    { at: start + poopDurationMs, act: async () => {
      await game.tick()
      await expect(overlay).toBeHidden()
    } },
  ])
  await expect(page.getByLabel('자동 방해 일정')).toContainText('똥 테러 · 완료')
  await expect(page.getByLabel('3회 중 3회 남음')).toBeVisible()
  await expect(game.judgement).toContainText('PERFECT')
})

test('똥 테러는 MISS에 정리되고, 3번째 MISS에서는 게임 오버 똥만 남으며 재시작 후 사라진다', async ({ page }) => {
  const raid = course(seed)
  const { game, starts } = await startRound(page, raid)
  const { overlay } = splat(page)
  const impact = raid.poop.atMs + poopImpactMs
  await game.playWith(impact + 300, [...starts, { at: impact + 300, act: game.tick }])
  await expect(overlay).toBeVisible()

  // No more jumps: the next passage is a MISS, which cancels the raid and its splat on the same frame.
  let missTurn = 1
  while (raid.passage(missTurn) <= impact + 300) missTurn++
  await game.play(raid.passage(missTurn) + 1)
  await game.tick()
  await expect(game.judgement).toContainText(`${missTurn}번째 통과 · MISS`)
  await expect(overlay).toBeHidden()
  await expect(page.getByLabel('자동 방해 일정')).toContainText('똥 테러 · 중단')

  const visibleSplats = page.locator('.finale-splash:visible')
  for (let guard = 0; guard < 200 && await visibleSplats.count() === 0; guard++) {
    await game.at(game.scene + 100)
    await game.tick()
  }
  await expect(page.getByLabel('현재 게임 상태')).toContainText('게임 오버 연출')
  await expect(visibleSplats).toHaveCount(1)
  await expect(overlay).toBeHidden()

  await game.at(game.scene + 1500)
  await game.tick()
  await page.getByRole('button', { name: '다시 시작' }).click()
  await expect(page.locator('.rope-countdown')).toBeVisible()
  await expect(visibleSplats).toHaveCount(0)
  await expect(overlay).toBeHidden()
})

/** The first seed whose 45-60 s window shows two distractions together, and the moment they overlap. */
function overlappingDistractions() {
  for (let candidate = 1; candidate < 50000; candidate++) {
    const events = createDistractionSchedule(candidate).events.filter(event => event.windowEndMs === 60000)
    const second = events.find(event => events.some(first => first.lane !== event.lane && first.atMs < event.atMs
      && event.atMs + 600 < first.atMs + distractionDurationMs({ ...first, startedAt: 0, settings: distractionDefaults })))
    if (second) return { raid: course(candidate), overlapAt: second.atMs + 300 }
  }
  throw new Error('no seed overlaps two distractions')
}

test('45~60초 구간은 비둘기 방해 두 개가 동시에 진행돼도 점프 판정이 그대로다', async ({ page }) => {
  const { raid, overlapAt } = overlappingDistractions()
  const { game, starts } = await startRound(page, raid)
  const running = () => page.getByLabel('자동 방해 일정').evaluate(element =>
    (element as HTMLElement).innerText.split('\n').filter(line => line.includes('진행 중')).length)
  await game.playWith(overlapAt + 1, [...starts, { at: overlapAt, act: async () => {
    await game.tick()
    await expect.poll(running).toBe(2)
  } }])
  await expect(page.getByLabel('3회 중 3회 남음')).toBeVisible()
  await expect(game.judgement).toContainText('PERFECT')
})
