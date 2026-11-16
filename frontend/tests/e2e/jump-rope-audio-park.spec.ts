import { expect, test, type JSHandle, type Page } from '@playwright/test'
import rulesV2 from '../../../backend/src/test/resources/jump-rope/rules-v2.json' with { type: 'json' }
import { MINI_PROPS } from '../../src/park/mapConfig'
import { rpsCabinetPlacement } from '../../src/features/rpsRoulette/placement'
import { grandpaWindupMs } from '../../src/jump-rope-preview/grandpaEvent'
import { shoutFromMs } from '../../src/jump-rope-preview/grandpaPose'
import { broomSwingLeadMs } from '../../src/jump-rope-preview/jumpRopeAudioCues'
import { planRankedV2 } from '../../src/jump-rope-preview/rankedGrandpa'
import { fixture } from './contractFixture'
import { parkMusic, playedSounds, recordJumpRopeAudio, startedSounds } from './jumpRopeAudioProbe'

/**
 * The final sound pack in the park game. The server round starts 3 s after the click; the page clock moves only when
 * the test sets it, and the dialog's own frames step the round at that time. jumpRopeAudioProbe records the real
 * Web Audio starts and stops by file name.
 */
type Clock = JSHandle<{ set: (ms: number) => void }>
type FixtureRound = { name: string; seed: number; jumpOffsetsUs: number[]; duckSpansUs: number[][] }
const fixtureRound = (name: string) => (rulesV2.rounds as FixtureRound[]).find(round => round.name === name && round.seed === 42)!
const raidFiles = ['grandpa_enter_voice', 'broom_windup', 'broom_swing', 'broom_hit']

function setupPark(page: Page) {
  const { cabinet, front } = rpsCabinetPlacement(MINI_PROPS[0])
  return fixture(page, { position: { ...front, y: .8, yaw: cabinet.yaw + Math.PI } })
}

async function openJumpRope(page: Page) {
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.park-scene-message')).toBeHidden({ timeout: 90000 })
  await expect(page.getByRole('button', { name: /오락기 하기/ })).toBeVisible({ timeout: 10000 })
  await page.keyboard.press('KeyE')
  const arcade = page.getByRole('dialog', { name: '어떤 게임을 할까요?' })
  await arcade.getByRole('button', { name: /구구구 줄넘기/ }).click()
  await arcade.getByRole('button', { name: /이 게임 하기/ }).click()
  return page.getByRole('dialog', { name: '구구구 줄넘기' })
}

function roundResponse(id: string, rulesVersion: 1 | 2, now = Date.now()) {
  return { id, seed: 42, rulesVersion, durationMs: 60000, serverNow: new Date(now).toISOString(),
    startedAt: new Date(now + 3000).toISOString(), expiresAt: new Date(now + 98000).toISOString() }
}

async function fakeClock(page: Page): Promise<Clock> {
  return page.evaluateHandle(() => {
    const origin = performance.now()
    let elapsed = 0
    performance.now = () => origin + elapsed
    ;(window as unknown as { testClock: () => number }).testClock = () => elapsed
    return { set: (ms: number) => { elapsed = ms } }
  })
}

/** Moves the page clock and waits two frames, so the dialog steps the round there without any key. */
async function frameAt(page: Page, clock: Clock, ms: number) {
  await clock.evaluate((time, value) => time.set(value), ms)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

async function key(clock: Clock, ms: number, type: 'keydown' | 'keyup', code: string) {
  await clock.evaluate((time, { ms, type, code }) => {
    time.set(ms)
    document.querySelector('.jump-rope-world .preview-stage')!.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }))
  }, { ms, type, code })
}

/**
 * 3·2·1, GO at 3 s, and the loop once the 550 ms GO banner is gone. Each frame lands 10 ms past a boundary: the
 * start time carries float rounding from the server offset, and a frame exactly on it may still read the previous cue.
 */
async function countdown(page: Page, clock: Clock, from = 0) {
  for (const ms of [1010, 2010, 3010, 3570]) await frameAt(page, clock, from + ms)
}

test.beforeEach(async ({ page }) => {
  await recordJumpRopeAudio(page)
  await setupPark(page)
})

test('v2 공원 판은 할아버지 보이스·위험 스윙 준비·스윙을 일정대로 한 번씩 내고 제출 기록은 바뀌지 않는다', async ({ page }) => {
  const round = fixtureRound('botDodgesEverything')
  let submitted: unknown
  await page.route('**/api/v1/minigames/jump-rope/rounds', route => route.fulfill({ status: 201, json: roundResponse('440', 2) }))
  await page.route('**/api/v1/minigames/jump-rope/rounds/440/complete', route => {
    submitted = route.request().postDataJSON()
    return route.fulfill({ json: { id: '440', rulesVersion: 2, score: 1965, counts: { perfect: 66, good: 0, miss: 0 },
      endReason: 'time', completedAt: new Date().toISOString(), reward: 39 } })
  })
  const game = await openJumpRope(page)
  const clock = await fakeClock(page)
  await game.getByRole('button', { name: '게임 시작' }).click()
  await expect(game.getByLabel('시작 카운트다운')).toHaveText('3')
  await countdown(page, clock)

  // The server's visits for seed 42, on the play clock that starts at scene time 3 s.
  const visits = planRankedV2(42).runtime.events
  const due = visits.flatMap(visit => [
    { file: 'grandpa_enter_voice', ms: visit.startMs + shoutFromMs },
    ...visit.swings.flatMap(swing => [
      ...(swing.kind === 'danger' ? [{ file: 'broom_windup', ms: swing.hitMs! - grandpaWindupMs }] : []),
      { file: 'broom_swing', ms: swing.hitMs! - broomSwingLeadMs },
    ]),
  ])
  const actions: { at: number; act: () => Promise<void> }[] = [
    ...round.jumpOffsetsUs.map(us => ({ at: 3000 + us / 1000, act: () => key(clock, 3000 + us / 1000, 'keydown', 'Space') })),
    ...round.duckSpansUs.flatMap(([start, end]) => [
      { at: 3000 + start! / 1000, act: () => key(clock, 3000 + start! / 1000, 'keydown', 'ArrowDown') },
      { at: 3000 + end! / 1000, act: () => key(clock, 3000 + end! / 1000, 'keyup', 'ArrowDown') },
    ]),
    ...due.map(({ ms }) => ({ at: 3000 + ms + 10, act: () => frameAt(page, clock, 3000 + ms + 10) })),
  ].sort((a, b) => a.at - b.at)
  for (const { act } of actions) await act()
  await frameAt(page, clock, 63_001)
  await expect.poll(() => submitted).toEqual({ jumpOffsetsUs: round.jumpOffsetsUs, duckSpansUs: round.duckSpansUs })
  await frameAt(page, clock, 66_000)
  await expect(game.getByRole('heading', { name: '비둘기들이 인정한 인간' })).toBeVisible()

  const played = (await playedSounds(page)).filter(item => item.kind === 'start')
  const raid = played.filter(item => raidFiles.includes(item.file.replace(/^sfx\//, '')))
  expect(raid.map(item => item.file.replace(/^sfx\//, ''))).toEqual(due.map(item => item.file))
  raid.forEach((item, index) => {
    expect(item.at - 3000).toBeGreaterThanOrEqual(due[index]!.ms)
    expect(item.at - 3000).toBeLessThan(due[index]!.ms + 30)
  })
  // Pigeon distractions may add a flutter or a splat; nothing else sounds, and no GOOD/PERFECT cue exists.
  const main = (await startedSounds(page)).filter(file => !raidFiles.includes(file) && file !== 'pigeon_flap' && file !== 'pigeon_poop_splat')
  expect(main).toEqual(['countdown_tick', 'countdown_tick', 'countdown_tick', 'game_go', 'bgm_comedy_loop', 'victory_fanfare'])
  expect((await playedSounds(page)).some(item => item.kind === 'stop' && item.file === 'bgm_comedy_loop')).toBe(true)
})

test('v1 공원 판은 할아버지 소리 없이 MISS 비웃음 3번, 피날레 똥, 결과 화면 게임 오버 순서로 재생한다', async ({ page }) => {
  let submitted: unknown
  await page.route('**/api/v1/minigames/jump-rope/rounds', route => route.fulfill({ status: 201, json: roundResponse('441', 1) }))
  await page.route('**/api/v1/minigames/jump-rope/rounds/441/complete', route => {
    submitted = route.request().postDataJSON()
    return route.fulfill({ json: { id: '441', rulesVersion: 1, score: 0, counts: { perfect: 0, good: 0, miss: 3 },
      endReason: 'missLimit', completedAt: new Date().toISOString(), reward: 0 } })
  })
  const game = await openJumpRope(page)
  const clock = await fakeClock(page)
  await game.getByRole('button', { name: '게임 시작' }).click()
  await expect(game.getByLabel('시작 카운트다운')).toHaveText('3')
  await countdown(page, clock)
  let ms = 3570
  for (let guard = 0; guard < 300 && !(await startedSounds(page)).includes('game_over'); guard++) {
    ms += 100
    await frameAt(page, clock, ms)
  }
  expect(submitted).toEqual({ jumpOffsetsUs: [] })
  expect(await startedSounds(page)).toEqual(['countdown_tick', 'countdown_tick', 'countdown_tick', 'game_go', 'bgm_comedy_loop',
    'pigeon_miss_laugh', 'pigeon_miss_laugh', 'pigeon_miss_laugh', 'pigeon_poop_splat', 'game_over'])
  const played = await playedSounds(page)
  const third = played.filter(item => item.kind === 'start' && item.file.endsWith('pigeon_miss_laugh')).at(-1)!
  const sting = played.find(item => item.kind === 'start' && item.file.endsWith('game_over'))!
  expect(sting.at - third.at).toBeGreaterThan(2000)
  expect(played.some(item => item.kind === 'stop' && item.file === 'bgm_comedy_loop' && item.at === third.at)).toBe(true)
})

test('ESC 확인창은 BGM과 효과음을 멈추고, 다시하기는 카운트다운부터, 그만하기는 소리 없이 공원으로 돌아간다', async ({ page }) => {
  let rounds = 0
  await page.route('**/api/v1/minigames/jump-rope/rounds', route => route.fulfill({ status: 201, json: roundResponse(String(450 + ++rounds), 2) }))
  const game = await openJumpRope(page)
  const clock = await fakeClock(page)
  await game.getByRole('button', { name: '게임 시작' }).click()
  await expect(game.getByLabel('시작 카운트다운')).toHaveText('3')
  await countdown(page, clock)
  await frameAt(page, clock, 4000)
  const loops = async (kind: 'start' | 'stop') => (await playedSounds(page)).filter(item => item.kind === kind && item.file === 'bgm_comedy_loop').length
  expect(await loops('start')).toBe(1)

  await page.keyboard.press('Escape')
  const confirmation = page.getByRole('alertdialog', { name: '게임을 그만둘까요?' })
  await expect(confirmation).toBeVisible()
  expect(await loops('stop')).toBe(1)
  // The frozen round stays silent while the dialog is open.
  const frozen = (await playedSounds(page)).length
  await frameAt(page, clock, 9000)
  expect((await playedSounds(page)).length).toBe(frozen)

  await confirmation.getByRole('button', { name: '다시하기' }).click()
  await expect(game.getByLabel('시작 카운트다운')).toHaveText('3')
  await expect.poll(async () => (await playedSounds(page)).slice(frozen).filter(item => item.kind === 'start').map(item => item.file))
    .toEqual(['sfx/countdown_tick'])
  await countdown(page, clock, 9000)
  expect(await loops('start')).toBe(2)

  await page.keyboard.press('Escape')
  await expect(confirmation).toBeVisible()
  expect(await loops('stop')).toBe(2)
  await confirmation.getByRole('button', { name: '그만하기' }).click()
  await expect(game).toBeHidden()
  const closed = (await playedSounds(page)).length
  await frameAt(page, clock, 30_000)
  expect((await playedSounds(page)).length).toBe(closed)
  expect(rounds).toBe(2)
})

test('공원 BGM은 줄넘기 창이 열린 동안 카운트다운까지 멈추고, 창을 닫으면 멈춘 위치에서 이어진다', async ({ page }) => {
  await page.route('**/api/v1/minigames/jump-rope/rounds', route => route.fulfill({ status: 201, json: roundResponse('460', 2) }))
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.park-scene-message')).toBeHidden({ timeout: 90000 })
  await expect(page.getByRole('button', { name: /오락기 하기/ })).toBeVisible({ timeout: 10000 })
  // The first key opens audio, and the park's period track starts under the arcade menu.
  await page.keyboard.press('KeyE')
  await expect.poll(async () => (await parkMusic(page)).playing, { timeout: 15000 }).toBe(1)
  const track = (await parkMusic(page)).starts[0]!.file
  const arcade = page.getByRole('dialog', { name: '어떤 게임을 할까요?' })
  await arcade.getByRole('button', { name: /구구구 줄넘기/ }).click()
  await arcade.getByRole('button', { name: /이 게임 하기/ }).click()
  const game = page.getByRole('dialog', { name: '구구구 줄넘기' })
  await expect(game).toBeVisible()
  await expect.poll(async () => (await parkMusic(page)).playing).toBe(0)

  // 3·2·1 count down in silence: no park track and no jump rope loop. The loop starts after GO, alone.
  const clock = await fakeClock(page)
  await game.getByRole('button', { name: '게임 시작' }).click()
  await expect(game.getByLabel('시작 카운트다운')).toHaveText('3')
  for (const ms of [1010, 2010]) await frameAt(page, clock, ms)
  expect(await startedSounds(page)).toEqual(['countdown_tick', 'countdown_tick', 'countdown_tick'])
  // Stop before the first passage (1.3 s of play), which would add a MISS laugh.
  for (const ms of [3010, 3570, 3800]) await frameAt(page, clock, ms)
  expect(await startedSounds(page)).toEqual(['countdown_tick', 'countdown_tick', 'countdown_tick', 'game_go', 'bgm_comedy_loop'])
  expect((await parkMusic(page)).playing).toBe(0)

  await page.keyboard.press('Escape')
  const confirmation = page.getByRole('alertdialog', { name: '게임을 그만둘까요?' })
  await confirmation.getByRole('button', { name: '그만하기' }).click()
  await expect(game).toBeHidden()
  await expect.poll(async () => (await parkMusic(page)).playing).toBe(1)
  const resumed = (await parkMusic(page)).starts.at(-1)!
  expect(resumed.file).toBe(track)
  // It picks up where it stopped instead of restarting the track.
  expect(resumed.offset).toBeGreaterThan(0)
})
