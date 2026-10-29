import { expect, test, type Page, type Route } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

const dialog = (page: Page) => page.getByRole('dialog', { name: '내 전적', exact: true })
const records = (page: Page) => dialog(page).getByRole('list', { name: '경기 기록', exact: true }).getByRole('listitem')
const stats = { items: [
  { gameCode: 'OMOK', played: 10, wins: 5, losses: 3, forfeits: 1, draws: 1 },
  { gameCode: 'DICE', played: 4, wins: 1, losses: 1, forfeits: 2, draws: 0 },
] }
const item = (id: string, patch: Record<string, unknown> = {}) => ({ gameSessionId: id, gameCode: 'OMOK', status: 'FINISHED',
  myResult: 'FORFEIT', settlementStatus: 'PENDING', endedAt: '2026-10-29T00:00:00Z', ...patch })
const firstItems = Array.from({ length: 20 }, (_, i) => item(String(9007199254741099n - BigInt(i)),
  i === 1 ? { myResult: 'LOSE', settlementStatus: 'SETTLED' } : i === 2 ? { status: 'INVALID', myResult: null, settlementStatus: null } : {}))
const cursor = firstItems.at(-1)!.gameSessionId
const firstPage = { items: firstItems, nextCursor: cursor, hasNext: true }
const lastPage = { items: [item('9007199254741079', { myResult: 'WIN', settlementStatus: 'SETTLED' })], nextCursor: null, hasNext: false }
const empty = { items: [], nextCursor: null, hasNext: false }
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', error => list.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource:.*status of (401|503)/.test(message.text())) list.push(message.text())
  })
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
async function loaded(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면', { exact: true })).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().status)).toBe('connected')
}
async function open(page: Page) {
  await page.getByRole('button', { name: '내 메뉴', exact: true }).click()
  await page.getByRole('menuitem', { name: /내 전적/ }).click()
  await expect(dialog(page)).toBeVisible()
}
async function historyRoutes(page: Page, respond?: (route: Route, url: URL) => unknown) {
  const calls: string[] = []
  await page.route(/\/api\/v1\/users\/me\/(games|game-stats)(?:\?|$)/, route => {
    const request = route.request(), url = new URL(request.url())
    expect(request.method()).toBe('GET'); expect(request.postData()).toBeNull()
    expect(request.headers().authorization).toBe('Bearer fixture-access')
    calls.push(url.pathname + url.search)
    if (respond) return respond(route, url)
    return route.fulfill({ json: url.pathname.endsWith('game-stats') ? stats : url.searchParams.has('cursor') ? lastPage : firstPage })
  })
  return calls
}

test('history opens on demand, separates forfeits/losses, preserves pending/invalid states and paginates exact BIGINT cursors', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true })
  const calls = await historyRoutes(page)
  await loaded(page); expect(calls).toEqual([])
  await open(page)
  await expect(records(page)).toHaveCount(20)
  const omok = dialog(page).getByRole('listitem', { name: '오목 전적', exact: true })
  await expect(omok).toContainText('총 10경기')
  await expect(omok.locator('[data-result="LOSE"]')).toHaveText('패배3')
  await expect(omok.locator('[data-result="FORFEIT"]')).toHaveText('기권1')
  await expect(records(page).nth(0)).toContainText('기권'); await expect(records(page).nth(0)).toContainText('정산 대기')
  await expect(records(page).nth(1)).toContainText('패배'); await expect(records(page).nth(1)).toContainText('정산 완료')
  await expect(records(page).nth(2)).toContainText('무효'); await expect(records(page).nth(2)).toContainText('정산 미확인')
  await expect(records(page).first().locator('time')).toContainText('09:00')
  await expect(dialog(page).getByRole('button', { name: '내 전적 닫기', exact: true })).toBeFocused()
  await screenshot(page, 'game-history-desktop')
  const moves = server.sent.filter(message => message.type === 'WORLD_MOVE' && message.payload.dz).length
  await page.keyboard.press('KeyW')
  expect(server.sent.filter(message => message.type === 'WORLD_MOVE' && message.payload.dz)).toHaveLength(moves)
  await page.keyboard.press('Shift+Tab')
  await expect(dialog(page).getByRole('button', { name: '경기 내역 더 보기', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog(page).getByRole('button', { name: '내 전적 닫기', exact: true })).toBeFocused()
  await dialog(page).getByRole('button', { name: '경기 내역 더 보기', exact: true }).click()
  await expect(records(page)).toHaveCount(21)
  await expect(records(page).last()).toContainText('승리')
  expect(calls).toContain(`/api/v1/users/me/games?size=20&cursor=${cursor}`)
  await expect(dialog(page).getByRole('button', { name: '경기 내역 더 보기', exact: true })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await dialog(page).evaluate(element => { element.scrollTop = 0 })
  const box = await dialog(page).boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  expect(await dialog(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await screenshot(page, 'game-history-mobile')
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0)
  await page.locator('canvas').focus(); await page.keyboard.down('KeyW')
  await expect.poll(() => server.sent.some(message => message.type === 'WORLD_MOVE' && message.payload.dz)).toBe(true)
  await page.keyboard.up('KeyW')
  expect(server.sent.some(message => ['TABLE_JOIN', 'TABLE_START', 'GAME_WATCH'].includes(message.type))).toBe(false)
})

test('changing the filter cancels a held next page and does not refetch unrelated statistics', async ({ page }) => {
  await fixture(page); let held: Route | undefined
  const calls = await historyRoutes(page, (route, url) => {
    if (url.pathname.endsWith('game-stats')) return route.fulfill({ json: stats })
    if (url.searchParams.has('cursor')) { held = route; return }
    return route.fulfill({ json: url.searchParams.get('gameCode') === 'ONE_CARD' ? empty : firstPage })
  })
  await loaded(page); await open(page); await expect(records(page)).toHaveCount(20)
  await dialog(page).getByRole('button', { name: '경기 내역 더 보기', exact: true }).click()
  await expect.poll(() => !!held).toBe(true)
  await expect(dialog(page).getByRole('button', { name: '내역을 불러오는 중…', exact: true })).toBeDisabled()
  await dialog(page).getByRole('button', { name: '원카드', exact: true }).click()
  await expect(dialog(page)).toContainText('선택한 게임의 경기 내역이 없어요.')
  await held!.fulfill({ json: lastPage }).catch(() => {})
  await expect(records(page)).toHaveCount(0)
  expect(calls.filter(path => path.endsWith('game-stats'))).toHaveLength(1)
  expect(calls).toContain('/api/v1/users/me/games?size=20&gameCode=ONE_CARD')
  await dialog(page).getByRole('button', { name: '전체', exact: true }).click()
  await expect(records(page)).toHaveCount(20)
})

test('failed statistics and next-page reads recover independently while preserving approved records', async ({ page }) => {
  await fixture(page); let statsReads = 0, nextReads = 0
  const calls = await historyRoutes(page, (route, url) => {
    if (url.pathname.endsWith('game-stats')) return ++statsReads === 1
      ? route.fulfill({ status: 503, json: { code: 'HISTORY_UNAVAILABLE' } }) : route.fulfill({ json: stats })
    if (url.searchParams.has('cursor')) return ++nextReads === 1
      ? route.fulfill({ status: 503, json: { code: 'HISTORY_UNAVAILABLE' } }) : route.fulfill({ json: lastPage })
    return route.fulfill({ json: firstPage })
  })
  await loaded(page); await open(page); await expect(records(page)).toHaveCount(20)
  await expect(dialog(page).getByRole('alert')).toContainText('전적을 불러오지 못했어요')
  await dialog(page).getByRole('button', { name: '전적 다시 조회', exact: true }).click()
  await expect(dialog(page).getByRole('listitem', { name: '오목 전적', exact: true })).toBeVisible()
  expect(calls.filter(path => path === '/api/v1/users/me/games?size=20')).toHaveLength(1)
  await dialog(page).getByRole('button', { name: '경기 내역 더 보기', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('전적을 불러오지 못했어요')
  await expect(records(page)).toHaveCount(20)
  await dialog(page).getByRole('button', { name: '내역 다시 조회', exact: true }).click()
  await expect(records(page)).toHaveCount(21)
  expect(calls.filter(path => path.includes(`cursor=${cursor}`))).toHaveLength(2)
  await expect(dialog(page).getByRole('alert')).toHaveCount(0)
})

test('empty records remain empty and invalid statistics never invent zero or merge forfeits into losses', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await fixture(page); let valid = false
  await historyRoutes(page, (route, url) => route.fulfill({ json: url.pathname.endsWith('game-stats')
    ? valid ? { items: [] } : { items: [{ ...stats.items[0], losses: 4 }] } : empty }))
  await loaded(page); await open(page)
  await expect(dialog(page)).toContainText('아직 종료된 경기 내역이 없어요.')
  await expect(dialog(page).getByRole('alert')).toContainText('전적 응답을 확인하지 못했어요')
  await expect(dialog(page).locator('.park-records-stat-grid')).toHaveCount(0)
  valid = true; await dialog(page).getByRole('button', { name: '전적 다시 조회', exact: true }).click()
  await expect(dialog(page)).toContainText('아직 집계된 전적이 없어요.')
  await expect(dialog(page).getByRole('alert')).toHaveCount(0)
  expect(await dialog(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await screenshot(page, 'game-history-empty-small')
})

test('closing and reopening discards delayed reads, then uses a fresh first page', async ({ page }) => {
  await fixture(page); let held: Route | undefined, reads = 0
  await historyRoutes(page, (route, url) => {
    if (url.pathname.endsWith('game-stats')) return route.fulfill({ json: { items: [] } })
    if (++reads === 1) { held = route; return }
    return route.fulfill({ json: empty })
  })
  await loaded(page); await open(page); await expect.poll(() => !!held).toBe(true)
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0)
  await open(page); await expect(dialog(page)).toContainText('아직 종료된 경기 내역이 없어요.')
  await held!.fulfill({ json: firstPage }).catch(() => {})
  await expect(records(page)).toHaveCount(0); expect(reads).toBe(2)
})

test('401 uses the existing refresh flow and a session ending during a read cannot leave records visible', async ({ page }) => {
  const server = await fixture(page); let reads = 0, held: Route | undefined
  await historyRoutes(page, (route, url) => {
    if (url.pathname.endsWith('game-stats')) return route.fulfill({ json: stats })
    if (++reads === 1) return route.fulfill({ status: 401, json: { code: 'AUTH_INVALID_ACCESS_TOKEN' } })
    if (reads === 2) return route.fulfill({ json: firstPage })
    held = route
  })
  await loaded(page); await open(page); await expect(records(page)).toHaveCount(20); expect(reads).toBe(2)
  await dialog(page).getByRole('button', { name: '새로 조회', exact: true }).click()
  await expect.poll(() => !!held).toBe(true)
  server.endSession(); await expect(page.locator('.login-page')).toBeVisible()
  await held!.fulfill({ json: firstPage }).catch(() => {})
  await expect(dialog(page)).toHaveCount(0); await expect(page.locator('.park-records-row')).toHaveCount(0)
})

test('a stalled history request times out with retry while statistics remain usable', async ({ page }) => {
  await fixture(page); let reads = 0
  await historyRoutes(page, (route, url) => {
    if (url.pathname.endsWith('game-stats')) return route.fulfill({ json: stats })
    if (++reads === 1) return
    return route.fulfill({ json: empty })
  })
  await loaded(page); await open(page)
  await expect(dialog(page).getByRole('listitem', { name: '오목 전적', exact: true })).toBeVisible()
  await expect(dialog(page).getByRole('alert')).toContainText('전적을 불러오지 못했어요', { timeout: 16000 })
  await dialog(page).getByRole('button', { name: '내역 다시 조회', exact: true }).click()
  await expect(dialog(page)).toContainText('아직 종료된 경기 내역이 없어요.')
  expect(reads).toBe(2)
})
