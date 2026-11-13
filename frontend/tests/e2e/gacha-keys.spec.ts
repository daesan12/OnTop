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
test('뽑기권 수를 직접 입력하면 살 수 있는 만큼으로 맞춰 산다', async ({ page }) => {
  const { bought } = await setup(page, 5000)
  const input = page.getByRole('textbox', { name: '구매할 뽑기권 수 입력' })
  await input.fill('75')
  await expect(input).toHaveValue('50')
  await expect(page.getByRole('button', { name: '뽑기권 50장 구매 5,000냥', exact: true })).toBeVisible()
  await input.pressSequentially('99'); await expect(input).toHaveValue('50')
  await input.fill('12'); await input.press('Enter')
  await page.getByRole('button', { name: '뽑기권 12장 구매 1,200냥', exact: true }).click()
  await expect(page.locator('.art-result')).toContainText('뽑기권 12장을 받았어요')
  expect(bought).toHaveLength(1); expect((bought[0] as { quantity: number }).quantity).toBe(12)
})
test('키보드로 옮겨 간 버튼은 스페이스로 그 버튼을 누르고 뽑지 않는다', async ({ page }) => {
  const { draws, bought } = await setup(page, 1000)
  const tabTo = async (name: string) => { for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(n => document.activeElement?.getAttribute('aria-label') === n, name)) return } throw new Error('not reached ' + name) }
  await tabTo('한 장 늘리기'); await page.keyboard.press('Space')
  await expect(page.getByRole('textbox', { name: '구매할 뽑기권 수 입력' })).toHaveValue('2')
  await tabTo('A급 캡슐 미리보기'); await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'A급 캡슐 미리보기' })).toHaveAttribute('aria-pressed', 'true')
  await tabTo('뽑기권 2장 구매 200냥'); await page.keyboard.press('Space')
  await expect.poll(() => bought.length).toBe(1)
  await page.waitForTimeout(300); expect(draws()).toBe(0)
})
test('마우스로 누른 버튼이 포커스에 남아 있어도 스페이스는 뽑는다', async ({ page }) => {
  const { draws } = await setup(page, 1000)
  await page.getByRole('button', { name: '한 장 늘리기' }).click()
  await page.keyboard.press('Space')
  await expect.poll(draws).toBe(1)
  await expect(page.getByRole('textbox', { name: '구매할 뽑기권 수 입력' })).toHaveValue('2')
})
