import { test, expect, type Page } from '@playwright/test'
import { identity, parkFixture } from '../park-integration/fixture'
import { disabledJumpmapStatus } from '../fixtures/jumpmap'
import { COURSE, COURSE_VERSION, RULES_VERSION, REWARDS, kstDate } from '../../src/features/jumpmap/course'

const helper = '/tests/park-xr/syntheticXR.ts'
const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', error => list.push(error.message))
  page.on('console', message => { if (message.type() === 'error') list.push(message.text()) })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'xr', { configurable: true, value: Object.assign(new EventTarget(), {
      isSessionSupported: async () => true,
      requestSession: async () => { throw new DOMException('Denied for permission test', 'NotAllowedError') },
    }) })
  })
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
const snapshot = (page: Page): Promise<ReturnType<typeof import('./syntheticXR').snapshot>> =>
  page.evaluate(async path => (await import(path)).snapshot(), helper)
const input = (page: Page, forward = 0, jump = false, turn = 0, exit = false) =>
  page.evaluate(async ({ path, args }) => (await import(path)).input(...args), { path: helper, args: [forward, jump, turn, exit] })
async function enter(page: Page, course = false) {
  const server = await parkFixture(page)
  // Latest dev checks service availability before login. Keep this response inside browser QA.
  await page.route('**/api/v1/operations/status', route => {
    const now = new Date().toISOString()
    return route.fulfill({ json: { mode: 'NORMAL', notice: '', maintenanceStartedAt: null,
      expectedOpenAt: null, version: 1, updatedAt: now, serverTime: now } })
  })
  if (course) await page.route('**/api/v1/minigames/jumpmap/status?**', route => route.fulfill({ json: {
    ...disabledJumpmapStatus('channel-1'), enabled: true,
  } }))
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page).toHaveURL(/\/park$/)
  await expect(page.getByRole('button', { name: '공원 VR 시작', exact: true })).toBeEnabled({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  return server
}
async function startSynthetic(page: Page, course = false) {
  const server = await enter(page, course)
  await page.evaluate(async path => (await import(path)).install(), helper)
  await page.getByRole('button', { name: '공원 VR 시작', exact: true }).click()
  await expect.poll(async () => (await snapshot(page)).active).toBe(true)
  await page.waitForTimeout(100)
  return server
}
test('VR 권한 거절 후 안내와 기존 키보드 이동·점프를 유지한다', async ({ page }, info) => {
  const server = await enter(page)
  await page.getByRole('button', { name: '공원 VR 시작', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('VR 실행 권한')
  await expect(page.getByRole('button', { name: '공원 VR 시작', exact: true })).toBeEnabled()
  const count = server.requests.length
  await page.locator('canvas').focus(); await page.keyboard.down('w')
  await expect.poll(() => server.requests.slice(count).some(r => r.type === 'WORLD_MOVE' && (r.payload.dx || r.payload.dz))).toBe(true)
  await page.keyboard.press('Space'); await page.keyboard.up('w')
  await expect.poll(() => server.requests.slice(count).some(r => r.type === 'WORLD_MOVE' && r.payload.jump)).toBe(true)
  await page.screenshot({ path: info.outputPath('park-xr-launcher-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: '공원 VR 시작', exact: true })).toBeInViewport()
  await page.screenshot({ path: info.outputPath('park-xr-launcher-mobile.png') })
})
test('XR 입력이 공원 서버 메시지로 전달되고 카메라가 서버 점프 높이를 따른다', async ({ page }, info) => {
  const server = await startSynthetic(page)
  const before = await snapshot(page)
  expect(before.parent).toBe('Group'); expect(before.ownVisible).toBe(false)
  const count = server.requests.length
  await input(page, 1)
  await expect.poll(() => server.requests.slice(count).filter(r => r.type === 'WORLD_MOVE').length).toBeGreaterThan(3)
  await page.keyboard.press('Space')
  expect(server.requests.slice(count).some(r => r.type === 'WORLD_MOVE' && r.payload.jump)).toBe(false)
  expect(server.requests.slice(count).filter(r => r.type === 'WORLD_MOVE').every(r => Math.hypot(Number(r.payload.dx), Number(r.payload.dz)) > .9)).toBe(true)
  await input(page, 1, true)
  await expect.poll(() => server.requests.slice(count).filter(r => r.type === 'WORLD_MOVE' && r.payload.jump).length).toBe(1)
  await page.waitForTimeout(200)
  expect(server.requests.slice(count).filter(r => r.type === 'WORLD_MOVE' && r.payload.jump)).toHaveLength(1)
  await input(page, 1, false); await page.waitForTimeout(70); await input(page, 1, true)
  await expect.poll(() => server.requests.slice(count).filter(r => r.type === 'WORLD_MOVE' && r.payload.jump).length).toBe(2)
  await input(page)
  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_MOVE').at(-1)?.payload.dz).toBe(0)
  const settled = await snapshot(page)
  server.place({ x: settled.pose.x, y: settled.pose.y + 1, z: settled.pose.z })
  await expect.poll(async () => (await snapshot(page)).position[1]).toBeGreaterThan(before.position[1] + .7)
  await expect.poll(async () => {
    const current = await snapshot(page)
    return Math.abs(current.position[1] - (current.pose.y - .8 + 1.65))
  }).toBeLessThan(.01)
  const jumped = await snapshot(page)
  expect(jumped.position).toEqual(jumped.viewPosition)
  await page.screenshot({ path: info.outputPath('park-xr-synthetic-view.png') })
  await input(page, 0, false, 0, true)
  await expect.poll(async () => (await snapshot(page)).phase).toBe('idle')
  const ended = await snapshot(page)
  expect(ended.ownsInput).toBe(false); expect(ended.parent).toBeNull()
  const after = server.requests.length
  await page.locator('canvas').focus(); await page.keyboard.down('w'); await page.keyboard.press('Space')
  await expect.poll(() => server.requests.slice(after).some(r => r.type === 'WORLD_MOVE' && r.payload.jump)).toBe(true)
  await page.keyboard.up('w')
})
test('추적 중단 시 멈추고 중립 입력 후 재개하며 공원 메뉴가 열리면 종료한다', async ({ page }) => {
  const server = await startSynthetic(page)
  await input(page, 1)
  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_MOVE').at(-1)?.payload.dz).not.toBe(0)
  await page.evaluate(async path => (await import(path)).visibility('visible-blurred'), helper)
  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_MOVE').at(-1)?.payload.dz).toBe(0)
  await input(page, 1, true)
  const count = server.requests.length
  await page.evaluate(async path => (await import(path)).visibility('visible'), helper)
  await page.waitForTimeout(200)
  expect(server.requests.slice(count).some(r => r.type === 'WORLD_MOVE' && (r.payload.dx || r.payload.dz || r.payload.jump))).toBe(false)
  await input(page); await page.waitForTimeout(80); await input(page, 1, true)
  await expect.poll(() => server.requests.slice(count).some(r => r.type === 'WORLD_MOVE' && r.payload.jump)).toBe(true)
  await page.evaluate(async path => (await import(path)).menu(true), helper)
  await expect.poll(async () => (await snapshot(page)).phase).toBe('idle')
  await page.evaluate(async path => (await import(path)).menu(false), helper)
  expect((await snapshot(page)).ownsInput).toBe(false)
})
test('렌더 프레임이 중단되어도 연결을 잃으면 XR과 입력 소유권을 반환한다', async ({ page }) => {
  await startSynthetic(page)
  await input(page, 1); await page.waitForTimeout(80)
  await page.evaluate(async path => (await import(path)).disconnectWithoutFrames(), helper)
  await expect.poll(async () => (await snapshot(page)).phase).toBe('idle')
  const result = await snapshot(page)
  expect(result.active).toBe(false); expect(result.ownsInput).toBe(false); expect(result.parent).toBeNull()
})

test('VR 놀이 방법에서 이동을 잠그고 A로 닫은 뒤 중립 입력으로 복귀한다', async ({ page }, info) => {
  const server = await startSynthetic(page, true)
  await input(page, 1)
  await page.evaluate(async path => (await import(path)).buttons({ run: true }), helper)
  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_MOVE').at(-1)?.payload.run).toBe(true)
  await page.evaluate(async path => (await import(path)).buttons({ guide: true }), helper)
  await expect.poll(async () => (await snapshot(page)).view?.key).toBe('guide')
  expect((await snapshot(page)).active).toBe(true)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(async () => (await snapshot(page)).dialogBounds.every(p => Math.abs(p[0]!) < 1 && Math.abs(p[1]!) < 1)).toBe(true)
  const count = server.requests.length
  await page.waitForTimeout(150)
  expect(server.requests.slice(count).some(r => r.type === 'WORLD_MOVE' && (r.payload.dx || r.payload.dz || r.payload.jump))).toBe(false)
  await page.screenshot({ path: info.outputPath('park-xr-guide.png') })
  await input(page, 1, true)
  await expect.poll(async () => (await snapshot(page)).view?.key).toBe('roaming')
  const closedAt = server.requests.length
  await page.waitForTimeout(150)
  expect(server.requests.slice(closedAt).some(r => r.type === 'WORLD_MOVE' && (r.payload.dx || r.payload.dz || r.payload.jump))).toBe(false)
  await input(page); await page.waitForTimeout(100); await input(page, 1, true)
  await expect.poll(() => server.requests.slice(closedAt).some(r => r.type === 'WORLD_MOVE' && r.payload.jump)).toBe(true)
})

test('돌탑 서버 진행·늦은 정산·완주·레이저 랭킹을 VR 세션 안에서 처리한다', async ({ page }, info) => {
  const server = await startSynthetic(page, true)
  const scope = { channelId: 'channel-1', mapVersion: identity.mapVersion }
  const money = { earningsDate: kstDate(), todayEarned: 0, dailyCap: 500 }
  const runId = 'xr-run-1'
  server.place({ x: COURSE[0]!.x, y: COURSE[0]!.top + .8, z: COURSE[0]!.z })
  server.emit('JUMPMAP_STARTED', { ...scope, ...money, revision: 1, runId, courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, serverTime: Date.now() })
  await expect.poll(async () => (await snapshot(page)).view?.title).toContain('석탑')
  server.emit('JUMPMAP_GATE', { ...scope, ...money, revision: 2, runId, gate: 1, elapsedMs: 10000,
    coinsCalculated: REWARDS[0], coinsGranted: null, pending: true, runCoins: 0 })
  await expect.poll(async () => (await snapshot(page)).view?.lines.join()).toContain('보상 확인 중')
  server.emit('JUMPMAP_GATE_SETTLED', { ...scope, ...money, revision: 3, runId, gate: 1,
    coinsGranted: REWARDS[0], runCoins: REWARDS[0], todayEarned: REWARDS[0] })
  await expect.poll(async () => (await snapshot(page)).view?.lines.join()).toContain(`+${REWARDS[0]}냥`)
  await page.screenshot({ path: info.outputPath('park-xr-jumpmap-playing.png') })
  const last = COURSE.at(-1)!
  server.place({ x: last.x, y: last.top + .8, z: last.z })
  const total = REWARDS.reduce((sum, reward) => sum + reward, 0)
  const finished = { ...scope, ...money, revision: 4, runId, reason: 'FINISH', gatesPassed: 7,
    maxHeight: 46.5, runCoins: total, todayEarned: total, elapsedMs: 125400, finishMs: 125400, bestFinishMs: 125400, newBest: true }
  server.emit('JUMPMAP_ENDED', finished)
  await expect.poll(async () => (await snapshot(page)).view?.title).toBe('돌탑 도전 완료')
  await expect.poll(async () => (await snapshot(page)).view?.lines.join()).toContain('2분 05.40초')
  expect((await snapshot(page)).dialogVisible).toBe(true)
  expect((await snapshot(page)).active).toBe(true)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(async () => (await snapshot(page)).dialogBounds.every(p => Math.abs(p[0]!) < 1 && Math.abs(p[1]!) < 1)).toBe(true)
  await page.screenshot({ path: info.outputPath('park-xr-completion.png') })
  const entries = Array.from({ length: 8 }, (_, i) => ({ rank: i + 1, userId: String(101 + i), nickname: `돌탑 도전자 ${i + 1}`,
    finishMs: 125400 + i * 1000, finishedAt: '2026-11-04T00:00:00Z' }))
  await page.route('**/api/v1/minigames/jumpmap/rankings', route => route.fulfill({ json: { items: entries, me: entries[0] } }))
  // Holding a missed trigger press must not activate a button when the ray later enters it.
  await page.evaluate(async path => (await import(path)).buttons({ trigger: true }), helper)
  await page.waitForTimeout(100)
  await page.evaluate(async path => (await import(path)).aim('ranking'), helper)
  await page.waitForTimeout(100)
  expect((await snapshot(page)).view?.title).toBe('돌탑 도전 완료')
  const select = async (action: string) => {
    await page.evaluate(async ({ path, action }) => { const xr = await import(path); xr.aim(action); xr.buttons({ trigger: false }) }, { path: helper, action })
    await page.waitForTimeout(100)
    await page.evaluate(async path => (await import(path)).buttons({ trigger: true }), helper)
  }
  await select('ranking')
  await expect.poll(async () => (await snapshot(page)).view?.title).toBe('돌탑 타임어택 랭킹')
  await expect.poll(async () => (await snapshot(page)).view?.lines.join()).toContain('돌탑 도전자 1')
  await select('next')
  await expect.poll(async () => (await snapshot(page)).view?.lines.join()).toContain('돌탑 도전자 6')
  await page.screenshot({ path: info.outputPath('park-xr-ranking.png') })
  await input(page, 0, true)
  await expect.poll(async () => (await snapshot(page)).view?.title).toBe('돌탑 도전 완료')
  await input(page); await page.waitForTimeout(100); await input(page, 0, true)
  await expect.poll(async () => (await snapshot(page)).view?.key).toBe('roaming')
  expect((await snapshot(page)).active).toBe(true)
  server.emit('JUMPMAP_ENDED', finished)
  await page.waitForTimeout(100)
  expect((await snapshot(page)).dialogVisible).toBe(false)
  await input(page); await page.waitForTimeout(100); await input(page, 1)
  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_MOVE').at(-1)?.payload.dz).not.toBe(0)
  await input(page, 0, false, 0, true)
  await expect.poll(async () => (await snapshot(page)).active).toBe(false)
  await expect(page.getByRole('dialog', { name: '점프맵 완료', exact: true })).toHaveCount(0)
})

test('추적 좌표가 없으면 이동을 멈추고 VR 시작 안내는 낮은 화면에서도 스크롤로 접근한다', async ({ page }, info) => {
  const server = await startSynthetic(page)
  await input(page, 1)
  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_MOVE').at(-1)?.payload.dz).not.toBe(0)
  await page.evaluate(async path => (await import(path)).tracking(false), helper)
  await expect.poll(async () => (await snapshot(page)).statusVisible).toBe(false)
  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_MOVE').at(-1)?.payload.dz).toBe(0)
  await page.evaluate(async path => (await import(path)).tracking(true), helper)
  const count = server.requests.length
  await page.waitForTimeout(150)
  expect(server.requests.slice(count).some(r => r.type === 'WORLD_MOVE' && (r.payload.dx || r.payload.dz || r.payload.jump))).toBe(false)
  await input(page); await page.waitForTimeout(100); await input(page, 0, false, 0, true)
  await expect.poll(async () => (await snapshot(page)).active).toBe(false)
  for (const size of [{ width: 390, height: 600 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size)
    const controls = page.getByRole('complementary', { name: '공원 VR 조작' })
    await expect(controls.getByRole('button', { name: '공원 VR 시작', exact: true })).toBeInViewport()
    await controls.hover(); await page.mouse.wheel(0, 500)
    const bounds = await controls.evaluate(el => {
      const rect = el.getBoundingClientRect()
      const overlaps = ['.park-quick-dock', '.park-chat'].some(selector => {
        const other = document.querySelector(selector)?.getBoundingClientRect()
        return other && rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top
      })
      return { right: rect.right, bottom: rect.bottom, scrollbars: getComputedStyle(el).scrollbarWidth, overlaps }
    })
    expect(bounds.right).toBeLessThanOrEqual(size.width)
    expect(bounds.bottom).toBeLessThanOrEqual(size.height)
    expect(bounds.scrollbars).toBe('none')
    expect(bounds.overlaps).toBe(false)
    await page.screenshot({ path: info.outputPath(`park-xr-launcher-${size.width}x${size.height}.png`) })
  }
})
