import { test, expect } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
import { fixture, screenshot } from '../e2e/contractFixture'
import { PARK_DATA } from '../../src/map/park'

test('avatar right click opens a compact follow menu without server copy or a close button', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const [x, y, z] = PARK_DATA.physics.spawn.position
  const server = await fixture(page, { generatedPark: true, manualMovement: true,
    publicProfiles: { '102': { nickname: '장대마운틴' } }, position: { x, y, z, yaw: 0 } })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/src/features/follow/state.ts' as string)).useFollow.getState().ready)).toBe(true)
  server.remotePose({ x: x + 3, y, z: z - 2, yaw: 0 })
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).avatarMenuPoint('102').worldX)).toBe(x + 3)
  const point = await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).avatarMenuPoint('102'))
  await page.mouse.click(point.x, point.y, { button: 'right' })
  const menu = page.getByRole('menu', { name: '장대마운틴 메뉴', exact: true })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem')).toHaveCount(1)
  await expect(menu.getByRole('menuitem', { name: '따라가기', exact: true })).toBeFocused()
  await expect(menu).not.toContainText('서버')
  await expect(menu).not.toContainText('닫기')
  const bounds = (await menu.boundingBox())!
  expect(bounds.width).toBeLessThanOrEqual(190)
  expect(bounds.height).toBeLessThanOrEqual(100)
  await screenshot(page, 'avatar-menu-compact')
  await menu.screenshot({ path: path.join(os.tmpdir(), 'ontop-avatar-menu-compact-detail.png') })
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(page.locator('canvas')).toBeFocused()
  const openAt = (x: number, y: number) => page.evaluate(async ({ x, y }) =>
    (await import('/src/features/follow/FollowMenu.tsx' as string)).openAvatarMenu({ id: '102', x, y }), { x, y })
  await openAt(600, 300)
  await expect(menu.getByRole('menuitem', { name: '따라가기', exact: true })).toBeFocused()
  await page.mouse.click(10, 10)
  await expect(menu).toHaveCount(0)
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await openAt(viewport.width - 1, viewport.height - 1)
    await expect(menu).toBeVisible()
    const box = (await menu.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 7)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 7)
    await screenshot(page, `avatar-menu-edge-${viewport.width}`)
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  }
  server.remotePose({ x: x + 30, y, z: z - 2, yaw: 0 })
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).avatarMenuPoint('102').worldX)).toBe(x + 30)
  await openAt(200, 300)
  await expect(menu.getByRole('menuitem', { name: '따라가기', exact: true })).toBeDisabled()
  await expect(menu).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  server.remotePose({ x: x + 3, y, z: z - 2, yaw: 0 })
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).avatarMenuPoint('102').worldX)).toBe(x + 3)
  await openAt(200, 300)
  await menu.getByRole('menuitem', { name: '따라가기', exact: true }).click()
  await expect(page.getByRole('complementary', { name: '따라가기 상태', exact: true })).toContainText('장대마운틴')
  await page.getByRole('button', { name: '따라가기 종료', exact: true }).click()
  await expect(page.getByRole('complementary', { name: '따라가기 상태', exact: true })).toHaveCount(0)
  expect(server.sent.filter(message => message.type === 'WORLD_FOLLOW_START')).toHaveLength(1)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
