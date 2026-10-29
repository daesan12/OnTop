import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

const panel = (page: Page) => page.getByRole('region', { name: '설정', exact: true })
const manual = (page: Page) => page.getByRole('dialog', { name: '게임 설명서', exact: true })
const probe = (page: Page) => page.evaluate(async () => (await import('/tests/e2e/performanceProbe.ts' as string)).graphicsProbe())
async function loaded(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible(); await page.locator('canvas').focus()
  // The loading label can be absent before the lazy Canvas mounts on a cold visit.
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length), { timeout: 90000 }).toBeGreaterThan(0)
}
// 설정 lives in the 빠른 메뉴 dock (S15P31B105-256); everyone renders on the Low preset.
async function open(page: Page) { await page.getByRole('button', { name: '설정', exact: true }).click(); await expect(panel(page)).toBeVisible() }
const close = (page: Page) => page.getByRole('button', { name: '설정 닫기', exact: true }).click()
async function book(page: Page) { await page.keyboard.press('F1'); await expect(manual(page)).toHaveAttribute('data-phase', 'open') }

test('M15 settings shows live Low diagnostics without a graphics choice and retains the renderer/socket', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const server = await fixture(page, { players: 8, position: { x: 0, y: .8, z: 34, yaw: Math.PI } }); await loaded(page)
  await expect(panel(page)).toHaveCount(0)
  const before = await probe(page), tickets = server.tickets, sent = server.sent.length
  await open(page)
  await expect(panel(page).locator('[data-metric="fps"]')).not.toHaveText('—')
  await expect(panel(page).getByLabel('그래픽 품질')).toHaveCount(0)
  await expect(panel(page).getByRole('group', { name: '마우스 감도', exact: true })).toBeVisible()
  await expect(panel(page).getByRole('group', { name: '배경음악', exact: true })).toBeVisible()
  await expect.poll(async () => { const s = await probe(page); return { canvas: s.canvas, shadows: s.shadows } }).toEqual({ canvas: [1280, 720], shadows: false })
  expect((await probe(page)).camera).toBe(before.camera)
  await expect(panel(page).locator('[data-metric="resolution"]')).toContainText('1280×720')
  await panel(page).getByText('측정 기준과 GPU 정보', { exact: true }).click()
  await expect(panel(page)).toContainText('네트워크 지연은 측정하지 않아요')
  await expect(panel(page).locator('.performance-gpu')).not.toBeEmpty()
  await panel(page).getByRole('button', { name: '측정 초기화', exact: true }).click()
  await expect(panel(page).locator('[data-metric="frames"]')).toHaveText('0 / 0')
  await expect.poll(async () => (await probe(page)).report.frames).toBeGreaterThan(2)
  await expect(panel(page).locator('[data-metric="fps"]')).not.toHaveText('—')
  await screenshot(page, 'm15-performance-panel')
  expect(server.tickets).toBe(tickets); expect(server.connections).toBe(1); expect(server.active).toBe(1)
  expect(server.sent.slice(sent).some(m => /TABLE_JOIN|TABLE_LEAVE|GAME_ACTION|EMOTE|CHAT|QUALITY|PERFORMANCE/.test(m.type))).toBe(false)
  await close(page); await expect(panel(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '설정', exact: true })).toBeFocused()
  expect((await probe(page)).camera).toBe(before.camera)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([])
})

test('M15 F1 shows the channel without settings, protects input, and leaves logout in the profile menu', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const server = await fixture(page, { players: 8, position: { x: 0, y: .8, z: 34, yaw: Math.PI } }); await loaded(page)
  await page.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
  const chat = page.getByRole('textbox', { name: '주변 채팅 메시지' }); await chat.fill('작성 중인 메시지')
  // O types into the chat instead of opening 설정.
  await chat.press('o'); await expect(chat).toHaveValue('작성 중인 메시지o'); await expect(panel(page)).toHaveCount(0)
  await book(page); const channel = manual(page).getByLabel('현재 채널', { exact: true })
  await expect(manual(page).getByRole('button', { name: '나가기', exact: true })).toHaveCount(0)
  await expect(channel).toContainText('공원 01 · 8/16')
  for (const label of ['그래픽 품질', '마우스 감도 빠르기', '배경음악 음량']) await expect(manual(page).getByLabel(label)).toHaveCount(0)
  const count = server.sent.length
  await manual(page).focus()
  await page.keyboard.press('KeyW'); await page.keyboard.press('KeyE'); await page.keyboard.press('KeyG'); await page.keyboard.press('Enter')
  expect(server.sent.slice(count).some(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz) || /TABLE_JOIN|GAME_ACTION|WORLD_CHAT_SEND|WORLD_EMOTE_SEND/.test(m.type))).toBe(false)
  // Occupancy is the existing channel snapshot, not a locally counted avatar list.
  server.players(7); await expect(channel).toContainText('8/16')
  await screenshot(page, 'm15-performance-manual')
  await page.keyboard.press('Escape'); await expect(manual(page)).toHaveCount(0); await expect(chat).toHaveValue('작성 중인 메시지o'); await expect(chat).toBeFocused()
  await book(page)
  await expect(manual(page).getByRole('button', { name: '나가기', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape'); await expect(manual(page)).toHaveCount(0)
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  expect(server.connections).toBe(1); expect(server.active).toBe(1)
  await page.getByRole('button', { name: '내 메뉴', exact: true }).click()
  await page.getByRole('menuitem', { name: /로그아웃/ }).click()
  const logout = page.waitForRequest(r => r.url().endsWith('/api/v1/auth/logout') && r.method() === 'POST')
  await page.getByRole('dialog', { name: '로그아웃 확인', exact: true }).getByRole('button', { name: '로그아웃', exact: true }).click(); await logout
  await expect(page).toHaveURL(/\/$/); await expect(page.locator('.login-page')).toBeVisible(); await expect(page.locator('canvas')).toHaveCount(0)
  await expect.poll(() => server.active).toBe(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([])
})

test('M15 hidden-tab rendering pauses metrics but retains the world session and recovers', async ({ page }) => {
  const server = await fixture(page); await loaded(page); await open(page)
  const original = await probe(page)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await expect.poll(async () => (await probe(page)).frameloop).toBe('never')
  await expect(panel(page).getByRole('status')).toHaveText('화면 렌더링 일시 정지')
  await expect(panel(page).locator('[data-metric="fps"]')).toHaveText('—')
  expect(server.active).toBe(1)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')) })
  await expect.poll(async () => (await probe(page)).frameloop).toBe('always')
  await expect(panel(page).getByRole('status')).toContainText('실시간 측정')
  await expect(panel(page).locator('[data-metric="fps"]')).not.toHaveText('—')
  expect((await probe(page)).camera).toBe(original.camera); expect(server.connections).toBe(1)
})

test('M15 settings preserves table participation, active match and map guidance', async ({ page }) => {
  const server = await fixture(page, { omok: true, m09: true }); await loaded(page)
  await page.keyboard.press('KeyM'); const map = page.getByRole('dialog', { name: '공원 지도창', exact: true })
  await map.getByRole('button', { name: '소리함 길 안내', exact: true }).click(); await expect(map.locator('.navigation-map-route')).toHaveCount(1); await page.keyboard.press('Escape')
  const guide = page.getByRole('region', { name: '내 길 안내', exact: true }); await expect(guide).toBeVisible()
  await open(page); await expect(guide).toHaveCount(0)
  await close(page); await expect(guide).toBeVisible()
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  await page.getByRole('button', { name: '테이블 로비 열기', exact: true }).click()
  const lobby = page.getByRole('dialog', { name: '테이블 정보', exact: true })
  await expect(lobby).toBeVisible()
  await lobby.getByLabel('1인 참가비').fill('1'); await lobby.getByRole('button', { name: '오목 선택', exact: true }).click(); await lobby.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  await expect(page.getByRole('region', { name: '오목 경기', exact: true })).toBeVisible()
  const commands = server.sent.filter(m => /TABLE_LEAVE|GAME_ACTION|READY_SET/.test(m.type)).length
  await book(page)
  await page.keyboard.press('KeyW'); await page.keyboard.press('Space'); await page.keyboard.press('Escape'); await expect(manual(page)).toHaveCount(0)
  await expect(page.getByRole('region', { name: '오목 경기', exact: true })).toBeVisible()
  expect(server.sent.filter(m => /TABLE_LEAVE|GAME_ACTION|READY_SET/.test(m.type))).toHaveLength(commands)
  expect(server.connections).toBe(1)
})

test('M15 small PC layout, dock order, O key and repeated close/reopen release UI timers', async ({ page }) => {
  await page.addInitScript(() => {
    const active = new Set<number>(), start = window.setInterval.bind(window), stop = window.clearInterval.bind(window)
    window.setInterval = ((...args: Parameters<typeof window.setInterval>) => { const id = start(...args); if (args[1] === 1000) active.add(id); return id }) as typeof window.setInterval
    window.clearInterval = id => { if (typeof id === 'number') active.delete(id); stop(id) }
    Object.defineProperty(window, '__m15ReportTimers', { get: () => active.size })
  })
  await page.setViewportSize({ width: 1280, height: 720 }); await fixture(page); await loaded(page)
  const timerCount = () => page.evaluate(() => Reflect.get(window, '__m15ReportTimers') as number)
  const initialTimers = await timerCount()
  // 설정 is the bottom slot of the dock, under 설명서.
  const settingsBox = await page.getByRole('button', { name: '설정', exact: true }).boundingBox()
  const manualBox = await page.locator('.manual-launcher').boundingBox()
  expect(settingsBox!.y).toBeGreaterThan(manualBox!.y)
  for (let i = 0; i < 3; i++) {
    // Alternate the dock button with O, and the × button with Esc.
    if (i % 2) { await page.keyboard.press('KeyO'); await expect(panel(page)).toBeVisible() } else await open(page)
    await expect(panel(page).getByRole('button', { name: '측정 초기화' })).toBeInViewport()
    expect(await timerCount()).toBe(initialTimers + 1)
    const box = await panel(page).boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(720)
    if (i % 2) await page.keyboard.press('Escape'); else await close(page)
    await expect(panel(page)).toHaveCount(0)
    expect(await timerCount()).toBe(initialTimers)
  }
  // Mouse sensitivity keeps its slider-then-number Tab order inside the panel (S15P31B105-208).
  await open(page); await panel(page).getByLabel('마우스 감도 빠르기').focus()
  await page.keyboard.press('Tab'); await expect(panel(page).getByLabel('마우스 감도 퍼센트')).toBeFocused()
  await close(page)
  await book(page)
  await expect(manual(page).getByRole('button', { name: '나가기', exact: true })).toHaveCount(0)
  await screenshot(page, 'm15-performance-1280')
  await page.keyboard.press('Escape'); await expect(manual(page)).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
  await expect(page.getByRole('button', { name: '공원 지도', exact: true })).toBeVisible()
})
