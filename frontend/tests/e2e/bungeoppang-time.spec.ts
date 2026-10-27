import { expect, test, type Page } from '@playwright/test'
import { bungeoppangFixture } from './bungeoppangFixture'
import { screenshot } from './contractFixture'

const state = (page: Page) => page.evaluate(async () => {
  const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
  const { bungeoppangClock } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string)
  const s = useBungeoppang.getState()
  return { phase: s.phase, gameId: s.gameId, log: s.grill?.log, t: bungeoppangClock.t,
    pending: s.timeSyncPending, error: s.timeSyncError }
})
async function open(page: Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true })).toBeVisible()
  await page.locator('canvas').focus(); await page.keyboard.press('KeyE')
  await page.getByRole('button', { name: '시작', exact: true }).click()
}

test('PC clock skew, preparation and tab-return clock retry preserve one round and prior actions', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.addInitScript(() => {
    const calendarNow = Date.now.bind(Date)
    Date.now = () => calendarNow() + 3_600_000
  })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const server = await bungeoppangFixture(page)
  await open(page)
  await expect(page.locator('.bung-big-text')).toContainText('준비 중')
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 10000 })
  await page.locator('canvas').focus(); await page.keyboard.press('KeyQ')
  const before = await state(page)
  expect(before.t).toBeLessThan(2000)
  expect(before.log).toHaveLength(1)
  server.loseNextClockRead()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('.bung-time-sync')).toContainText('다시')
  await page.keyboard.press('KeyW')
  expect((await state(page)).log).toEqual(before.log)
  await screenshot(page, 'bungeoppang-clock-retry')
  await page.getByRole('button', { name: '시간 다시 확인', exact: true }).click()
  await expect(page.locator('.bung-time-sync')).toBeHidden()
  await page.locator('canvas').focus(); await page.keyboard.press('KeyW')
  const restored = await state(page)
  expect(restored.gameId).toBe(before.gameId)
  expect(restored.log?.slice(0, before.log!.length)).toEqual(before.log)
  expect(restored.log).toHaveLength(2)
  expect(server.requests.filter(request => request.method === 'POST' && request.path.endsWith('/sessions'))).toHaveLength(1)
  await screenshot(page, 'bungeoppang-clock-resynced')
  expect(errors).toEqual([])
})

test('a delayed start response uses elapsed server play time instead of restarting the countdown', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const server = await bungeoppangFixture(page)
  server.delayNextStartResponse(6500)
  await open(page)
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 12000 })
  const current = await state(page)
  expect(current.t).toBeGreaterThanOrEqual(1800)
  expect(current.t).toBeLessThan(5000)
  expect(server.requests.some(request => request.method === 'GET' && request.path.endsWith(`/${current.gameId}`))).toBe(true)
  await screenshot(page, 'bungeoppang-clock-late-start')
  expect(errors).toEqual([])
})
