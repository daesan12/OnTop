import { expect, test } from '@playwright/test'
import { parkFixture } from '../park-integration/fixture'
import { disabledJumpmapStatus } from '../fixtures/jumpmap'
import { START } from '../../src/features/jumpmap/course'

const xr = '/tests/park-xr/syntheticXR.ts'
for (const scenario of ['outside', 'water', 'denied', 'unsupported']) test(scenario === 'denied' || scenario === 'unsupported' ? `운반 보호 ${scenario === 'unsupported' ? '미지원' : '서버 확인 실패'} 시 VR 플레이를 시작하지 않는다` : `일반 공원 VR을 숨기고 점프맵 VR에서 보호를 유지하다 ${scenario === 'water' ? '호수에 빠지면' : '구역 이탈 시'} 복귀한다`, async ({ page }) => {
  const denied = scenario === 'denied' || scenario === 'unsupported'
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const server = await parkFixture(page, { carrySupported: scenario !== 'unsupported', denyInteraction: scenario === 'denied' })
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: { mode: 'NORMAL', notice: '', version: 1, updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(), maintenanceStartedAt: null, expectedOpenAt: null } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: { serverTime: new Date().toISOString(), refreshAt: new Date(Date.now() + 10000).toISOString(), announcements: [] } }))
  await page.route('**/api/v1/minigames/jumpmap/status?**', route => route.fulfill({ json: { ...disabledJumpmapStatus('channel-1'), enabled: true } }))
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…', { exact: true })).toBeHidden({ timeout: 90000 })
  await expect(page.getByRole('button', { name: '공원 VR 시작', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '돌탑 점프맵 VR 시작', exact: true })).toHaveCount(0)
  server.place({ x: START.x, y: START.y + .8, z: START.z })
  const start = page.getByRole('button', { name: '돌탑 점프맵 VR 시작', exact: true })
  await expect(start).toBeEnabled()
  if (scenario === 'outside') {
    await page.getByRole('button', { name: 'VR 조작 안내', exact: true }).click()
    const guide = page.getByRole('dialog', { name: '돌탑 점프맵 VR 조작 안내', exact: true })
    await expect(guide.getByRole('img', { name: /좌우 컨트롤러 버튼 위치/ })).toBeVisible()
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size)
      const close = guide.getByRole('button', { name: '안내 닫기', exact: true })
      await close.scrollIntoViewIfNeeded(); await expect(close).toBeInViewport()
      const bounds = (await guide.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width + 1)
    }
    await guide.getByRole('button', { name: '안내 닫기', exact: true }).click()
    await page.setViewportSize({ width: 1440, height: 900 })
  }
  await page.evaluate(async path => (await import(path)).install(), xr)
  const startAt = server.requests.length
  await start.click()
  const state = () => page.evaluate(async path => (await import(path)).snapshot(), xr)
  if (denied) {
    await expect(page.locator('.park-xr-controls').getByRole('alert')).toContainText('보호')
    await expect.poll(async () => (await state()).phase).toBe('idle')
    expect((await state()).active).toBe(false)
    expect(await page.evaluate(async () => (await import('/src/features/vrSession/protection.ts' as string)).vrCarryProtection.active)).toBe(false)
  } else {
    await expect.poll(async () => (await state()).active).toBe(true)
    const offset = server.requests.slice(startAt).findIndex(request => request.type === 'WORLD_INTERACTION_SET' && request.payload.busy === true)
    expect(offset).toBeGreaterThanOrEqual(0)
    const protectedAt = startAt + offset
    await page.waitForTimeout(350)
    expect((await state()).active).toBe(true)
    expect(server.requests.slice(protectedAt).some(request => request.type === 'WORLD_INTERACTION_SET' && request.payload.busy === false)).toBe(false)
    if (scenario === 'water') server.place({ x: START.x, y: .8, z: START.z }, true)
    else server.place({ x: -150, y: .8, z: -150 })
    await expect.poll(async () => (await state()).active).toBe(false)
    await expect.poll(() => server.requests.slice(protectedAt).some(request => request.type === 'WORLD_INTERACTION_SET' && request.payload.busy === false)).toBe(true)
    expect((await state()).parent).not.toBe('Group')
    await expect(page.getByRole('button', { name: '공원 VR 시작', exact: true })).toHaveCount(0)
  }
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
