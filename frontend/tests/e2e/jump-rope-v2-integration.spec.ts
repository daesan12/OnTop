import { expect, test, type JSHandle, type Page } from '@playwright/test'
import rulesV2 from '../../../backend/src/test/resources/jump-rope/rules-v2.json' with { type: 'json' }
import { MINI_PROPS } from '../../src/park/mapConfig'
import { rpsCabinetPlacement } from '../../src/features/rpsRoulette/placement'
import { fixture } from './contractFixture'

/**
 * Story 430: a park round with rulesVersion 2 plays the grandpa raid and submits the same integer logs the
 * server fixture holds. A rulesVersion 1 round keeps the original game.
 */
type Clock = JSHandle<{ set: (ms: number) => void }>
type Input = { us: number; type: 'keydown' | 'keyup'; code: string }
type FixtureRound = { name: string; seed: number; jumpOffsetsUs: number[]; duckSpansUs: number[][]; score: number
  perfect: number; good: number; miss: number }
const rounds = rulesV2.rounds as FixtureRound[]
const fixtureRound = (name: string) => rounds.find(round => round.name === name && round.seed === 42)!

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
    return { set: (ms: number) => { elapsed = ms } }
  })
}

function inputsOf(round: Pick<FixtureRound, 'jumpOffsetsUs' | 'duckSpansUs'>, held = false): Input[] {
  const spans = held ? round.duckSpansUs.slice(0, -1) : round.duckSpansUs
  const inputs: Input[] = [
    ...round.jumpOffsetsUs.map(us => ({ us, type: 'keydown' as const, code: 'Space' })),
    ...spans.flatMap(([start, end]) => [{ us: start!, type: 'keydown' as const, code: 'ArrowDown' }, { us: end!, type: 'keyup' as const, code: 'ArrowDown' }]),
  ]
  if (held) inputs.push({ us: round.duckSpansUs.at(-1)![0]!, type: 'keydown', code: 'KeyS' })
  return inputs.sort((a, b) => a.us - b.us)
}

/** Dispatches each key at its play time: the round starts 3 s after the click and no MISS has frozen it yet. */
async function press(clock: Clock, inputs: Input[], thenMs?: number) {
  await clock.evaluate((time, { inputs, thenMs }) => {
    const stage = document.querySelector('.jump-rope-world .preview-stage')!
    for (const { us, type, code } of inputs) {
      time.set(3000 + us / 1000)
      stage.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }))
    }
    if (thenMs !== undefined) time.set(thenMs)
  }, { inputs, thenMs })
}

test('v2 판은 할아버지가 나타나고 숙이기 기록을 서버와 같은 정수 로그로 제출한 뒤 확정 결과를 보여 준다', async ({ page }) => {
  await setupPark(page)
  const round = fixtureRound('botDodgesEverything')
  let submitted: unknown
  await page.route('**/api/v1/minigames/jump-rope/rounds', route => route.fulfill({ status: 201, json: roundResponse('430', 2) }))
  await page.route('**/api/v1/minigames/jump-rope/rounds/430/complete', route => {
    submitted = route.request().postDataJSON()
    return route.fulfill({ json: { id: '430', rulesVersion: 2, score: 1965, counts: { perfect: 66, good: 0, miss: 0 },
      endReason: 'time', completedAt: new Date().toISOString(), reward: 39 } })
  })
  const game = await openJumpRope(page)
  await expect(game.locator('.rope-menu__rules li')).toHaveCount(3)
  const clock = await fakeClock(page)
  await game.getByRole('button', { name: '게임 시작' }).click()
  await expect(game.getByLabel('시작 카운트다운')).toHaveText('3')
  await expect(game.locator('.rope-rule-hint')).toContainText('↓ 또는 S를 눌러 숙이세요')

  // First visit of seed 42: entry at 15.75 s, shouting until 0.9 s after arrival.
  const inputs = inputsOf(round)
  await press(clock, inputs.filter(input => input.us <= 16_500_000), 3000 + 16_500)
  await expect(game.locator('.rope-rule-hint')).toHaveCount(0)
  await expect(game.locator('.grandpa-speech')).toBeVisible({ timeout: 30_000 })
  await expect(game.locator('.grandpa-speech')).toHaveText(/예끼/)
  await press(clock, inputs.filter(input => input.us > 16_500_000), 63_001)

  await expect.poll(() => submitted).toEqual({ jumpOffsetsUs: round.jumpOffsetsUs, duckSpansUs: round.duckSpansUs })
  await clock.evaluate(time => time.set(66_000))
  await expect(game.getByRole('heading', { name: '비둘기들이 인정한 인간' })).toBeVisible()
  await expect(game.locator('.rope-result__score dd')).toHaveText('1,965')
  await expect(game.locator('.rope-result__verdicts dd')).toHaveText(['66회', '0회', '0회'])
  await expect(game.locator('.rope-result__reward')).toHaveText('획득 엽전 +39냥')
  await expect(game.locator('.grandpa-speech')).toBeHidden()
})

test('v2 판에서 숙인 채 MISS 3회로 끝나면 열린 숙이기 구간을 마지막 통과 시각으로 닫아 제출한다', async ({ page }) => {
  await setupPark(page)
  const round = fixtureRound('duckHeldUntilTheThirdMissEndsTheRound')
  let submitted: unknown
  await page.route('**/api/v1/minigames/jump-rope/rounds', route => route.fulfill({ status: 201, json: roundResponse('431', 2) }))
  await page.route('**/api/v1/minigames/jump-rope/rounds/431/complete', route => {
    submitted = route.request().postDataJSON()
    return route.fulfill({ json: { id: '431', rulesVersion: 2, score: round.score,
      counts: { perfect: round.perfect, good: round.good, miss: 3 }, endReason: 'missLimit', completedAt: new Date().toISOString(), reward: 0 } })
  })
  const game = await openJumpRope(page)
  const clock = await fakeClock(page)
  await game.getByRole('button', { name: '게임 시작' }).click()
  await expect(game.getByLabel('시작 카운트다운')).toHaveText('3')
  const inputs = inputsOf(round, true)
  await press(clock, inputs)
  // S stays held: every following passage misses, through two MISS freezes, until the third ends the round.
  let elapsed = 3000 + inputs.at(-1)!.us / 1000
  for (let guard = 0; guard < 200 && submitted === undefined; guard++) {
    elapsed += 150
    await clock.evaluate((time, ms) => time.set(ms), elapsed)
    await page.waitForTimeout(25)
  }
  expect(submitted).toEqual({ jumpOffsetsUs: round.jumpOffsetsUs, duckSpansUs: round.duckSpansUs })
  await clock.evaluate((time, ms) => time.set(ms), elapsed + 8000)
  await expect(game.locator('.rope-result__verdicts dd')).toHaveText([`${round.perfect}회`, '0회', '3회'])
  await expect(game.locator('.grandpa-speech')).toBeHidden()
})

test('v1 판은 할아버지와 숙이기 안내 없이 기존 규칙과 요청을 유지한다', async ({ page }) => {
  await setupPark(page)
  let submitted: unknown
  await page.route('**/api/v1/minigames/jump-rope/rounds', route => route.fulfill({ status: 201, json: roundResponse('432', 1) }))
  await page.route('**/api/v1/minigames/jump-rope/rounds/432/complete', route => {
    submitted = route.request().postDataJSON()
    return route.fulfill({ json: { id: '432', rulesVersion: 1, score: 0, counts: { perfect: 0, good: 0, miss: 3 },
      endReason: 'missLimit', completedAt: new Date().toISOString(), reward: 0 } })
  })
  const game = await openJumpRope(page)
  const clock = await fakeClock(page)
  await game.getByRole('button', { name: '게임 시작' }).click()
  await expect(game.getByLabel('시작 카운트다운')).toHaveText('3')
  await expect(game.locator('.rope-rule-hint')).toHaveCount(0)
  // ↓ in a v1 round is not a game key; the three passages without a jump end the round.
  await press(clock, [{ us: 100_000, type: 'keydown', code: 'ArrowDown' }, { us: 200_000, type: 'keyup', code: 'ArrowDown' }], 3000 + 2_000)
  await expect(game.locator('.grandpa-speech')).toHaveCount(0)
  for (let ms = 3000 + 2_000; ms < 3000 + 12_000 && submitted === undefined; ms += 150) {
    await clock.evaluate((time, value) => time.set(value), ms)
    await page.waitForTimeout(25)
  }
  await expect.poll(() => submitted).toEqual({ jumpOffsetsUs: [] })
})
