import { expect, test, type Page, type Route } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { facilityCatalog } from '../fixtures/facilityCatalog'
import { benchTable } from '../../src/features/interactions/benchSpectator'

const probe = (page: Page) => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).adCameraProbe())
async function loaded(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().status)).toBe('connected')
  await page.locator('canvas').focus()
}
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', error => list.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource:.*status of (401|403|404|503)/.test(message.text())) list.push(message.text()) })
})
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0) })

test('pavilion bench faces the board, close participant/board views use camera only, and leaving restores the original view', async ({ page }) => {
  const bench = facilityCatalog.facilities.find(d => d.kind === 'BENCH' && !!benchTable(d.facilityId))!, anchor = benchTable(bench.facilityId)!
  const server = await fixture(page, { anchorId: anchor.id, manualMovement: true, position: bench.center }); await loaded(page)
  await page.keyboard.press('KeyV'); const original = (await probe(page)).controls
  await page.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id, 0), bench.facilityId)
  await expect(page.getByRole('button', { name: '가까이 관전', exact: true })).toBeVisible()
  await expect.poll(async () => {
    const p = await probe(page), dx = anchor.position[0] - p.camera[0]!, dz = anchor.position[2] - p.camera[2]!
    return (p.direction[0]! * dx + p.direction[2]! * dz) / Math.hypot(dx, dz) / Math.hypot(p.direction[0]!, p.direction[2]!)
  }).toBeGreaterThan(.999)
  await screenshot(page, 'bench-seated-facing-board')
  await page.getByRole('button', { name: '가까이 관전', exact: true }).click()
  await expect(page.getByRole('button', { name: '참가자와 함께 보기', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await probe(page)).camera[1]! - anchor.position[1]).toBeGreaterThan(2)
  await page.mouse.move(650, 300); await page.mouse.down({ button: 'right' }); await page.mouse.move(740, 300); await page.mouse.up({ button: 'right' })
  expect(await page.evaluate(async () => (await import('/src/features/interactions/benchSpectator.ts' as string)).benchLook.yaw)).not.toBe(Math.PI / 4)
  await screenshot(page, 'bench-close-participants')
  await page.getByRole('button', { name: '판 자세히 보기', exact: true }).click()
  await expect.poll(async () => (await probe(page)).direction[1]).toBeLessThan(-.99)
  await screenshot(page, 'bench-close-board')
  await page.setViewportSize({ width: 1000, height: 700 })
  const panelBox = await page.getByRole('complementary', { name: '가까운 상호작용', exact: true }).boundingBox()
  const center = await page.evaluate(async position => (await import('/tests/e2e/sceneProbe.ts' as string)).projectWorldPoint(position), anchor.position)
  expect(panelBox!.x).toBeGreaterThanOrEqual(0); expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(1000)
  expect(panelBox!.y).toBeGreaterThanOrEqual(0); expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(700)
  expect(center.x < panelBox!.x || center.x > panelBox!.x + panelBox!.width || center.y < panelBox!.y || center.y > panelBox!.y + panelBox!.height).toBe(true)
  expect(panelBox!.height).toBeLessThan(150)
  await screenshot(page, 'bench-close-small-pc')
  await page.setViewportSize({ width: 1920, height: 1080 })
  expect(server.sent.filter(m => ['TABLE_JOIN', 'GAME_ACTION_SEND', 'GAME_WATCH'].includes(m.type))).toHaveLength(0)
  await page.locator('.bench-spectator-help summary').focus()
  await page.locator('.bench-spectator-help summary').press('Enter')
  await expect(page.getByRole('textbox', { name: '주변 채팅 메시지', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '테이블 공개 정보', exact: true }).click()
  const lobby = page.getByRole('dialog', { name: '테이블 정보', exact: true }); await expect(lobby).toBeVisible()
  await expect(lobby.getByRole('button', { name: '앉기', exact: true })).toBeDisabled()
  await expect(lobby).toContainText('벤치 관전 중')
  await expect.poll(() => server.sent.filter(m => m.type === 'TABLE_WATCH').length).toBe(1)
  await lobby.getByRole('button', { name: '테이블 정보 닫기' }).click()
  await page.getByRole('button', { name: '벤치에서 일어나기', exact: true }).click()
  await expect(page.getByRole('group', { name: '벤치 관전', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '1인칭 시점', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await probe(page)).controls).toEqual(original)
})

test('ordinary dev exposes the remote menu but sends no invented follow request and closes for F1', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true }); await loaded(page)
  await page.getByRole('button', { name: '이웃 메뉴 열기', exact: true }).click()
  const list = page.getByRole('menu', { name: '주변 이용자', exact: true }); await expect(list).toBeVisible()
  await list.getByRole('menuitem').first().click()
  const menu = page.getByRole('menu').filter({ hasText: '따라가기 서버 연결' }); await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '따라가기', exact: true })).toBeDisabled()
  const count = server.sent.filter(m => m.type === 'WORLD_MOVE' && m.payload.dx).length
  await page.keyboard.press('KeyW'); expect(server.sent.filter(m => m.type === 'WORLD_MOVE' && m.payload.dx)).toHaveLength(count)
  await screenshot(page, 'follow-server-boundary')
  await page.keyboard.press('F1'); await expect(page.getByRole('dialog', { name: '게임 설명서', exact: true })).toHaveAttribute('data-phase', 'open')
  await expect(page.getByRole('menu')).toHaveCount(0)
  expect(server.sent.some(m => /FOLLOW/i.test(m.type))).toBe(false)
})

test('administrator uses existing JWT read API, safely renders text and pages without opening a world socket', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const server = await fixture(page); const calls: string[] = []
  const item = (id: number) => ({ receiptId: String(id), authorUserId: id === 300 ? null : 202, channelId: 'fixture-channel',
    text: id === 300 ? '<img src=x onerror="alert(1)">\n두 번째 줄' : '공원을 더 편하게 만들어주세요.', acceptedAt: '2026-10-25T00:00:00Z' })
  await page.route('**/api/v1/admin/feedback?*', route => {
    expect(route.request().method()).toBe('GET'); expect(route.request().postData()).toBeNull()
    expect(route.request().headers().authorization).toBe('Bearer fixture-access')
    const url = new URL(route.request().url()); calls.push(url.searchParams.get('cursor') ?? '')
    return route.fulfill({ json: url.searchParams.has('cursor') ? { items: [item(280)], nextCursor: null }
      : { items: Array.from({ length: 20 }, (_, i) => item(300 - i)), nextCursor: '281' } })
  })
  await page.goto('/admin/feedback'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByRole('heading', { name: '소리함 의견 조회', exact: true })).toBeVisible()
  await expect(page.locator('.admin-feedback-entries article')).toHaveCount(20)
  await expect(page.locator('.admin-feedback-entries article').first()).toContainText('<img src=x onerror="alert(1)">')
  await expect(page.locator('.admin-feedback-entries img')).toHaveCount(0)
  await expect(page.getByText('탈퇴 회원 · 작성자 정보 제거됨')).toBeVisible()
  expect(server.connections).toBe(0); await screenshot(page, 'admin-feedback-list')
  await page.getByRole('button', { name: '다음 페이지' }).click(); await expect(page.getByRole('status')).toContainText('2페이지')
  await expect(page.getByRole('button', { name: '다음 페이지' })).toBeDisabled()
  await page.getByRole('button', { name: '이전 페이지' }).click(); await expect(page.locator('.admin-feedback-entries article')).toHaveCount(20)
  await page.getByRole('button', { name: '최신 의견 새로고침' }).click(); await expect(page.locator('.admin-feedback-entries article')).toHaveCount(20)
  expect(calls).toEqual(['', '281', '', ''])
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /feedback|admin/i.test(key)))).toEqual([])
  await page.getByRole('link', { name: '공원으로 돌아가기', exact: false }).click()
  await expect(page).toHaveURL(/\/park$/); await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
})

test('403 administrator denial preserves login; unavailable or empty results never masquerade as each other', async ({ page }) => {
  const server = await fixture(page); let mode = 403
  await page.route('**/api/v1/admin/feedback?*', route => route.fulfill(mode === 200 ? { json: { items: [], nextCursor: null } }
    : { status: mode, json: { code: mode === 403 ? 'FEEDBACK_ADMIN_REQUIRED' : 'FEEDBACK_NOT_CONFIGURED' } }))
  await page.goto('/admin/feedback'); await expect(page.getByRole('alert')).toContainText('조회 권한이 없어요')
  await expect(page.getByText('접수된 의견이 없습니다.')).toHaveCount(0)
  await screenshot(page, 'admin-feedback-denied')
  expect(await page.evaluate(async () => (await import('/src/auth/authFlow.ts' as string)).getAuthSession()?.status)).toBe('AUTHENTICATED')
  mode = 503; await page.getByRole('button', { name: '다시 조회' }).click(); await expect(page.getByRole('alert')).toContainText('아직 준비되지')
  mode = 200; await page.getByRole('button', { name: '다시 조회' }).click(); await expect(page.getByText('접수된 의견이 없습니다.')).toBeVisible()
  expect(server.connections).toBe(0)
})

test('administrator revalidates 401 and discards a late page after returning to the park', async ({ page }) => {
  const server = await fixture(page); let count = 0, held: Route | undefined
  await page.route('**/api/v1/admin/feedback?*', route => {
    count++
    if (count === 1) return route.fulfill({ status: 401, json: { code: 'AUTH_INVALID_ACCESS_TOKEN' } })
    if (count === 2) return route.fulfill({ json: { items: [], nextCursor: null } })
    held = route
  })
  await page.goto('/admin/feedback'); await expect(page.getByText('접수된 의견이 없습니다.')).toBeVisible(); expect(count).toBe(2)
  await page.getByRole('button', { name: '최신 의견 새로고침' }).click(); await expect.poll(() => !!held).toBe(true)
  await page.getByRole('link', { name: '공원으로 돌아가기', exact: false }).click()
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await held!.fulfill({ json: { items: [], nextCursor: null } }).catch(() => {})
  await expect(page.getByRole('heading', { name: '소리함 의견 조회', exact: true })).toHaveCount(0)
  expect(server.connections).toBeLessThanOrEqual(1)
})
