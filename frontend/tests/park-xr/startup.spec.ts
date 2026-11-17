import { expect, test } from '@playwright/test'
import { parkFixture } from './fixture'

test('공원 VR은 보호 확인을 기다리는 동안에도 장면을 그리고 입력은 차단한다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const server = await parkFixture(page, { carrySupported: true })
  let confirm: (() => void) | undefined
  server.interceptRequest(request => {
    if (request.type !== 'WORLD_INTERACTION_SET' || request.payload.vrActive !== true) return false
    confirm = () => server.emit('WORLD_INTERACTION_STATE', {
      channelId: 'channel-1', busy: true, vrActive: true,
    }, request.requestId)
    return true
  })
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const now = new Date().toISOString()
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
    mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
    version: 1, updatedAt: now, serverTime: now,
  } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: {
    serverTime: now, refreshAt: new Date(Date.now() + 600_000).toISOString(), announcements: [],
  } }))
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  const start = page.getByRole('button', { name: '공원 VR 시작', exact: true })
  await expect(start).toBeEnabled({ timeout: 90_000 })
  await expect(page.getByText('공원을 준비하고 있어요…')).toHaveCount(0)
  const path = '/tests/park-xr/syntheticXR.ts'
  await page.evaluate(async path => (await import(path)).install(), path)
  await start.click()
  await expect.poll(() => !!confirm).toBe(true)
  await expect(page.getByRole('button', { name: 'VR 연결 중…', exact: true })).toBeDisabled()
  await page.evaluate(async path => {
    const xr = await import(path)
    xr.input(1, true)
    xr.buttons({ guide: true })
  }, path)
  await expect.poll(() => page.evaluate(async path => (await import(path)).xrPresentedFrames(), path)).toBeGreaterThan(1)
  const pending = await page.evaluate(async path => (await import(path)).snapshot(), path)
  expect(pending.phase).toBe('requesting')
  expect(pending.dialogVisible).toBe(false)
  expect(server.requests.some(r => r.type === 'WORLD_MOVE' && (r.payload.dx || r.payload.dz || r.payload.jump))).toBe(false)
  await page.screenshot({ path: info.outputPath('park-visible-before-protection.png') })

  await page.evaluate(async path => {
    const xr = await import(path)
    xr.input(0)
    xr.buttons({})
  }, path)
  confirm!()
  await expect(page.getByRole('button', { name: '공원 VR 종료', exact: true })).toBeEnabled()
  await page.evaluate(async path => (await import(path)).input(1), path)
  await expect.poll(() => server.requests.some(r => r.type === 'WORLD_MOVE' && (r.payload.dx || r.payload.dz))).toBe(true)
  await page.getByRole('button', { name: '공원 VR 종료', exact: true }).click()
  await expect(start).toBeEnabled()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
