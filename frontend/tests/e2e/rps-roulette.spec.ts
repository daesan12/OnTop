import { test, expect, type Route } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { PARK_LAYOUT } from '../../src/map/park'
import { rpsCabinetPlacement } from '../../src/features/rpsRoulette/placement'
import { ROULETTE } from '../../src/features/rpsRoulette/protocol'

type Hand = 'ROCK' | 'SCISSORS' | 'PAPER'
const beats: Record<Hand, Hand> = { ROCK: 'SCISSORS', SCISSORS: 'PAPER', PAPER: 'ROCK' }

/** docs/rps-roulette-api.md 계약을 따르는 HTTP 대역. 기계 손과 룰렛 칸만 시나리오로 고정한다. */
function rpsServer(machineHands: Hand[], cell: number) {
  let balance = 200, played = 0, seq = 0, duelNo = 0, level = 0, phase: 'DUEL' | 'DECIDE' | 'SETTLED' = 'SETTLED'
  let challenging = false, fee = 0, machine: Hand = 'ROCK', last: Record<string, unknown> | null = null
  let outcome: string | null = null, payout = 0, inputEndsAt: string | null = null, deadlineAt: string | null = null
  const requests: { path: string; body: unknown; key?: string }[] = []
  const keys = new Set<string>()
  const arm = (ms: number) => { const now = Date.now(); inputEndsAt = new Date(now + ms).toISOString(); deadlineAt = new Date(now + ms + 1500).toISOString() }
  const nextDuel = () => { duelNo++; machine = machineHands.shift()!; phase = 'DUEL'; arm(5000) }
  const state = () => ({
    serverNow: new Date().toISOString(), availableBalance: balance, playedToday: played,
    rules: { fees: [10, 20, 30], dailyPlays: 15, multipliers: [1, 1.5, 2], roulette: [...ROULETTE], duelLimitMs: 5000, decideLimitMs: 10000, graceMs: 1500 },
    round: seq === 0 ? null : { id: '41', fee, phase, seq, stakeLevel: level, multiplier: [1, 1.5, 2][level], challenging, duelNo,
      commitment: phase === 'DUEL' ? 'c'.repeat(64) : null, inputEndsAt, deadlineAt, lastDuel: last, outcome,
      rouletteCell: outcome === 'PAID' ? cell : null, rouletteValue: outcome === 'PAID' ? ROULETTE[cell] : null, payout,
      startedAt: new Date().toISOString(), settledAt: phase === 'SETTLED' ? new Date().toISOString() : null },
  })
  const handle = async (route: Route) => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1/minigames/rps-roulette', '')
    const body = request.postDataJSON?.() ?? null
    requests.push({ path, body, key: request.headers()['idempotency-key'] })
    if (path === '/rounds') {
      if (!keys.has(request.headers()['idempotency-key']!)) {
        keys.add(request.headers()['idempotency-key']!)
        fee = body.fee; balance -= fee; played++; seq = 1; level = 0; challenging = false; last = null; outcome = null; payout = 0
        nextDuel()
      }
      return route.fulfill({ status: 201, json: state() })
    }
    if (path.endsWith('/hands') && body.seq === seq && phase === 'DUEL') {
      const player = body.hand as Hand
      const result = player === machine ? 'DRAW' : beats[player] === machine ? 'WIN' : 'LOSE'
      last = { duelNo, playerHand: player, machineHand: machine, salt: '00', result, auto: false }
      seq++
      if (result === 'DRAW') nextDuel()
      else if (result === 'LOSE') { phase = 'SETTLED'; outcome = 'LOST'; inputEndsAt = deadlineAt = null }
      else { if (challenging) { level++; challenging = false } phase = 'DECIDE'; arm(10000) }
    } else if (path.endsWith('/challenge') && body.seq === seq && phase === 'DECIDE') {
      seq++; challenging = true; nextDuel()
    } else if (path.endsWith('/stop') && body.seq === seq && phase === 'DECIDE') {
      seq++; phase = 'SETTLED'; outcome = 'PAID'; payout = fee * ROULETTE[cell]! * [1, 1.5, 2][level]!; balance += payout
      inputEndsAt = deadlineAt = null
    }
    return route.fulfill({ json: state() })
  }
  return { handle, requests, balance: () => balance }
}

test('붕어빵 가게 옆 게임기에서 비김·승리·도전 1차·룰렛 지급까지 진행한다', async ({ page }) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const shop = PARK_LAYOUT.SETTINGS.fishBreadShop
  const { cabinet, front } = rpsCabinetPlacement({ ...PARK_LAYOUT.SITES.cart, ...shop })
  await fixture(page, { generatedPark: true, position: { x: front.x, y: .8, z: front.z, yaw: cabinet.yaw + Math.PI } })
  const server = rpsServer(['ROCK', 'ROCK', 'SCISSORS'], ROULETTE.indexOf(7))
  await page.route('**/api/v1/wallets/me', route => route.fulfill({ json: {
    balance: server.balance(), reservedBalance: 0, availableBalance: server.balance() } }))
  await page.route('**/api/v1/minigames/rps-roulette/**', server.handle)

  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.park-scene-message')).toBeHidden({ timeout: 90000 })
  await expect(page.getByRole('button', { name: /가위바위보 룰렛 하기/ })).toBeVisible({ timeout: 20000 })
  await screenshot(page, 'rps-01-park-cabinet', 'disabled')

  await page.keyboard.press('KeyE')
  const machine = page.getByRole('dialog', { name: '가위바위보 룰렛', exact: true })
  await expect(machine).toBeVisible()
  await expect(machine.getByRole('button', { name: 'START' })).toBeEnabled()
  await expect(machine.locator('.rps-roulette-plays')).toContainText('판 15/15')
  await screenshot(page, 'rps-02-machine-idle', 'disabled')

  await machine.getByRole('button', { name: '30', exact: true }).click()
  await machine.getByRole('button', { name: 'START' }).click()
  await expect(machine.getByRole('button', { name: '바위 내기' })).toBeEnabled()
  await expect(machine.locator('.rps-roulette-lcd')).toContainText('5초')
  await screenshot(page, 'rps-03-duel-shuffle')

  await page.keyboard.press('Digit1')
  await expect(machine.locator('.rps-roulette-lcd')).toContainText('비겼다')
  await screenshot(page, 'rps-04-draw', 'disabled')

  await expect(machine.getByRole('button', { name: '보 내기' })).toBeEnabled({ timeout: 5000 })
  await machine.getByRole('button', { name: '보 내기' }).click()
  await expect(machine.getByRole('button', { name: '멈춤' })).toBeEnabled({ timeout: 5000 })
  await expect(machine.locator('.rps-roulette-lcd')).toContainText('도전 1차 ×1.5')
  await screenshot(page, 'rps-05-win-decide', 'disabled')

  await machine.getByRole('button', { name: '도전' }).click()
  await expect(machine.locator('.rps-roulette-lcd')).toContainText('도전 1차!')
  await machine.getByRole('button', { name: '바위 내기' }).click()
  await expect(machine.locator('.rps-roulette-mult')).toHaveText('×1.5', { timeout: 5000 })
  await expect(machine.getByRole('button', { name: '멈춤' })).toBeEnabled({ timeout: 5000 })
  await screenshot(page, 'rps-06-challenge-win', 'disabled')

  await machine.getByRole('button', { name: '멈춤' }).click()
  await expect(machine.locator('.rps-roulette-lcd')).toContainText('룰렛이 돌아가요')
  await page.waitForTimeout(1500)
  await screenshot(page, 'rps-07-roulette-spin')
  await expect(machine.locator('.rps-roulette-payout')).toContainText('+315냥', { timeout: 10000 })
  await expect(machine.locator('.rps-roulette-lcd')).toContainText('30냥 × 7칸 × 1.5 = 315냥')
  await expect(machine.locator('.rps-roulette-plays')).toContainText('판 14/15')
  // 900px 높이에서도 조작판 마지막 줄까지 창 안에 보인다.
  const deck = await machine.locator('.rps-roulette-lower').boundingBox()
  expect(deck!.y + deck!.height).toBeLessThanOrEqual(900)
  await screenshot(page, 'rps-08-paid', 'disabled')

  const start = server.requests.find(r => r.path === '/rounds')!
  expect(start.key).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
  expect(start.body).toEqual({ fee: 30 })
  expect(server.requests.filter(r => r.path !== '/status' && r.path !== '/rounds').map(r => r.body)).toEqual([
    { seq: 1, hand: 'ROCK' }, { seq: 2, hand: 'PAPER' }, { seq: 3 }, { seq: 4, hand: 'ROCK' }, { seq: 5 },
  ])

  await machine.getByRole('button', { name: '설명서' }).click()
  const manual = page.getByRole('heading', { name: '가위바위보 룰렛' }).last()
  await expect(manual).toBeVisible({ timeout: 10000 })
  await screenshot(page, 'rps-09-manual', 'disabled')
  const figure = page.getByRole('heading', { name: /게임기 살펴보기/ })
  await figure.scrollIntoViewIfNeeded()
  await expect(page.locator('.manual-figure .rps-roulette-face').first()).toBeVisible()
  await screenshot(page, 'rps-10-manual-figure', 'disabled')

  expect(errors).toEqual([])
})
