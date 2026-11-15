import { expect, test } from '@playwright/test'
import { parkFixture } from './fixture'
import { disabledJumpmapStatus } from '../fixtures/jumpmap'

const syntheticXR = '/tests/park-xr/syntheticXR.ts'

test('220m 공원에서 안내 비석으로 돌탑 VR에 진입하고 일반 공원으로 돌아온다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`${message.location().url} ${message.text()}`.trim())
  })
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const server = await parkFixture(page, { carrySupported: true })
  const course = server.renewalCourse!
  const scope = { channelId: 'channel-1', mapVersion: server.mapIdentity.mapVersion }
  const versions = { courseVersion: course.courseVersion, rulesVersion: course.rulesVersion }
  const status = disabledJumpmapStatus(scope.channelId, scope.mapVersion)
  await page.route('**/api/v1/minigames/jumpmap/status?**', route => route.fulfill({ json: { ...status, ...versions, enabled: true } }))
  const now = new Date().toISOString()
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: { mode: 'NORMAL', notice: '',
    maintenanceStartedAt: null, expectedOpenAt: null, version: 1, updatedAt: now, serverTime: now } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: { serverTime: now,
    refreshAt: new Date(Date.now() + 10000).toISOString(), announcements: [] } }))

  const map = page.waitForResponse(response => new URL(response.url()).pathname === '/generated/park-renewal/server-map.json')
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page).toHaveURL(/\/park$/)
  expect((await (await map).json()).data.world.half).toBe(110)
  await expect(page.getByRole('button', { name: '공원 VR 시작', exact: true })).toBeEnabled({ timeout: 90000 })
  await expect(page.getByText('공원을 준비하고 있어요…', { exact: true })).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await page.screenshot({ path: info.outputPath('park-220m-vr.png') })

  server.place({ ...course.guide, y: course.guide.y + .8 })
  const start = page.getByRole('button', { name: '돌탑 점프맵 VR 시작', exact: true })
  await expect(start).toBeEnabled()
  await page.evaluate(async helper => (await import(helper)).install(), syntheticXR)
  await start.click()
  const xr = () => page.evaluate(async helper => (await import(helper)).snapshot(), syntheticXR)
  await expect.poll(async () => (await xr()).active).toBe(true)
  await page.evaluate(async helper => (await import(helper)).buttons({ guide: true }), syntheticXR)
  await expect.poll(async () => (await xr()).view?.lines.join(' ')).toContain('열 구간')
  await page.evaluate(async helper => {
    const xr = await import(helper)
    xr.buttons({ guide: false })
    xr.input(0, true)
  }, syntheticXR)
  await expect.poll(async () => (await xr()).view?.key).toBe('roaming')
  await page.evaluate(async helper => (await import(helper)).input(1), syntheticXR)
  await expect.poll(() => server.requests.some(request => request.type === 'WORLD_MOVE' && request.payload.dz !== 0)).toBe(true)

  const first = course.pads[0]!
  server.place({ x: first.x, y: first.top + .8, z: first.z })
  const money = { earningsDate: status.earningsDate, todayEarned: 0, dailyCap: status.dailyCap }
  const runId = 'park-220m-xr'
  server.emit('JUMPMAP_STARTED', { ...scope, ...versions, ...money, runId, revision: 1, serverTime: Date.now() })
  await expect.poll(async () => (await xr()).view?.title).toContain('/ 10구간')
  server.emit('JUMPMAP_ENDED', { ...scope, ...money, runId, revision: 2, reason: 'FINISH', gatesPassed: 10,
    maxHeight: first.top, runCoins: 0, elapsedMs: 125400, finishMs: 125400, bestFinishMs: 125400, newBest: true })
  await expect.poll(async () => (await xr()).view?.lines.join(' ')).toContain('호수섬까지 완주')
  await page.evaluate(async helper => (await import(helper)).input(0, true), syntheticXR)
  await expect.poll(async () => (await xr()).view?.key).toBe('roaming')
  await page.evaluate(async helper => (await import(helper)).input(0, false, 0, true), syntheticXR)
  await expect.poll(async () => (await xr()).ownsInput).toBe(false)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
