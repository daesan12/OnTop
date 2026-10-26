import { expect, test, type Page } from '@playwright/test'
import { fixture } from './contractFixture'
import { facilityCatalog } from '../fixtures/facilityCatalog'

const mouseActive = (page: Page) => page.evaluate(async () =>
  (await import('/src/world/mouseLook.ts' as string)).useMouseLook.getState().active as boolean)
const yaw = (page: Page) => page.evaluate(async () =>
  (await import('/src/world/cameraPerspective.ts' as string)).viewControls.yaw as number)
const benchId = (page: Page) => page.evaluate(async () => {
  const { useSession } = await import('/src/network/worldClient.ts' as string)
  return useSession.getState().benchId as string
})
const benchPending = (page: Page) => page.evaluate(async () =>
  (await import('/src/features/interactions/benchState.ts' as string)).useBenchState.getState().pending as boolean)

test('S15P31B105-217 mouse look stays on while sitting on a bench and after standing up', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  const bench = facilityCatalog.facilities.find(d => d.kind === 'BENCH')!
  await fixture(page, { manualMovement: true, position: bench.exit })
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.locator('canvas').focus()
  await expect.poll(() => page.evaluate(async () => (await import('/src/world/roamingCamera.ts' as string)).canControlRoamingCamera())).toBe(true)

  await page.keyboard.press('Control')
  await expect.poll(() => mouseActive(page)).toBe(true)

  // The real sit path also clears movement input; that must not drop the lock.
  await page.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id, 0), bench.facilityId)
  await expect.poll(() => benchId(page)).toBe(bench.facilityId)
  await expect.poll(() => benchPending(page)).toBe(false)
  await page.waitForTimeout(300)
  expect(await mouseActive(page)).toBe(true)

  // Seated view turns with the mouse while locked.
  const seatedBefore = await yaw(page)
  await page.mouse.move(960, 540); await page.mouse.move(1060, 540, { steps: 5 })
  await expect.poll(() => yaw(page)).not.toBe(seatedBefore)
  expect(await mouseActive(page)).toBe(true)

  await page.evaluate(async () => (await import('/src/features/interactions/benchController.ts' as string)).standBench())
  await expect.poll(() => benchId(page)).toBe('')
  await expect.poll(() => benchPending(page)).toBe(false)
  await page.waitForTimeout(300)
  expect(await mouseActive(page)).toBe(true)

  await page.keyboard.press('Escape')
  await expect.poll(() => mouseActive(page)).toBe(false)
  expect(errors).toEqual([])
})
