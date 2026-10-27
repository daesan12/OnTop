import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

async function loaded(page: Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
}

test('both rendered rigs crawl forward while moving and running, then return to treading water', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const server = await fixture(page, { manualMovement: true, position: { x: 56, y: -.075, z: -12, yaw: 0 },
    publicProfiles: { '101': { characterGender: 'FEMALE' }, '102': { characterGender: 'MALE' } } })
  await loaded(page)
  for (const running of [false, true]) {
    server.pose({ moving: true, swimming: true, running })
    server.remotePose({ x: 58.2, y: -.075, z: -12, yaw: 0, moving: true, swimming: true, running })
    const tilt = () => page.evaluate(async () =>
      (await import('/tests/e2e/sceneProbe.ts' as string)).characterProbe().avatars.map((a: {figureX: number}) => a.figureX))
    await expect.poll(async () => (await tilt()).every((x: number) => x > 1.28)).toBe(true)
    const travel = await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).swimDirectionProbe())
    for (const angle of Object.values(travel) as number[]) expect(angle).toBeGreaterThan(1)
  }
  await screenshot(page, 'swim-forward-desktop')
  server.pose({ moving: false, running: false })
  server.remotePose({ moving: false, running: false })
  await expect.poll(async () => page.evaluate(async () =>
    (await import('/tests/e2e/sceneProbe.ts' as string)).characterProbe().avatars.every((a: { figureX: number }) => Math.abs(a.figureX - .18) < .01))).toBe(true)
  expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
