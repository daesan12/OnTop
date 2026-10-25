import { test, expect } from '@playwright/test'
import { fixture, screenshot, tableId } from './contractFixture'
import { TABLES } from '../../src/config/world'

const ordinary = TABLES.filter(t => t.pavilionId && t.pavilionId !== 'P0')
for (const anchor of ordinary) {
test(`${anchor.pavilionId} furniture preserves picking and server-confirmed seats; central pavilion stays original`, async ({ page }) => {
  const errors: string[] = []
  const consoleErrors: string[] = []
  const legacyChairRequests: string[] = []
  const fullVisual = anchor.pavilionId === 'P1' || anchor.pavilionId === 'P8'
  const name = `pavilion-${anchor.pavilionId}`
  page.on('request', r => { if (r.url().includes('/art/props/wood-chair.glb')) legacyChairRequests.push(r.url()) })
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  const server = await fixture(page, { players: 2, position: {
    x: anchor.position[0], y: anchor.position[1] + 0.8, z: anchor.position[2] + 3, yaw: Math.PI,
  } })
  // Test-only binding to exercise the unchanged production table flow at each pavilion.
  // Production/dev server bindings are never changed by this test or the visual model.
  await page.route('**/park-bindings.json', route => route.fulfill({ json: {
    bindings: [{ channelId: 'fixture-channel', tableId, anchorId: anchor.id }],
  } }))
  await page.goto('/park')
  await expect(page).toHaveTitle(/OnTop|온탑/i)
  expect(new URL(page.url()).pathname).toBe('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await page.evaluate(async id => {
    const q = await import('/tests/e2e/furnitureProbe.ts' as string)
    q.furnitureView(id)
    const scene = await import('/tests/e2e/sceneProbe.ts' as string)
    scene.visualTime(0.6)
  }, anchor.id)
  await page.waitForTimeout(1200)
  const probe = () => page.evaluate(async id => (await import('/tests/e2e/furnitureProbe.ts' as string)).furnitureProbe(id), anchor.id)
  const result = await probe()
  expect(result.furnitureCount).toBe(8)
  expect(result.legacyTables).toBe(0)
  expect(result.tablePosition).toEqual([...anchor.position])
  expect(result.furniturePosition).toEqual([...anchor.position])
  expect(result.ordinary).toEqual(ordinary.map(t => ({ id: t.id, position: [...t.position], hasFurniture: true })))
  expect(result.centralOriginal).toBe(true)
  expect(result.centralNewFurniture).toBe(false)
  expect(result.nonPavilionNewFurniture).toBe(false)
  expect(result.meshes).toHaveLength(5) // Five static instanced material/geometry batches, no per-chair mesh tree.
  expect(result.tableBounds!.max[1]).toBeCloseTo(anchor.position[1] + 1.06, 5)
  expect(result.tableBounds!.max[0]! - result.tableBounds!.min[0]!).toBeCloseTo(2.1, 5)
  expect(result.tableBounds!.max[2]! - result.tableBounds!.min[2]!).toBeCloseTo(1.6, 5)
  await screenshot(page, name + '-day')
  if (fullVisual) {
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(0.05))
  await page.waitForTimeout(800)
  await screenshot(page, name + '-night')
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(0.6))
  }
  // Click the visible table surface: the unchanged parent TableShell owns the event.
  const point = await page.evaluate(async id => (await import('/tests/e2e/sceneProbe.ts' as string)).pointForTable(id), anchor.id)
  await page.locator('canvas').click({ position: point })
  await expect(page.getByRole('dialog', { name: '테이블 정보' })).toBeVisible()
  expect((await probe()).focused).toBe(anchor.id)
  await expect(page.getByRole('button', { name: '앉기', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '앉기', exact: true }).click()
  await expect(page.getByRole('button', { name: '일어나기' })).toBeVisible()
  expect(server.sent.find(m => m.type === 'TABLE_JOIN')?.payload).toEqual({ tableId })
  await expect.poll(async () => (await probe()).own?.tableId).toBe(anchor.id)
  const seated = await probe()
  expect(seated.seatIndex).toBe(0)
  expect(seated.own?.seatIndex).toBe(0)
  expect(seated.remote).toEqual({ tableId: anchor.id, seatIndex: 1 })
  await page.waitForTimeout(600)
  await screenshot(page, name + '-seated')
  await page.evaluate(async () => (await import('/tests/e2e/furnitureProbe.ts' as string)).releaseFurnitureView())
  if (fullVisual) {
    await page.waitForTimeout(800)
    await screenshot(page, name + '-seat-camera')
  }
  await page.getByRole('button', { name: '일어나기' }).click()
  await expect(page.getByRole('button', { name: '앉기', exact: true })).toBeVisible()
  await expect.poll(async () => (await probe()).seated).toBe('')
  expect(server.sent.some(m => m.type === 'TABLE_LEAVE')).toBe(true)
  await page.getByRole('button', { name: '테이블 정보 닫기' }).click()
  await page.evaluate(async id => (await import('/tests/e2e/furnitureProbe.ts' as string)).furnitureView(id), anchor.id)
  // Compact desktop viewport; the product's controls target keyboard/mouse use.
  if (fullVisual) {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.waitForTimeout(600)
    await screenshot(page, name + '-compact')
  }
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(consoleErrors).toEqual([])
  expect(errors).toEqual([])
  expect(legacyChairRequests).toEqual([])
  await page.evaluate(async () => (await import('/tests/e2e/furnitureProbe.ts' as string)).releaseFurnitureView())
})
}
