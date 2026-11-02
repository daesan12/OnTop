import { test, expect } from '@playwright/test'
import { parkFixture } from './fixture'
import { screenshot } from '../e2e/contractFixture'
import { PARK_DATA } from '../../src/map/park'

test('latest park pavilion furniture and hanging lanterns stay connected and clear', async ({ page }) => {
  const errors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  const server = await parkFixture(page)
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  expect(new URL(page.url()).pathname).toBe('/park')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  const daylight = () => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.5))
  const probe = () => page.evaluate(async () => (await import('/tests/park-integration/pavilionAssetProbe.ts' as string)).pavilionClearance())
  await daylight()
  const result = await probe()
  expect(result.gaps).toHaveLength(13)
  for (const gap of result.gaps) {
    expect(gap.gap).toBeGreaterThan(.3)
    expect(gap.supported).toBe(true)
    expect(gap.cap).toBeCloseTo(0, 4)
  }
  expect(result.underside).toBe(true)
  expect(result.connectedTip).toBe(true)
  for (const id of ['P0', 'P1']) {
    const stand = await page.evaluate(async id => {
      const { PARK_PAVILIONS } = await import('/src/park/mapConfig.ts' as string)
      const p = PARK_PAVILIONS.find((p: {id:string}) => p.id === id)!
      return { x: p.x, y: p.floor + .8, z: p.z + p.scale, yaw: Math.PI }
    }, id)
    server.place(stand)
    for (const view of ['inside', 'bench', 'outside', 'hanger'] as const) {
      await daylight()
      await page.evaluate(async ({ id, view }) => (await import('/tests/park-integration/pavilionAssetProbe.ts' as string)).pavilionView(id, view), { id, view })
      await page.waitForTimeout(700)
      await screenshot(page, `pavilion-assets-${id}-${view}`)
    }
    expect(await page.evaluate(async id =>
      (await import('/tests/park-integration/pavilionAssetProbe.ts' as string)).pavilionHangerConnected(id), id)).toEqual([true, true, true, true, true])
    await page.evaluate(async id => {
      (await import('/tests/park-integration/pavilionAssetProbe.ts' as string)).pavilionView(id, 'inside')
      ;(await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.02)
    }, id)
    await expect.poll(async () => (await probe()).emission).toBeGreaterThan(1)
    await screenshot(page, `pavilion-assets-${id}-night`)
    await daylight()
    await page.evaluate(async () => (await import('/tests/park-integration/pavilionAssetProbe.ts' as string)).releasePavilionView())
    const bench = PARK_DATA.interactions.benches.find(b => b.siteId === `bench-${id}-bay-0`)!
    server.place({ x: bench.position[0], y: bench.position[1] + .8, z: bench.position[2] })
    const hint = page.getByRole('complementary', { name: '가까운 상호작용' })
    await expect(hint).toHaveAttribute('data-target-id', bench.id)
    await hint.getByRole('button', { name: /벤치에 앉기/ }).click()
    const seated = () => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().benchId)
    await expect.poll(seated).toBe(bench.id)
    expect(server.requests.filter(r => r.type === 'WORLD_FACILITY_USE').at(-1)!.payload.facilityId).toBe(bench.id)
    await screenshot(page, `pavilion-assets-${id}-seated`)
    await page.keyboard.press('KeyW')
    await expect.poll(seated).toBe('')
  }
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.evaluate(async () => (await import('/tests/park-integration/pavilionAssetProbe.ts' as string)).pavilionView('P0', 'outside'))
  await page.waitForTimeout(300)
  await screenshot(page, 'pavilion-assets-compact')
  await page.evaluate(async () => (await import('/tests/park-integration/pavilionAssetProbe.ts' as string)).releasePavilionView())
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
})
