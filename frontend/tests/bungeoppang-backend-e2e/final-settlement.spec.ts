import { expect, test, type APIResponse, type Page, type Route } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'

// 실제 BE 연동: 공원·인증은 계약 fixture를 쓰고 미니게임·지갑 HTTP만 격리 DB 테스트 BE로 보낸다.
const api = process.env.ONTOP_E2E_API_BASE
const auth = { authorization: `Bearer ${process.env.ONTOP_E2E_ACCESS_TOKEN}` }

const state = (page: Page) => page.evaluate(async () => {
  const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
  const s = useBungeoppang.getState()
  return { phase: s.phase, gameId: s.gameId, grill: s.grill, result: s.result }
})
// 브라우저 Origin 정책은 인증 경계 범위다. 계약 헤더와 테스트 토큰만 서버 간 요청으로 전달한다.
const backend = (route: Route) => {
  const url = new URL(route.request().url()), headers = route.request().headers()
  return route.fetch({ url: api + url.pathname + url.search, headers: { ...auth,
    ...(headers['content-type'] ? { 'content-type': headers['content-type'] } : {}),
    ...(headers['idempotency-key'] ? { 'idempotency-key': headers['idempotency-key'] } : {}) } })
}
const cookLevel = (page: Page, slot: number) => page.evaluate(async i => {
  const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
  const { gameNow } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string)
  const { cookLevel } = await import('/src/features/bungeoppang/rulesV4.ts' as string)
  const s = useBungeoppang.getState(), bread = s.grill!.slots[i]
  return cookLevel(bread.since, gameNow(), bread.heat, s.rules)
}, slot)

/** Bakes the first order (팥 2개) and delivers it a moment before the 60-second close. */
async function deliverAtEnd(page: Page) {
  await page.locator('canvas').focus()
  await page.keyboard.press('Space'); await page.keyboard.press('KeyQ'); await page.waitForTimeout(80); await page.keyboard.press('KeyW')
  await page.waitForTimeout(320); await page.keyboard.press('Digit1'); await page.keyboard.press('KeyQ')
  await page.waitForTimeout(80); await page.keyboard.press('KeyW')
  expect((await state(page)).grill!.fills).toBe(2)
  for (let side = 0; side < 2; side++) {
    const slots = (await state(page)).grill!.slots
    for (const slot of [0, 1].sort((a, b) => slots[b].heat - slots[a].heat)) {
      await expect.poll(() => cookLevel(page, slot), { intervals: [50], timeout: 15000 }).toBeGreaterThanOrEqual(72)
      await page.keyboard.press(['KeyQ', 'KeyW'][slot]!); await page.waitForTimeout(80)
    }
  }
  await expect(page.getByRole('region', { name: '완성품 쟁반' })).toHaveAttribute('data-count', '2')
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/features/bungeoppang/bungeoppangView.ts' as string)).gameNow()),
  { intervals: [20], timeout: 60000 }).toBeGreaterThanOrEqual(59_600)
  await page.keyboard.press('KeyR')
  const delivered = (await state(page)).grill!.log.at(-1)
  expect(delivered).toMatchObject({ action: 'DELIVER' })
  expect(delivered.t).toBeLessThan(60_000)
}

test('59.9초 납품 응답 전 60초 완료와 완료 응답 유실을 실제 BE에서 한 번의 지급으로 확정한다', async ({ page, request }) => {
  test.skip(!api || !process.env.ONTOP_E2E_ACCESS_TOKEN, '격리 DB 테스트 BE(ONTOP_E2E_API_BASE·ONTOP_E2E_ACCESS_TOKEN)에서만 실행한다.')
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } })
  const wallet = async () => (await (await request.get(`${api}/api/v1/wallets/me`, { headers: auth })).json()).balance as number
  const session = async (id: string) =>
    (await request.get(`${api}/api/v1/minigames/sessions/${id}`, { headers: auth })).json()
  const before = await wallet()
  // 납품은 BE 도달 전(complete 선행) 또는 BE 승인 뒤 응답만(납품 선행) 보류한다.
  let deliveryMode: 'hold-request' | 'hold-response' = 'hold-request', loseComplete = false
  const held: { route: Route; response?: APIResponse }[] = []
  const completes: { status: number; body: { log: { action: string; deliveryKey?: string }[] } }[] = []
  await page.route('**/api/v1/wallets/me', async route => route.fulfill({ response: await backend(route) }))
  await page.route(/\/api\/v1\/minigames\//, async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/deliveries')) {
      held.push({ route, response: deliveryMode === 'hold-response' ? await backend(route) : undefined })
      return
    }
    const response = await backend(route)
    if (path.endsWith('/complete')) {
      completes.push({ status: response.status(), body: route.request().postDataJSON() })
      if (loseComplete) { loseComplete = false; return route.abort('failed') }
    }
    return route.fulfill({ response })
  })
  const root = page.locator('.bung-root'), panel = page.getByRole('region', { name: '결과', exact: true })
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true })).toBeVisible({ timeout: 90000 })
  await page.locator('canvas').focus(); await page.keyboard.press('KeyE')
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await expect(root).toHaveAttribute('data-phase', 'play', { timeout: 15000 })

  // 1) 납품 요청이 BE에 닿기 전에 60초가 끝나도 complete가 원래 deliveryKey로 마지막 납품을 승인한다.
  await deliverAtEnd(page)
  await expect.poll(() => held.length).toBe(1)
  await expect(panel).toContainText('서버 정산 완료', { timeout: 20000 })
  const first = await state(page)
  const deliveryKey = held[0]!.route.request().headers()['idempotency-key']
  expect(completes).toHaveLength(1)
  expect(completes[0]!.status).toBe(200)
  expect(completes[0]!.body.log.filter(a => a.action === 'DELIVER').at(-1)!.deliveryKey).toBe(deliveryKey)
  expect(first.result).toMatchObject({ served: 2, customersServed: 1, undeliveredCount: 0, rulesVersion: 'v4' })
  expect(first.result.score).toBeGreaterThan(0)
  expect(first.result.coinsGranted).toBe(Math.min(Math.floor(first.result.score / 15), 100))
  await expect(panel).toContainText('서버 확정 점수')
  await expect(panel).toContainText(`받은 엽전 ${first.result.coinsGranted}냥`)
  // complete가 만든 납품 영수증: 늦게 도착한 같은 납품 요청은 원래 영수증만 재생하고 화면을 덮지 않는다.
  const lateDelivery = held.shift()!
  const replay = await backend(lateDelivery.route)
  expect(replay.status()).toBe(200)
  expect(await replay.json()).toMatchObject({ deliveryKey, accepted: true })
  await lateDelivery.route.fulfill({ response: replay }).catch(() => { /* FE may already have dropped it. */ })
  await page.waitForTimeout(300)
  expect(await state(page)).toMatchObject({ phase: 'result', result: first.result })
  expect(await session(first.gameId)).toMatchObject({ status: 'COMPLETED', rewardAmount: first.result.coinsGranted,
    checkpoint: null, acceptedLog: [], issuedOrders: [],
    result: { score: first.result.score, finalPrefixHash: first.result.finalPrefixHash,
      rewardDate: first.result.rewardDate, settledAt: first.result.settledAt } })
  expect(await wallet()).toBe(before + first.result.coinsGranted)
  await screenshot(page, 'bungeoppang-v4-backend-complete-first')

  // 2) 납품은 BE에서 먼저 승인되고 ACK만 늦으며 complete 응답까지 유실되면 GET으로 같은 결과를 복구한다.
  deliveryMode = 'hold-response'; loseComplete = true
  await page.getByRole('button', { name: '다시 하기', exact: true }).click()
  await expect(root).toHaveAttribute('data-phase', 'play', { timeout: 15000 })
  await deliverAtEnd(page)
  await expect.poll(() => held.length).toBe(1)
  expect(held[0]!.response!.status()).toBe(200)
  await expect(panel).toContainText('서버 정산 완료', { timeout: 20000 })
  const second = await state(page)
  expect(second.gameId).not.toBe(first.gameId)
  expect(completes.map(value => value.status)).toEqual([200, 200])
  expect(second.result).toMatchObject({ served: 2, customersServed: 1, undeliveredCount: 0 })
  await held[0]!.route.fulfill({ response: held[0]!.response! }).catch(() => { /* FE may already have dropped it. */ })
  await page.waitForTimeout(300)
  expect(await state(page)).toMatchObject({ phase: 'result', result: second.result })
  expect((await session(second.gameId)).result).toEqual(
    expect.objectContaining({ score: second.result.score, coinsGranted: second.result.coinsGranted }))
  expect(await wallet()).toBe(before + first.result.coinsGranted + second.result.coinsGranted)
  await screenshot(page, 'bungeoppang-v4-backend-recovered')
  expect(errors).toEqual([])
})
