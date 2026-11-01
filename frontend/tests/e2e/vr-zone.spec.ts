import { test, expect } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { PARK_LAYOUT } from '../../src/map/park'
import { vrEntrance } from '../../src/features/vrZone/anchors'

test('latest park VR entrance plays a complete solo round and returns without a table', async ({ page }) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const entrance = vrEntrance(PARK_LAYOUT.SITES.vr, PARK_LAYOUT.VR_YAW)
  const server = await fixture(page, { generatedPark: true, position: { ...entrance, yaw: PARK_LAYOUT.VR_YAW + Math.PI } })
  // Exercise the real admission client/runtime boundary. Only HTTP/WS is a test fixture.
  let availableBalance = 100
  const paidKeys = new Map<string, string>()
  const admissionRequests: string[] = []
  let loseFirstReply = true
  await page.route('**/api/v1/wallets/me', route => route.fulfill({ json: {
    balance: availableBalance, reservedBalance: 0, availableBalance,
  } }))
  await page.route('**/api/v1/minigames/skewer/admissions', async route => {
    expect(route.request().method()).toBe('POST')
    const key = route.request().headers()['idempotency-key']
    expect(key).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    admissionRequests.push(key)
    if (!paidKeys.has(key)) { availableBalance -= 10; paidKeys.set(key, `skewer-${paidKeys.size + 1}`) }
    if (loseFirstReply) { loseFirstReply = false; await route.abort('failed'); return }
    await route.fulfill({ status: 201, json: { id: paidKeys.get(key), game: 'skewer', fee: 10, availableBalance } })
  })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.park-scene-message')).toBeHidden({ timeout: 90000 })
  await expect(page.getByRole('button', { name: /VR 게임 선택 · 한 판 10냥/ })).toBeVisible({ timeout: 20000 })
  await screenshot(page, 'vr-zone-park-entry', 'disabled')
  await page.keyboard.press('KeyE')
  const catalog = page.getByRole('dialog', { name: 'VR 게임 선택', exact: true })
  await expect(catalog).toBeVisible()
  await expect(catalog.locator('.vr-zone-coming')).toHaveCount(2)
  await expect(catalog.locator('.vr-zone-balance')).toContainText('100냥')
  await screenshot(page, 'vr-zone-park-catalog', 'disabled')
  await page.getByRole('button', { name: '온탑 꼬치왕 선택', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '온탑 꼬치왕 플레이 방식 선택', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'VR로 플레이', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'VR 플레이 준비', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'VR 전용 조작 안내', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '키보드·마우스 조작 안내', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'VR 연결하고 시작 · 10냥', exact: true }).click()
  await expect(page.locator('.sk-inline-notice')).toBeVisible()
  await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', 'ready')
  await expect(page.locator('.vr-zone-play-bar')).toContainText('100냥')
  expect(admissionRequests).toHaveLength(0)
  await page.getByRole('button', { name: '플레이 방식 바꾸기', exact: true }).click()
  await page.getByRole('button', { name: 'VR 없이 플레이', exact: true }).click()
  await expect(page.getByRole('heading', { name: '키보드·마우스 가이드', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'VR 전용 조작 안내', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '시작 · 10냥', exact: true })).toBeVisible()
  await expect(page.locator('.vr-zone-play-bar')).toContainText('100냥')
  await page.getByRole('button', { name: '시작 · 10냥', exact: true }).click()
  await expect(page.locator('.vr-zone-payment-error')).toContainText('같은 요청')
  await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', 'ready')
  await page.getByRole('button', { name: '시작 · 10냥', exact: true }).click()
  await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', 'countdown')
  await expect(page.locator('.vr-zone-play-bar')).toContainText('90냥')
  await page.keyboard.press('Escape')
  await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', 'paused')
  await expect(page.getByRole('dialog', { name: '잠시 쉬어가세요' })).toBeVisible()
  await page.getByRole('button', { name: '계속 만들기', exact: true }).click()
  await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', 'countdown')
  await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', 'playing')
  await expect(page.locator('.vr-zone-play-bar')).toContainText('90냥')
  await expect(page.locator('.park-account__balance')).toHaveText('90냥')
  const beforeMove = server.sent.length
  await page.keyboard.press('KeyW')
  await page.waitForTimeout(150)
  expect(server.sent.slice(beforeMove).some(message => message.type === 'WORLD_MOVE' && (message.payload.dx !== 0 || message.payload.dz !== 0))).toBe(false)
  const keys: Record<string, string> = { tomato: 'Digit1', pepper: 'Digit2', shrimp: 'Digit3', beef: 'Digit4', cheese: 'Digit5', bacon: 'Digit6' }
  let completedOrders = 0, totalPoints = 0, cardsPlayed = 0
  while (await page.locator('.sk-app').getAttribute('data-phase') === 'playing') {
    if (await page.locator('.sk-greeting').count()) {
      await page.locator('.sk-greeting .sk-primary').click()
      totalPoints++
    } else {
      const oldPieces = await page.locator('.sk-current li[data-ingredient]').count()
      for (let index = 0; index < oldPieces; index++) await page.keyboard.press('Backspace')
      await expect(page.locator('.sk-current li[data-ingredient]')).toHaveCount(0)
      const recipe = await page.locator('.sk-recipe>li').evaluateAll(items => items.map(item => item.getAttribute('data-ingredient')!))
      const points = (await page.getByTestId('card-index').innerText()).match(/\+(\d+)점/)
      expect(recipe.length).toBeGreaterThan(0)
      for (const ingredient of recipe) {
        await page.keyboard.press(keys[ingredient])
        await page.keyboard.press('Space')
      }
      await expect(page.locator('.sk-next-instruction')).toContainText('꼬치가 완성됐어요')
      await page.getByRole('button', { name: '서빙하기', exact: true }).click()
      completedOrders++
      totalPoints += Number(points![1])
    }
    await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', 'result')
    await expect(page.locator('.sk-round-success')).toBeVisible()
    await expect(page.locator('.vr-zone-play-bar')).toContainText('90냥')
    await page.locator('.sk-round-panel .sk-primary').click()
    await expect(page.locator('.sk-app')).not.toHaveAttribute('data-phase', 'result')
    expect(++cardsPlayed).toBeLessThanOrEqual(14)
  }
  await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', 'ending')
  await expect(page.locator('.sk-transition-overlay')).toContainText('완료!')
  await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', 'finished')
  const result = page.getByRole('dialog', { name: '온탑 꼬치왕 결과', exact: true })
  await expect(result).toBeVisible()
  await expect(result.getByRole('heading', { name: '온탑 꼬치왕 도전 결과', exact: true })).toBeVisible()
  await expect(page.getByTestId('final-score')).toHaveText(`${totalPoints}점`)
  await expect(page.getByTestId('completed-orders')).toHaveText(`${completedOrders}개`)
  await expect(page.locator('.sk-sidebar')).toHaveCount(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(completedOrders).toBeGreaterThanOrEqual(8)
  await expect.poll(() => result.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  // The sheet owns keyboard focus, so Enter on its container cannot buy a new round.
  await result.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.vr-zone-play-bar')).toContainText('90냥')
  await page.keyboard.press('Shift+Tab')
  await expect(result.locator('summary')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(result.getByRole('button', { name: '결과 닫고 게임 목록으로', exact: true })).toBeFocused()
  await result.focus()
  await screenshot(page, 'vr-zone-park-final', 'disabled')
  await result.getByRole('button', { name: '설명서', exact: true }).click()
  await expect(result.getByRole('region', { name: '키보드·마우스 조작 설명서', exact: true })).toContainText('Space')
  await expect(result.getByRole('region', { name: 'VR 조작 설명서', exact: true })).toHaveCount(0)
  await result.getByRole('button', { name: '설명서', exact: true }).click()
  await result.locator('summary').click()
  await expect(result.locator('.sk-result-history li')).toHaveCount(cardsPlayed)
  await result.locator('summary').click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(result.getByRole('button', { name: '다시 도전', exact: true })).toBeInViewport()
  await expect(result.getByRole('button', { name: '게임 목록', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await screenshot(page, 'vr-zone-park-final-mobile', 'disabled')
  await page.setViewportSize({ width: 1440, height: 900 })
  await result.getByRole('button', { name: '다시 도전', exact: true }).dblclick()
  await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', 'countdown')
  await expect(page.locator('.vr-zone-play-bar')).toContainText('80냥')
  // A second whole round also exercises a zero-score result and Escape-to-list.
  let missedOrders = 0
  let retryCards = 0
  while (true) {
    await expect.poll(() => page.locator('.sk-app').getAttribute('data-phase')).toMatch(/^(playing|ending)$/)
    if (await page.locator('.sk-app').getAttribute('data-phase') === 'ending') break
    if (await page.locator('.sk-greeting').isVisible()) {
      await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', 'result', { timeout: 5000 })
    } else {
      await page.keyboard.press('Backspace')
      await page.keyboard.press('Digit1')
      await page.keyboard.press('Space')
      await page.getByRole('button', { name: '서빙하기', exact: true }).click()
      missedOrders++
    }
    await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', 'result')
    await page.locator('.sk-round-panel .sk-primary').click()
    expect(++retryCards).toBeLessThanOrEqual(14)
  }
  await expect(result).toBeVisible()
  await expect(page.getByTestId('final-score')).toHaveText('0점')
  await expect(page.getByTestId('completed-orders')).toHaveText('0개')
  await expect(result.locator('.sk-result-missed')).toHaveText(`${missedOrders}개`)
  await expect(page.locator('.vr-zone-play-bar')).toContainText('80냥')
  await screenshot(page, 'vr-zone-park-final-zero', 'disabled')
  await result.focus()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'VR 게임 나가기', exact: true })).toHaveCount(0)
  await expect(catalog).toBeVisible()
  await expect(catalog.locator('.vr-zone-balance')).toContainText('80냥')
  expect(paidKeys.size).toBe(2)
  expect(admissionRequests).toHaveLength(3)
  expect(admissionRequests[0]).toBe(admissionRequests[1])
  expect(admissionRequests[2]).not.toBe(admissionRequests[1])
  await page.getByRole('button', { name: 'VR 게임 선택 닫기', exact: true }).click()
  await expect(catalog).toBeHidden()
  const afterReturn = server.sent.length
  await page.keyboard.down('KeyW')
  await expect.poll(() => server.sent.slice(afterReturn).some(message => message.type === 'WORLD_MOVE' && (message.payload.dx !== 0 || message.payload.dz !== 0))).toBe(true)
  await page.keyboard.up('KeyW')
  await screenshot(page, 'vr-zone-park-return', 'disabled')
  await page.keyboard.press('Enter')
  await page.getByLabel('주변 채팅 메시지').fill('e')
  await page.keyboard.press('KeyE')
  await expect(catalog).toBeHidden()
  await page.keyboard.press('Escape')
  expect(server.sent.some(message => message.type === 'TABLE_JOIN')).toBe(false)
  expect(errors).toEqual([])
})

test('last ten coins remain recoverable after a lost response, leaving and reload', async ({ page }) => {
  const entrance = vrEntrance(PARK_LAYOUT.SITES.vr, PARK_LAYOUT.VR_YAW)
  await fixture(page, { generatedPark: true, position: { ...entrance, yaw: 0 } })
  let coins = 10
  const paidKeys = new Set<string>(), requests: string[] = []
  await page.route('**/api/v1/wallets/me', route => route.fulfill({ json: { balance: coins, reservedBalance: 0, availableBalance: coins } }))
  await page.route('**/api/v1/minigames/skewer/admissions', async route => {
    const key = route.request().headers()['idempotency-key']
    requests.push(key)
    if (!paidKeys.has(key)) {
      coins -= 10; paidKeys.add(key)
      await route.abort('failed'); return
    }
    await route.fulfill({ status: 201, json: { id: 'skewer-1', game: 'skewer', fee: 10, availableBalance: coins } })
  })
  const catalog = page.getByRole('dialog', { name: 'VR 게임 선택', exact: true })
  const enter = async () => {
    await expect(page.locator('.park-scene-message')).toBeHidden({ timeout: 90000 })
    await page.getByRole('button', { name: /VR 게임 선택 · 한 판 10냥/ }).click()
    await expect(catalog.locator('.vr-zone-balance')).not.toContainText('확인 중')
    await page.getByRole('button', { name: '온탑 꼬치왕 선택', exact: true }).click()
    await page.getByRole('button', { name: 'VR 없이 플레이', exact: true }).click()
    await page.getByRole('button', { name: '시작 · 10냥', exact: true }).click()
  }
  await page.goto('/park')
  await enter()
  await expect(page.locator('.vr-zone-payment-error')).toContainText('같은 요청')
  await page.getByRole('button', { name: 'VR 게임 목록으로', exact: true }).click()
  await expect(catalog).toBeVisible()
  await page.getByRole('button', { name: 'VR 게임 선택 닫기', exact: true }).click()
  await expect(catalog).toBeHidden()
  await page.reload()
  await enter()
  await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', 'countdown')
  await expect(page.locator('.vr-zone-play-bar')).toContainText('0냥')
  expect(requests).toHaveLength(2)
  expect(requests[1]).toBe(requests[0])
  expect(paidKeys.size).toBe(1)
  expect(coins).toBe(0)
  await screenshot(page, 'vr-zone-last-ticket-recovered', 'disabled')
})
