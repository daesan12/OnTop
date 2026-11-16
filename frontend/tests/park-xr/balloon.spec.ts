import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { loadRenewalFixtureMap, parkFixture } from './fixture'

const helper = '/tests/park-xr/syntheticXR.ts'

test('220m 공원에서 VR 열기구에 탑승해 자동 비행하고 B로 승강장에 복귀한다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const server = await parkFixture(page, { carrySupported: true, balloonSupported: true, environmentEpochMs: Date.now() - 600000 })
  const now = new Date().toISOString()
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: { mode: 'NORMAL', notice: '',
    maintenanceStartedAt: null, expectedOpenAt: null, version: 1, updatedAt: now, serverTime: now } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: { announcements: [], serverTime: now,
    refreshAt: new Date(Date.now() + 60000).toISOString() } }))
  await page.goto('/park')
  const start = page.getByRole('button', { name: '공원 VR 시작', exact: true })
  await expect(start).toBeEnabled({ timeout: 90000 })
  await expect(page.getByText('공원을 준비하고 있어요…', { exact: true })).toBeHidden({ timeout: 90000 })
  await page.evaluate(async p => (await import(p)).install({ frameStep: .1 }), helper)
  await start.click()
  const snapshot = () => page.evaluate(async p => (await import(p)).snapshot(), helper)
  const visible = (name: string) => page.evaluate(async ({ helper, name }) => (await import(helper)).visibleXRObject(name), { helper, name })
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  expect(await visible('park-xr-balloon-entry')).toBe(false)
  const station = loadRenewalFixtureMap().data.interactions.construction.find(site => site.id === 'balloon')!
  const [x, y, z] = station.reachPosition
  server.place({ x, y, z })
  await expect.poll(() => visible('park-xr-balloon-entry')).toBe(true)
  await page.evaluate(async p => {
    const xr = await import(p)
    xr.aimCanvas('park-xr-balloon-entry', .5, .34)
    xr.buttons({ trigger: true })
  }, helper)

  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_BALLOON_START').length).toBe(1)
  const payload = server.requests.find(r => r.type === 'WORLD_BALLOON_START')!.payload
  expect(payload).toEqual({ ticketId: expect.any(String), x: expect.any(Number), y: expect.any(Number), z: expect.any(Number), capacity: 1 })
  await expect.poll(() => visible('park-xr-balloon-status')).toBe(true)
  await page.evaluate(async p => { const xr = await import(p); xr.buttons({}); xr.input(1, true) }, helper)
  const uplifting = () => server.requests.some(r => r.type === 'WORLD_BALLOON_POSE' && Number(r.payload.y) > 41
    && Math.hypot(Number(r.payload.x) - Number(payload.x), Number(r.payload.z) - Number(payload.z)) > 21)
  await expect.poll(uplifting, { timeout: 35000 }).toBe(true)
  expect(server.restRequests.filter(r => r.path === '/api/v1/world/balloon/tickets')).toHaveLength(1)
  expect(server.requests.some(r => r.type === 'WORLD_MOVE' && (r.payload.dx || r.payload.dz || r.payload.jump))).toBe(false)
  expect((await snapshot()).position[1]).toBeGreaterThan(43)

  const frame = await page.evaluate(async p => {
    const xr = await import(p)
    xr.lookAt(4, 5, 10)
    await new Promise(resolve => setTimeout(resolve, 150))
    return xr.sceneFramePNG()
  }, helper)
  await writeFile(info.outputPath('park-vr-balloon.png'), Buffer.from(frame.split(',')[1]!, 'base64'))

  await page.evaluate(async p => (await import(p)).input(0, false, 0, true), helper)
  await expect.poll(() => server.requests.some(r => r.type === 'WORLD_BALLOON_POSE' && r.payload.aboard === false), { timeout: 35000 }).toBe(true)
  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_BALLOON_END').length).toBe(1)
  await expect.poll(() => visible('park-xr-balloon-status')).toBe(false)
  await expect.poll(async () => (await snapshot()).position[1]).toBeCloseTo(y - .8 + 1.65)
  expect((await snapshot()).active).toBe(true)
  await page.evaluate(async p => (await import(p)).input(0), helper)
  await page.evaluate(async p => (await import(p)).input(1), helper)
  await expect.poll(() => server.requests.some(r => r.type === 'WORLD_MOVE' && (r.payload.dx || r.payload.dz))).toBe(true)
  expect(errors).toEqual([])
})
