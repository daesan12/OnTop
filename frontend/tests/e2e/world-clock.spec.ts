import { expect, test, type Page } from '@playwright/test'
import { fixture } from './contractFixture'

async function loaded(page: Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
}

const clock = (page: Page) => page.evaluate(async () => {
  const state = await import('/src/world/environmentState.ts' as string)
  state.updateEnvironmentFrame(performance.now())
  return { instant: state.environmentFrame.serverTime, deviceInstant: Date.now(),
    timeZone: state.environmentConfig.timeZone, epochMs: state.environmentConfig.epochMs,
    hour: state.environmentFrame.hour, dayDurationMs: state.environmentConfig.dayDurationMs }
})

test('late joins and reloads share the Asia/Seoul game-day timeline', async ({ page, context }) => {
  const errors: string[] = []
  const observe = (p: Page) => {
    p.on('pageerror', error => errors.push(error.message))
    p.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  }
  observe(page)
  await fixture(page, { manualMovement: true })
  await loaded(page)
  const late = await context.newPage()
  try {
    observe(late)
    await late.setViewportSize({ width: 1280, height: 720 })
    await fixture(late, { manualMovement: true, ownUserId: '102' })
    await loaded(late)
    const first = await clock(page), second = await clock(late)
    for (const state of [first, second]) {
      expect(state.timeZone).toBe('Asia/Seoul')
      expect(state.epochMs).toBe(Date.parse('2026-01-01T00:00:00+09:00'))
      expect(Math.abs(state.instant - state.deviceInstant)).toBeLessThan(250)
    }
    // Account for the small real time between reads, including at midnight wrap.
    const expectedHours = (second.instant - first.instant) / first.dayDurationMs * 24
    const difference = second.hour - first.hour - expectedHours
    expect(Math.abs(Math.atan2(Math.sin(difference * Math.PI / 12), Math.cos(difference * Math.PI / 12)))).toBeLessThan(0.001)
    await page.reload()
    await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
    const reloaded = await clock(page)
    expect(reloaded.timeZone).toBe('Asia/Seoul')
    expect(Math.abs(reloaded.instant - reloaded.deviceInstant)).toBeLessThan(250)
    expect(await page.locator('vite-error-overlay').count()).toBe(0)
    expect(await late.locator('vite-error-overlay').count()).toBe(0)
    expect(errors).toEqual([])
  } finally { await late.close() }
})
