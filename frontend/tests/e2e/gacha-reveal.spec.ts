import { expect, test, type Page } from '@playwright/test'
const initial = [1, 2, 4, 8, 15]
function machine(counts = initial, version = 1, roundId = '1') {
  return { roundId, version, refillEndsAt: null, remaining: counts.reduce((a, b) => a + b, 0),
    prizes: counts.map((remaining, i) => ({ grade: i + 1, initial: initial[i], remaining, value: [1000, 500, 250, 100, 20][i] })) }
}
async function setup(page: Page, grade = 2, failure = false) {
  let completed = false, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const inventory = { tickets: 2, boxes: [1, 2, 3, 4].map(grade => ({ grade, quantity: 0 })), balance: 1000, availableBalance: 1000 }
  const counts = initial.map((n, i) => i === grade - 1 ? n - 1 : n)
  const updated = grade === 1 ? machine(initial, 2, '2') : machine(counts, 2)
  await page.route('**/api/v1/gacha', route => route.fulfill({ json: { enabled: true, ticketPrice: 100,
    serverNow: new Date().toISOString(), inventory: completed ? { ...inventory, tickets: 1, balance: grade === 5 ? 1020 : 1000 } : inventory,
    products: [], machine: completed ? updated : machine() } }))
  let posts = 0
  const operationIds: string[] = []
  await page.route('**/api/v1/gacha/draws', async route => {
    posts++; operationIds.push(route.request().postDataJSON().operationId); await gate
    if (failure) return route.fulfill({ status: 503, json: { code: 'GACHA_UNAVAILABLE', message: '결과를 확인하지 못했어요.' } })
    completed = true
    return route.fulfill({ json: { operationId: route.request().postDataJSON().operationId, kind: 'DRAW', roundId: '1', grade,
      product: null, duplicate: false, paidCoins: 0, awardedCoins: grade === 5 ? 20 : 0,
      inventory: { ...inventory, tickets: 1 }, completedAt: new Date().toISOString() } })
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/tests/fixtures/gacha-draw.html')
  const draw = page.getByRole('button', { name: '뽑기권 1장 사용', exact: true })
  await expect(draw).toBeEnabled({ timeout: 60000 })
  return { draw, release, posts: () => posts, operationIds, updated }
}
test('REST·실시간 갱신은 연출 중 공개하지 않고 결과 공개 때 최신 수량을 표시한다', async ({ page }, info) => {
  const qa = await setup(page)
  const stock = page.getByRole('region', { name: '남은 보상 개수' })
  const before = (await stock.textContent())!
  await qa.draw.click()
  const newest = machine([1, 1, 4, 7, 15], 3)
  await page.evaluate(value => window.dispatchEvent(new CustomEvent('qa:gacha-event', { detail: value })),
    { eventId: '11111111-1111-4111-8111-111111111111', machine: newest })
  await expect(stock).toHaveText(before)
  qa.release()
  await expect(page.locator('.gacha-art-stage')).toHaveAttribute('data-phase', 'mixing')
  await expect(stock).toHaveText(before)
  await page.screenshot({ path: info.outputPath('stock-during-draw.png') })
  await expect(page.locator('.art-result')).toContainText('A급 캡슐 당첨!', { timeout: 60000 })
  await expect(stock.locator('.art-stock-row').nth(1)).toContainText('1개')
  await expect(stock.locator('.art-stock-row').nth(3)).toContainText('7개')
  expect(qa.posts()).toBe(1)
  await page.screenshot({ path: info.outputPath('stock-after-reveal.png') })
})
test('S급 회차 초기화·당첨 공지도 공개 전에 스포하지 않고 건너뛰기로 공개한다', async ({ page }) => {
  const qa = await setup(page, 1)
  await qa.draw.click()
  await page.evaluate(value => window.dispatchEvent(new CustomEvent('qa:gacha-event', { detail: value })),
    { eventId: '22222222-2222-4222-8222-222222222222', machine: qa.updated, winner: { nickname: '검수 당첨자' } })
  await expect(page.locator('.art-announcement')).not.toContainText('검수 당첨자')
  await page.getByRole('button', { name: /건너뛰기/ }).click()
  qa.release()
  await expect(page.locator('.art-result')).toContainText('S급 캡슐 당첨!', { timeout: 60000 })
  await expect(page.locator('.art-announcement')).toContainText('검수 당첨자')
  expect(qa.posts()).toBe(1)
})
test('실패하면 성공 연출 없이 최신 상태를 표시한다', async ({ page }) => {
  const qa = await setup(page, 2, true)
  await qa.draw.click(); qa.release()
  await expect(page.getByRole('alert')).toContainText('결과를 확인하지 못했어요.', { timeout: 20000 })
  await expect(page.locator('.art-result')).toHaveCount(0)
  expect(qa.posts()).toBe(1)
})
test('엽전 잔액도 결과 공개 때 반영하고 모션 축소에서 완료할 수 있다', async ({ page }) => {
  const qa = await setup(page, 5)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await qa.draw.click()
  await expect(page.locator('.art-wallet')).toContainText('1,000냥')
  qa.release()
  await expect(page.locator('.art-result')).toContainText('20냥 당첨!', { timeout: 20000 })
  await expect(page.locator('.art-wallet')).toContainText('1,020냥')
  expect(qa.posts()).toBe(1)
})
test('연결 종료 뒤 이전 연출은 버리고 같은 작업 ID로 결과만 복구한다', async ({ page }) => {
  const qa = await setup(page)
  await qa.draw.click(); await expect.poll(qa.posts).toBe(1)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('qa:connection', { detail: false })))
  await expect(page.getByRole('dialog', { name: '의상 뽑기' })).toHaveCount(0)
  const finished = page.waitForResponse(r => r.url().endsWith('/api/v1/gacha/draws'))
  qa.release(); await finished
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('qa:connection', { detail: true })))
  await expect(page.getByRole('button', { name: '같은 요청으로 다시 확인', exact: true })).toBeEnabled({ timeout: 20000 })
  await expect(page.locator('.art-result')).toHaveCount(0)
  await page.getByRole('button', { name: '같은 요청으로 다시 확인', exact: true }).click()
  await expect(page.locator('.art-result')).toContainText('A급 캡슐 당첨!', { timeout: 20000 })
  expect(qa.operationIds).toHaveLength(2)
  expect(qa.operationIds[0]).toBe(qa.operationIds[1])
})
