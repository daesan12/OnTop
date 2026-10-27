import { expect, test, type Page } from '@playwright/test'
import { fixture } from './contractFixture'
import { TELESCOPE, TELESCOPES } from '../../src/config'
import { telescopeAnchors } from '../../src/features/telescopes/anchors'

const view = (page: Page) => page.evaluate(async () => {
  const { telescopeView } = await import('/src/features/telescopeView.ts' as string)
  return { yaw: telescopeView.yaw as number, pitch: telescopeView.pitch as number }
})
const telescopeId = (page: Page) => page.evaluate(async () =>
  (await import('/src/network/worldClient.ts' as string)).useSession.getState().telescopeId as string)
// The enter request stays pending a moment after the session lists the telescope; aim only once it settles.
const settled = (page: Page) => page.evaluate(async () =>
  !(await import('/src/features/telescopes/state.ts' as string)).useTelescopeState.getState().pending as boolean)
async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key)
}

test('S15P31B105-216 WASD and arrows aim the telescope, stay in bounds and never walk the avatar', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  const id = TELESCOPES[0]!.id
  const server = await fixture(page, { manualMovement: true, position: telescopeAnchors(id).use })
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.locator('canvas').focus()
  await expect.poll(() => page.evaluate(async () => (await import('/src/world/roamingCamera.ts' as string)).canControlRoamingCamera())).toBe(true)
  await page.evaluate(async telescope => (await import('/src/features/telescopes/controller.ts' as string)).enterTelescope(telescope), id)
  await expect.poll(() => telescopeId(page)).toBe(id)
  await expect.poll(() => settled(page)).toBe(true)
  await page.locator('canvas').focus()
  const movesBefore = server.sent.filter(m => m.type === 'WORLD_MOVE').length

  // D turns like moving the mouse right, A back the other way.
  const start = await view(page)
  await hold(page, 'KeyD', 400)
  const right = await view(page)
  expect(right.yaw).toBeLessThan(start.yaw)
  await hold(page, 'ArrowLeft', 400)
  expect((await view(page)).yaw).toBeGreaterThan(right.yaw)

  // W looks up and holding it stops at the upper bound.
  const before = await view(page)
  await hold(page, 'KeyW', 300)
  expect((await view(page)).pitch).toBeGreaterThan(before.pitch)
  await hold(page, 'ArrowUp', 2600)
  expect((await view(page)).pitch).toBeCloseTo(TELESCOPE.maxPitch, 3)

  // The aim reaches the server on its interval; the avatar never receives a walk input.
  await expect.poll(() => server.sent.some(m => m.type === 'WORLD_FACILITY_AIM')).toBe(true)
  expect(server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length).toBe(0)
  expect(server.sent.filter(m => m.type === 'WORLD_MOVE').length).toBeGreaterThanOrEqual(movesBefore)
  await expect(page.getByText(/FACILITY_AIM_TOO_FREQUENT/)).toHaveCount(0)

  await page.keyboard.press('KeyE')
  await expect.poll(() => telescopeId(page)).toBe('')
  expect(errors).toEqual([])
})

const mouseActive = (page: Page) => page.evaluate(async () =>
  (await import('/src/world/mouseLook.ts' as string)).useMouseLook.getState().active as boolean)

test('S15P31B105-216 keys aim only without mouse look; with mouse look the mouse alone aims', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  const id = TELESCOPES[0]!.id
  await fixture(page, { manualMovement: true, position: telescopeAnchors(id).use })
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.locator('canvas').focus()
  await expect.poll(() => page.evaluate(async () => (await import('/src/world/roamingCamera.ts' as string)).canControlRoamingCamera())).toBe(true)
  await expect.poll(async () => {
    if (!await mouseActive(page)) await page.keyboard.press('Control')
    return mouseActive(page)
  }).toBe(true)
  await page.evaluate(async telescope => (await import('/src/features/telescopes/controller.ts' as string)).enterTelescope(telescope), id)
  await expect.poll(() => telescopeId(page)).toBe(id)
  await expect.poll(() => settled(page)).toBe(true)
  expect(await mouseActive(page)).toBe(true)

  const locked = await view(page)
  await hold(page, 'KeyD', 400)
  expect((await view(page)).yaw).toBe(locked.yaw)

  // A Ctrl tap turns mouse look off; the keys then aim.
  await page.keyboard.press('Control')
  await expect.poll(() => mouseActive(page)).toBe(false)
  const unlocked = await view(page)
  await hold(page, 'KeyD', 400)
  expect((await view(page)).yaw).toBeLessThan(unlocked.yaw)
  expect(errors).toEqual([])
})
