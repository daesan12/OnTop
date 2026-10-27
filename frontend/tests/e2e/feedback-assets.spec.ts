import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

const browserErrors = new WeakMap<object, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource:.*status of (401|403|404|503)/.test(m.text())) errors.push(m.text())
  })
})
test.afterEach(async ({ page }) => {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(browserErrors.get(page)).toEqual([])
})

test('game context menu suppression preserves text editing and the avatar menu', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await fixture(page, { players: 2 })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  for (const selector of ['canvas', '.park-shortcuts', '.park-page img']) {
    expect(await page.locator(selector).first().evaluate(el => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
      el.dispatchEvent(event)
      return event.defaultPrevented
    })).toBe(true)
  }
  await page.keyboard.press('Enter')
  const input = page.getByLabel('주변 채팅 메시지')
  await expect(input).toBeFocused()
  expect(await input.evaluate(el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })))).toBe(true)
  await input.press('Escape')
  await page.locator('canvas').focus()
  const point = await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).avatarMenuPoint('102'))
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await expect(page.locator('.follow-menu')).toBeVisible()
  expect(errors).toEqual([])
})

for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
  test(`compact emote wheel opens on G and remains selectable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const server = await fixture(page, { emoteBindings: 'development', position: { x: 0, y: 0.8, z: 34, yaw: 0 } })
    await page.goto('/park')
    await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
    await page.locator('canvas').focus()
    await page.mouse.move(viewport.width / 2, viewport.height / 2)
    await page.keyboard.down('KeyG')
    const wheel = page.getByRole('dialog', { name: '감정표현 선택' })
    await expect(wheel).toBeVisible()
    const box = (await wheel.boundingBox())!
    expect(box.width).toBeCloseTo(320, 0)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    await expect(wheel).not.toContainText('서버')
    await expect(wheel).not.toContainText('목업')
    await screenshot(page, `feedback-emote-${viewport.width}`)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.up('KeyG')
    await expect(wheel).toBeHidden()
    await expect.poll(() => server.sent.filter(m => m.type === 'WORLD_EMOTE_SEND').length).toBe(1)
  })
}

test('approved swimming and seated skins render without changing server coordinates', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const server = await fixture(page, { players: 2, manualMovement: true, position: { x: 56, y: -0.075, z: -12, yaw: 0 } })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await expect.poll(() => server.connections).toBe(1)
  const probe = () => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).movementProbe())
  server.pose({ swimming: true, moving: true })
  server.remotePose({ x: 58, y: -0.075, z: -12, yaw: 0, swimming: true, moving: true })
  await expect.poll(async () => (await probe()).figureRotationX).toBeCloseTo(1.3, 2)
  await expect.poll(async () => (await probe()).rippleCount).toBe(2)
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).orbit(0.9, 0.35, 6.8))
  await screenshot(page, 'feedback-swim-crawl')
  server.pose({ moving: false })
  await expect.poll(async () => (await probe()).figureRotationX).toBeCloseTo(0.18, 2)
  expect((await probe()).approved?.y).toBeCloseTo(-0.075)
  await screenshot(page, 'feedback-swim-tread')
  const bench = await page.evaluate(async () => (await import('/src/features/interactions/benchAnchors.ts' as string)).benchAnchors[0])
  server.pose({ ...bench.exit, swimming: false, moving: false })
  server.facilities.remote('bench-0')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).characterProbe().avatars[1]?.leg?.[0])).toBeCloseTo(-Math.PI / 2, 2)
  await screenshot(page, 'feedback-bench-seated')
  expect(errors).toEqual([])
})
