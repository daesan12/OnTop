import { expect, test } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'
import { PARK_DATA } from '../../src/map/park'

for (const running of [false, true]) for (const ticked of [false, true]) {
  test(`remote ${running ? 'run' : 'walk'} stops animating at a stationary ${ticked ? 'buffered' : 'legacy'} endpoint and resumes on movement`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const [x, y, z] = PARK_DATA.physics.spawn.position
    await fixture(page, { generatedPark: true, manualMovement: true, position: { x, y, z, yaw: 0 } })
    await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
      mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
      version: 1, updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(),
    } }))
    await page.goto('/park')
    await expect(page).toHaveTitle('OnTop')
    await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 90_000 })
    await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
    await expect(page.locator('.avatar-overhead[data-player-id="102"]')).toBeAttached()
    await page.evaluate(async () => (await import('/tests/park-integration/remoteLocomotionProbe.ts' as string)).observeRemoteLocomotion())
    const publish = (positionX: number) => page.evaluate(async ({ positionX, running, ticked }) =>
      (await import('/tests/park-integration/remoteLocomotionProbe.ts' as string)).publishRemote(positionX, running, ticked),
    { positionX, running, ticked })
    const trace = () => page.evaluate(async () =>
      (await import('/tests/park-integration/remoteLocomotionProbe.ts' as string)).remoteLocomotionFrames() as
      { at: number; x: number; z: number; moving: boolean; running: boolean; leg: number }[])
    for (let step = 0; step < 8; step++) {
      await publish(x + 1 + step * .3)
      await page.waitForTimeout(100)
    }
    const walking = await trace()
    expect(walking.some(frame => frame.moving && frame.running === running)).toBe(true)
    const endpoint = x + 3.1
    await expect.poll(async () => (await trace()).at(-1)?.x).toBeCloseTo(endpoint, 3)
    const stoppedAt = await page.evaluate(() => performance.now())
    await expect.poll(async () => {
      const tail = (await trace()).filter(frame => frame.at > stoppedAt).slice(-5)
      return tail.length === 5 && tail.every(frame => !frame.moving && !frame.running)
    }).toBe(true)
    // No final idle packet was sent: the renderer must not jog at the frozen position.
    expect(await page.evaluate(async () =>
      (await import('/src/network/worldClient.ts' as string)).avatars.get('102')!.moving)).toBe(true)
    const settled = (await trace()).filter(frame => frame.at > stoppedAt)
    expect(settled.every(frame => Math.abs(frame.x - endpoint) < .001)).toBe(true)
    await screenshot(page, `remote-${running ? 'run' : 'walk'}-stopped-${ticked ? 'buffered' : 'legacy'}`)
    const resumedAt = await page.evaluate(() => performance.now())
    for (let step = 1; step < 5; step++) {
      await publish(endpoint - step * .3)
      await page.waitForTimeout(100)
    }
    await expect.poll(async () => (await trace()).some(frame =>
      frame.at > resumedAt && frame.moving && frame.running === running)).toBe(true)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}
