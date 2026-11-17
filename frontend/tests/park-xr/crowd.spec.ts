import { expect, test } from '@playwright/test'
import { parkFixture } from './fixture'

const syntheticXR = '/tests/park-xr/syntheticXR.ts'

test('220m 공원 VR에서 30명과 함께 있어도 스틱 이동과 한 번의 A 점프를 보낸다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const server = await parkFixture(page, { carrySupported: true })
  const now = new Date().toISOString()
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: { mode: 'NORMAL', notice: '',
    maintenanceStartedAt: null, expectedOpenAt: null, version: 1, updatedAt: now, serverTime: now } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: {
    announcements: [], serverTime: now, refreshAt: new Date(Date.now() + 60000).toISOString() } }))
  await page.goto('/park')
  const start = page.getByRole('button', { name: '공원 VR 시작', exact: true })
  await expect(start).toBeEnabled({ timeout: 90000 })
  await expect(page.getByText('공원을 준비하고 있어요…', { exact: true })).toBeHidden({ timeout: 90000 })
  await page.evaluate(async helper => (await import(helper)).install(), syntheticXR)
  await start.click()
  const snapshot = () => page.evaluate(async helper => (await import(helper)).snapshot(), syntheticXR)
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  const { pose } = await snapshot()
  server.setPeers(Array.from({ length: 29 }, (_, i) => ({
    x: pose.x + (i % 6 - 2.5) * 1.4, y: pose.y, z: pose.z - 3 - Math.floor(i / 6) * 1.6, moving: i % 2 === 0,
  })))
  await page.evaluate(async ({ helper, pose }) => (await import(helper)).lookAt(pose.x, pose.y + .4, pose.z - 10), { helper: syntheticXR, pose })
  const renderStats = () => page.evaluate(async helper => (await import(helper)).crowdRenderStats(), syntheticXR)
  await expect.poll(async () => (await renderStats()).avatars, { timeout: 30000 }).toBe(29)
  const stats = await renderStats()
  await info.attach('park-vr-crowd-render.json', { body: JSON.stringify(stats), contentType: 'application/json' })
  console.log('30명 VR 렌더링', stats)

  const offset = server.requests.length
  const sent = () => server.requests.slice(offset).filter(r => r.type === 'WORLD_MOVE')
  await page.evaluate(async helper => (await import(helper)).input(.8), syntheticXR)
  await expect.poll(() => sent().some(r => r.payload.dx || r.payload.dz)).toBe(true)
  await expect.poll(async () => {
    const current = (await snapshot()).pose
    return Math.hypot(current.x - pose.x, current.z - pose.z)
  }).toBeGreaterThan(.2)
  await page.evaluate(async helper => (await import(helper)).input(.8, true), syntheticXR)
  await expect.poll(() => sent().some(r => r.payload.jump === true)).toBe(true)
  await page.evaluate(async helper => (await import(helper)).input(0), syntheticXR)
  await expect.poll(() => sent().at(-1)?.payload).toMatchObject({ dx: 0, dz: 0, jump: false })
  expect(sent().filter(r => r.payload.jump === true)).toHaveLength(1)
  await page.evaluate(async helper => (await import(helper)).input(0, false, 0, true), syntheticXR)
  await expect.poll(async () => (await snapshot()).active).toBe(false)
  await expect(page.locator('.avatar-overhead[data-player-id="102"]')).toHaveCount(1)
  expect(stats.detailedAvatars).toBeGreaterThan(0)
  expect(stats.detailedAvatars).toBeLessThan(29)
  expect(stats.names).toBeGreaterThan(0)
  expect(stats.names).toBeLessThanOrEqual(8)
  expect(stats.desktopOverlays).toBe(0)
  expect(errors).toEqual([])
})
