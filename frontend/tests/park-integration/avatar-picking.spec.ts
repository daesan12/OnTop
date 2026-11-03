import { expect, test } from '@playwright/test'
import { fixture } from '../e2e/contractFixture'
import { PARK_DATA } from '../../src/map/park'

test('camera clicks and drags skip remote skins while native right-click keeps the visible avatar menu and follow action', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const [x, y, z] = PARK_DATA.physics.spawn.position
  const server = await fixture(page, { generatedPark: true, manualMovement: true,
    publicProfiles: { '102': { nickname: '클릭 검증' } }, position: { x, y, z, yaw: 0 } })
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect.poll(() => page.evaluate(async () => (await import('/src/features/follow/state.ts' as string)).useFollow.getState().ready)).toBe(true)
  server.remotePose({ x: x + 3, y, z: z - 2, yaw: 0 })
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).avatarMenuPoint('102').worldX)).toBe(x + 3)
  await page.evaluate(async () => (await import('/tests/park-integration/avatarPickingProbe.ts' as string)).watchAvatarPicking('101'))

  for (let i = 0; i < 10; i++) {
    const point = await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).avatarMenuPoint('102'))
    await page.mouse.click(point.x, point.y)
    await page.mouse.move(960, 500); await page.mouse.down()
    await page.mouse.move(990, 500); await page.mouse.up()
  }
  const counts = () => page.evaluate(async () => (await import('/tests/park-integration/avatarPickingProbe.ts' as string)).avatarPickingCounts())
  expect(await counts()).toEqual({ calls: 0, hidden: 0, own: 0 })
  await expect(page.getByRole('menu')).toHaveCount(0)
  const point = await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).avatarMenuPoint('102'))
  await page.mouse.click(point.x, point.y, { button: 'right' })
  const menu = page.getByRole('menu', { name: '클릭 검증 메뉴', exact: true })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '따라가기', exact: true })).toBeFocused()
  expect((await counts()).calls).toBeGreaterThan(0)
  expect((await counts()).hidden).toBe(0)
  expect((await counts()).own).toBe(0)
  await menu.getByRole('menuitem', { name: '따라가기', exact: true }).click()
  await expect(page.getByRole('complementary', { name: '따라가기 상태', exact: true })).toContainText('클릭 검증')
  await page.getByRole('button', { name: '따라가기 종료', exact: true }).click()
  expect(server.sent.filter(message => message.type === 'WORLD_FOLLOW_START')).toHaveLength(1)
  expect(errors).toEqual([])
})
