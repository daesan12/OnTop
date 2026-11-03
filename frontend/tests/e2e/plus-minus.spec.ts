import { test, expect, type Route } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { PARK_LAYOUT } from '../../src/map/park'
import { rpsCabinetPlacement } from '../../src/features/rpsRoulette/placement'
import { FIRST_REEL, JACKPOT, OPERATOR_REEL, SECOND_REEL } from '../../src/features/plusMinus/protocol'

/** docs/plus-minus-api.md 계약을 따르는 HTTP 대역. 판마다 세 칸을 시나리오로 고정한다. */
function plusMinusServer(rounds: [first: number, operator: '+' | '-', second: number][]) {
  let balance = 200, played = 0, round: Record<string, unknown> | null = null
  const requests: { path: string; method: string; body: string | null; key?: string }[] = []
  const keys = new Map<string, Record<string, unknown>>()
  const state = () => ({
    serverNow: new Date().toISOString(), availableBalance: balance, playedToday: played,
    rules: { fee: 30, dailyPlays: 10, firstReel: [...FIRST_REEL], operatorReel: [...OPERATOR_REEL], secondReel: [...SECOND_REEL],
      pointPayout: 10, jackpotFirst: 7, jackpotPayout: 500 },
    round,
  })
  const handle = async (route: Route) => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1/minigames/plus-minus', '')
    const key = request.headers()['idempotency-key']
    requests.push({ path, method: request.method(), body: request.postData(), key })
    if (path === '/rounds') {
      if (!keys.has(key!)) {
        const [first, operator, second] = rounds.shift()!
        const result = second === JACKPOT ? null : operator === '+' ? first + second : first - second
        const outcome = result === null ? first === 7 ? 'JACKPOT' : 'LOST' : result >= 1 ? 'PAID' : 'LOST'
        const payout = outcome === 'JACKPOT' ? 500 : outcome === 'PAID' ? result! * 10 : 0
        played++; balance += payout - 30
        round = { id: String(40 + played), firstCell: (FIRST_REEL as readonly number[]).indexOf(first), operatorCell: OPERATOR_REEL.indexOf(operator),
          secondCell: (SECOND_REEL as readonly number[]).indexOf(second), first, operator, second, result, outcome, payout, playedAt: new Date().toISOString() }
        keys.set(key!, round)
      }
      return route.fulfill({ status: 201, json: state() })
    }
    return route.fulfill({ json: state() })
  }
  return { handle, requests, balance: () => balance }
}

test('붕어빵 가게 옆 오락기에서 더하기 빼기를 골라 정지 버튼으로 계산 지급과 잭팟 500냥까지 진행한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const shop = PARK_LAYOUT.SETTINGS.fishBreadShop
  const { cabinet, front } = rpsCabinetPlacement({ ...PARK_LAYOUT.SITES.cart, ...shop })
  await fixture(page, { generatedPark: true, position: { x: front.x, y: .8, z: front.z, yaw: cabinet.yaw + Math.PI } })
  const server = plusMinusServer([[8, '-', 4], [7, '+', JACKPOT]])
  await page.route('**/api/v1/wallets/me', route => route.fulfill({ json: {
    balance: server.balance(), reservedBalance: 0, availableBalance: server.balance() } }))
  await page.route('**/api/v1/minigames/plus-minus/**', server.handle)

  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.park-scene-message')).toBeHidden({ timeout: 90000 })
  await expect(page.getByRole('button', { name: /오락기 하기/ })).toBeVisible({ timeout: 20000 })
  await screenshot(page, 'plus-minus-01-park-cabinet', 'disabled')

  await page.keyboard.press('KeyE')
  const arcade = page.getByRole('dialog', { name: '어떤 게임을 할까요?', exact: true })
  await arcade.getByRole('button', { name: /더하기 빼기 아케이드 혼자/ }).click()
  await expect(arcade.getByRole('heading', { name: '더하기 빼기 아케이드' })).toBeVisible()
  await expect(arcade).toContainText('오늘 남은 판 10 / 10판')
  await screenshot(page, 'plus-minus-01b-arcade-picker', 'disabled')
  await arcade.getByRole('button', { name: /이 게임 하기/ }).click()
  await expect(arcade).toHaveCount(0)
  const machine = page.getByRole('dialog', { name: '더하기 빼기 아케이드', exact: true })
  const face = machine.locator('.plus-minus-face')
  await expect(machine).toBeVisible()
  await expect(machine.getByRole('button', { name: 'START' })).toBeEnabled()
  await expect(face).toContainText('10/10')
  await expect(face).toContainText('200냥')
  // 900px 높이에서도 START 판까지 창 안에 보인다.
  const body = await machine.locator('.plus-minus-body').boundingBox()
  expect(body!.y + body!.height).toBeLessThanOrEqual(900)
  await screenshot(page, 'plus-minus-02-machine-idle', 'disabled')

  // 1판: 8 − 4 = 4 → 40냥. 정지 버튼은 1 → 2 → 3 순서로만 켜진다.
  await machine.getByRole('button', { name: 'START' }).click()
  const stop = (n: number) => machine.getByRole('button', { name: new RegExp(`^${n}번 정지`) })
  await expect(stop(1)).toBeEnabled()
  await expect(stop(2)).toBeDisabled()
  await expect(machine.locator('.plus-minus-lcd')).toContainText('1번 정지 버튼을 눌러요')
  await screenshot(page, 'plus-minus-03-spinning')
  await stop(1).click()
  await expect(stop(2)).toBeEnabled({ timeout: 5000 })
  await page.keyboard.press('Digit2')
  await expect(stop(3)).toBeEnabled({ timeout: 5000 })
  await page.keyboard.press('Digit3')
  await expect(machine.locator('.plus-minus-formula')).toHaveText('8 − 4 = 4 → 40냥', { timeout: 5000 })
  await expect(machine.locator('.plus-minus-payout')).toContainText('+40냥')
  await expect(face).toContainText('9/10')
  await expect(face).toContainText('210냥')
  await screenshot(page, 'plus-minus-04-paid', 'disabled')

  // 2판: 아무것도 누르지 않으면 버튼마다 5초 뒤 저절로 멈추고, 7 + JACKPOT은 500냥 연출을 보여 준다.
  await machine.getByRole('button', { name: 'START' }).click()
  await expect(stop(1)).toBeEnabled()
  await expect(face).toHaveAttribute('data-celebrate', 'jackpot', { timeout: 25000 })
  await expect(machine.locator('.plus-minus-banner')).toBeAttached()
  await screenshot(page, 'plus-minus-05-jackpot')
  await expect(machine.locator('.plus-minus-formula')).toHaveText('7 + JACKPOT! 대박 500냥')
  await expect(machine.locator('.plus-minus-payout')).toContainText('+500냥')
  await expect(face).toContainText('680냥')
  await expect(face).toContainText('8/10')

  const starts = server.requests.filter(r => r.path === '/rounds')
  expect(starts.map(r => [r.method, r.body ?? ''])).toEqual([['POST', ''], ['POST', '']])
  for (const start of starts) expect(start.key).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
  expect(new Set(starts.map(r => r.key)).size).toBe(2)

  await machine.getByRole('button', { name: '설명서' }).click()
  const manual = page.getByRole('heading', { name: '더하기 빼기 아케이드' }).last()
  await expect(manual).toBeVisible({ timeout: 10000 })
  const figure = page.getByRole('heading', { name: /게임기 살펴보기/ })
  await figure.scrollIntoViewIfNeeded()
  await expect(page.locator('.manual-figure .plus-minus-face').first()).toBeVisible()
  await screenshot(page, 'plus-minus-06-manual-figure', 'disabled')

  expect(errors).toEqual([])
})
