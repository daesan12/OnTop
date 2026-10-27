import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { EXPECTED_MAP } from '../../src/config/mapVersion'
import { FOUNTAIN, TABLES } from '../../src/config'

test('confirms the known FE map before joining and renders the corrected fountain and seats', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const server = await fixture(page, { manualMovement: true, mapVerificationRequired: true,
    position: { x: FOUNTAIN.x + 8, y: .8, z: FOUNTAIN.z + 8, yaw: 0 } })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  const confirm = server.sent.findIndex(m => m.type === 'WORLD_MAP_CONFIRM')
  const join = server.sent.findIndex(m => m.type === 'CHANNEL_JOIN')
  expect(confirm).toBeGreaterThanOrEqual(0)
  expect(join).toBeGreaterThan(confirm)
  expect(server.sent[confirm]!.payload).toEqual(EXPECTED_MAP)
  const state = await page.evaluate(async () => {
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    return { compatible: useSession.getState().mapCompatible, roomId: useSession.getState().roomId }
  })
  expect(state).toEqual({ compatible: true, roomId: 'fixture-channel' })
  await screenshot(page, 'world-map-fountain')
  const table = TABLES.find(t => !t.pavilionId && !t.picnicId)!
  server.pose({ x: table.position[0] + 4, y: table.position[1] + .8, z: table.position[2] + 4, yaw: 0 })
  await expect.poll(async () => page.evaluate(async () => {
    const probe = await import('/tests/e2e/sceneProbe.ts' as string)
    return probe.movementProbe().sampled?.x
  })).toBeCloseTo(table.position[0] + 4)
  // Use a low side view so the existing tree canopy does not hide the seat evidence.
  await page.evaluate(async () => {
    const { viewControls } = await import('/src/world/input.ts' as string)
    Object.assign(viewControls, { yaw: Math.PI / 2, pitch: .12, distance: 5 })
    await new Promise<void>(resolve => {
      let frames = 0
      const frame = () => ++frames < 40 ? requestAnimationFrame(frame) : resolve()
      requestAnimationFrame(frame)
    })
  })
  await screenshot(page, 'world-map-stone-seats')
  expect(errors).toEqual([])
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
})

for (const boundary of ['old map', 'rejected confirmation'] as const) {
  test(`blocks channel entry and movement for ${boundary}`, async ({ page }) => {
    const server = await fixture(page, { mapVerificationRequired: true,
      ...(boundary === 'old map'
        ? { mapVersion: '544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0' }
        : { rejectMapConfirmation: true }) })
    await page.goto('/park')
    await expect(page.getByRole('alert')).toContainText('맵 버전')
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(150)
    await page.keyboard.up('KeyW')
    expect(server.sent.some(m => m.type === 'CHANNEL_JOIN' || m.type === 'WORLD_MOVE')).toBe(false)
    expect(server.sent.filter(m => m.type === 'WORLD_MAP_CONFIRM')).toHaveLength(boundary === 'old map' ? 0 : 1)
    expect(await page.locator('vite-error-overlay').count()).toBe(0)
  })
}
