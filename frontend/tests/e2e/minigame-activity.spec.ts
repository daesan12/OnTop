import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

test('a nearby player shows a persistent bungeoppang activity bubble and removes it on server-approved exit', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const server = await fixture(page, { manualMovement: true, position: { x: 0, y: .8, z: 34, yaw: 0 } })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => {
    const s = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    return s.status === 'connected' && s.ids.includes('102')
  }), { timeout: 90000 }).toBe(true)
  server.remotePose({ x: 2, y: .8, z: 32, yaw: 0 })
  const other = page.locator('.avatar-overhead[data-player-id="102"]')
  server.activity('102', 'BUNGEOPPANG')
  await expect(other.getByText('붕어빵 뒤집는 중', { exact: true })).toBeVisible()
  await expect(page.locator('.avatar-overhead-own .avatar-activity')).toHaveCount(0)
  server.chatFrom('102', '잠시만 기다려줘!')
  await expect(other.getByText('잠시만 기다려줘!', { exact: true })).toBeVisible()
  await expect(other.getByText('붕어빵 뒤집는 중', { exact: true })).toBeVisible()
  await expect(other.locator('.avatar-activity')).toHaveCSS('background-color', 'rgb(98, 66, 25)')
  await expect(other.locator('.avatar-speech:not(.avatar-activity)')).toHaveCSS('background-color', 'rgb(239, 236, 224)')
  await screenshot(page, 'bungeoppang-remote-activity')
  server.activity('102', null)
  await expect(other.locator('.avatar-activity')).toHaveCount(0)
  await expect(other.getByText('잠시만 기다려줘!', { exact: true })).toBeVisible()
  server.activity('102', 'BUNGEOPPANG'); await expect(other.locator('.avatar-activity')).toBeVisible()
  // Ordinary chat expires after ten seconds; the activity lasts until the server ends it.
  await expect(other.getByText('잠시만 기다려줘!', { exact: true })).toHaveCount(0, { timeout: 12000 })
  await expect(other.getByText('붕어빵 뒤집는 중', { exact: true })).toBeVisible()
  await screenshot(page, 'bungeoppang-activity-after-chat-expired')
  server.activity('102', null); await expect(other.locator('.avatar-activity')).toHaveCount(0)
  server.activity('102', 'BUNGEOPPANG'); await expect(other.locator('.avatar-activity')).toBeVisible()
  server.players(1); await expect(other).toHaveCount(0)
  expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
