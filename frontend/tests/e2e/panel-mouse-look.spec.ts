import { expect, test, type Page } from '@playwright/test'
import { fixture } from './contractFixture'
import { facilityCatalog } from '../fixtures/facilityCatalog'

const mouseActive = (page: Page) => page.evaluate(async () =>
  (await import('/src/world/mouseLook.ts' as string)).useMouseLook.getState().active as boolean)
// A cold dev server can miss the very first Ctrl tap; tap again only while still off.
const lockMouse = (page: Page) => expect.poll(async () => {
  if (!await mouseActive(page)) await page.keyboard.press('Control')
  return mouseActive(page)
}).toBe(true)
async function loaded(page: Page) {
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.locator('canvas').focus()
  await expect.poll(() => page.evaluate(async () => (await import('/src/world/roamingCamera.ts' as string)).canControlRoamingCamera())).toBe(true)
}

// Each panel needs the cursor, so it releases mouse look; closing it returns to the state before.
const panels = [
  { name: 'map', open: (page: Page) => page.keyboard.press('KeyM'), close: (page: Page) => page.keyboard.press('KeyM'),
    view: (page: Page) => page.getByRole('dialog', { name: '공원 지도창', exact: true }) },
  { name: 'manual', open: (page: Page) => page.keyboard.press('F1'), close: (page: Page) => page.keyboard.press('Escape'),
    view: (page: Page) => page.getByRole('dialog', { name: '게임 설명서', exact: true }) },
  { name: 'emote wheel', open: (page: Page) => page.keyboard.down('KeyG'), close: (page: Page) => page.keyboard.up('KeyG'),
    view: (page: Page) => page.getByRole('dialog', { name: '감정표현 선택' }) },
]

for (const panel of panels) test(`${panel.name} returns to the mouse look state from before it opened`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await fixture(page, { position: { x: 0, y: .8, z: 34, yaw: Math.PI } })
  await loaded(page)

  await lockMouse(page)
  await panel.open(page)
  await expect(panel.view(page)).toBeVisible()
  await expect.poll(() => mouseActive(page)).toBe(false)
  await panel.close(page)
  await expect(panel.view(page)).toBeHidden()
  await expect.poll(() => mouseActive(page)).toBe(true)

  // Opened without mouse look, it stays off after closing.
  await page.keyboard.press('Control')
  await expect.poll(() => mouseActive(page)).toBe(false)
  await panel.open(page)
  await expect(panel.view(page)).toBeVisible()
  await panel.close(page)
  await expect(panel.view(page)).toBeHidden()
  await page.waitForTimeout(400)
  expect(await mouseActive(page)).toBe(false)
  expect(errors).toEqual([])
})

test('a panel opened while seated on a bench returns mouse look to the bench', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  const bench = facilityCatalog.facilities.find(d => d.kind === 'BENCH')!
  await fixture(page, { manualMovement: true, position: bench.exit })
  await loaded(page)
  await lockMouse(page)
  await page.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id, 0), bench.facilityId)
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/network/worldClient.ts' as string)).useSession.getState().benchId as string)).toBe(bench.facilityId)

  const manual = page.getByRole('dialog', { name: '게임 설명서', exact: true })
  await page.keyboard.press('F1')
  await expect(manual).toHaveAttribute('data-phase', 'open')
  await expect.poll(() => mouseActive(page)).toBe(false)
  await page.keyboard.press('Escape')
  await expect(manual).toHaveCount(0)
  await expect.poll(() => mouseActive(page)).toBe(true)
  expect(errors).toEqual([])
})
