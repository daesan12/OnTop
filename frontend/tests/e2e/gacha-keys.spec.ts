import { expect, test, type Page } from '@playwright/test'
const initial = [1, 2, 4, 8, 15]
const machine = () => ({ roundId: '1', version: 1, refillEndsAt: null, remaining: 30,
  prizes: initial.map((remaining, i) => ({ grade: i + 1, initial: initial[i], remaining, value: [1000, 500, 250, 100, 20][i] })) })
async function setup(page: Page, balance = 1000) {
  const inventory = { tickets: 2, boxes: [1, 2, 3, 4].map(grade => ({ grade, quantity: 0 })), balance, availableBalance: balance }
  const bought: unknown[] = []; let draws = 0
  await page.route('**/api/v1/gacha', route => route.fulfill({ json: { enabled: true, ticketPrice: 100, serverNow: new Date().toISOString(), inventory, products: [], machine: machine() } }))
  await page.route('**/api/v1/gacha/tickets', route => { const body = route.request().postDataJSON(); bought.push(body)
    return route.fulfill({ json: { operationId: body.operationId, kind: 'BUY', roundId: null, grade: 0, product: null, duplicate: false,
      paidCoins: 100 * (body.quantity ?? 1), awardedCoins: 0, inventory, completedAt: new Date().toISOString() } }) })
  await page.route('**/api/v1/gacha/draws', route => { draws++; const body = route.request().postDataJSON()
    return route.fulfill({ json: { operationId: body.operationId, kind: 'DRAW', roundId: '1', grade: 5, product: null, duplicate: false,
      paidCoins: 0, awardedCoins: 20, inventory: { ...inventory, tickets: 1 }, completedAt: new Date().toISOString() } }) })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/tests/fixtures/gacha-draw.html')
  const draw = page.getByRole('button', { name: '뽑기권 1장 사용', exact: true })
  await expect(draw).toBeEnabled({ timeout: 60000 })
  return { bought, draws: () => draws }
}
test('스페이스로 뽑고, 연출을 건너뛰고, 결과를 확인한다', async ({ page }) => {
  const { draws } = await setup(page)
  await page.keyboard.press('Space')
  await expect.poll(draws).toBe(1)
  await expect(page.getByRole('status').filter({ hasText: '공유 기계에서' }).or(page.getByRole('button', { name: /연출 건너뛰기/ }))).toBeVisible()
  await page.keyboard.press('Space')
  const result = page.locator('.art-result')
  await expect(result).toContainText('20냥 당첨!', { timeout: 10000 })
  await page.keyboard.press('Space')
  await expect(result).toHaveCount(0)
  expect(draws()).toBe(1)
})
test('뽑기권을 여러 장 한 번에 사고, 살 수 있는 만큼만 늘린다', async ({ page }) => {
  const { bought } = await setup(page, 350)
  const more = page.getByRole('button', { name: '한 장 늘리기' })
  await more.click(); await more.click(); await expect(more).toBeDisabled()
  const buy = page.getByRole('button', { name: '뽑기권 3장 구매 300냥', exact: true })
  await buy.click()
  await expect(page.locator('.art-result')).toContainText('뽑기권 3장을 받았어요')
  expect(bought).toHaveLength(1); expect((bought[0] as { quantity: number }).quantity).toBe(3)
})
