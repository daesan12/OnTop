import { expect, test, type Page } from '@playwright/test'
import { bungeoppangFixture } from './bungeoppangFixture'
import { screenshot } from './contractFixture'

const visibility = (page: Page) => page.evaluate(async () =>
  (await import('/tests/e2e/m14Probe.ts' as string)).m14VisibilityProbe())

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1000, height: 700 }, { width: 390, height: 844 }]) {
  test(`cooking hides park UI, uses the cart moulds and restores the park at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await bungeoppangFixture(page)
    await page.goto('/park')
    await expect(page).toHaveTitle('OnTop')
    await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
    await expect.poll(async () => (await visibility(page)).canopyVisible).toBe(true)
    await screenshot(page, `bungeoppang-cart-before-${viewport.width}`)
    await page.locator('canvas').focus()
    await page.keyboard.press('KeyE')
    await expect(page.getByRole('region', { name: '붕어빵 굽기 시작' })).toBeVisible()
    await page.getByRole('button', { name: '시작', exact: true }).click()
    await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 12000 })
    await expect(page.getByLabel('내 정보', { exact: true })).toBeVisible()
    await expect(page.getByRole('timer', { name: '남은 시간', exact: true })).toBeVisible()
    for (const selector of ['.park-channel-menu', '.park-location-chip', '.park-quick-dock', '.park-dock-wardrobe', '.park-location', '.park-shortcuts', '.park-account-actions', '.park-chat', '.emotes', '.follow-launcher', '.manual-launcher', '.park-runtime-tools', '.avatar-overlays'])
      await expect(page.locator(selector)).toBeHidden()
    for (const key of ['Enter', 'KeyZ', 'KeyG', 'KeyM']) await page.keyboard.press(key)
    await expect(page.getByRole('textbox', { name: '주변 채팅 메시지', exact: true })).toBeHidden()
    expect(await page.evaluate(async () => {
      const { inputState } = await import('/src/world/inputOwnership.ts' as string)
      return { chat: inputState.chatOpen, emote: inputState.emoteWheelOpen, map: inputState.mapOpen }
    })).toEqual({ chat: false, emote: false, map: false })
    await expect.poll(async () => (await visibility(page)).slots).toEqual(
      Array.from({ length: 6 }, () => ({ onScreen: true, blockers: [] })))
    expect(await visibility(page)).toMatchObject({ canopyVisible: false, bodyVisible: true })
    // Check against the rendered cart surface, not just another copy of the gameplay coordinates.
    for (const gap of (await visibility(page)).mouldGaps) {
      expect(gap).not.toBeNull(); expect(gap!).toBeGreaterThanOrEqual(0); expect(gap!).toBeLessThan(.06)
    }
    const points = await page.evaluate(async () =>
      (await import('/src/features/bungeoppang/bungeoppangView.ts' as string)).slotScreen.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })))
    for (const point of points) {
      await page.mouse.click(point.x, point.y)
      await page.waitForTimeout(80)
    }
    await expect.poll(() => page.evaluate(async () =>
      (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState().grill?.log.length)).toBe(6)
    await screenshot(page, `bungeoppang-grill-clear-${viewport.width}`)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '그만두기', exact: true }).click()
    await expect(page.locator('.bung-root')).toHaveCount(0)
    await expect.poll(async () => (await visibility(page)).canopyVisible).toBe(true)
    expect((await visibility(page)).bodyVisible).toBe(true)
    await expect(page.getByRole('region', { name: '주변 채팅', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '감정표현 열기', exact: true })).toBeVisible()
    await expect(page.locator('.park-quick-dock')).toBeVisible()
    await expect(page.getByRole('button', { name: '내 메뉴', exact: true })).toBeVisible()
    await screenshot(page, `bungeoppang-cart-restored-${viewport.width}`)
    await page.locator('canvas').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('textbox', { name: '주변 채팅 메시지', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.locator('canvas').focus()
    await page.keyboard.press('KeyE')
    await expect(page.getByRole('region', { name: '붕어빵 굽기 시작' })).toBeVisible()
    await expect.poll(async () => (await visibility(page)).canopyVisible).toBe(false)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

// Phones (<=600px) stack the order above and the tray below the grill; a real touch must reach every slot.
test.describe('phone touch layout', () => {
  test.use({ hasTouch: true })
  for (const viewport of [{ width: 390, height: 844 }, { width: 600, height: 800 }]) {
    test(`order and tray stay readable and leave all six slots tappable at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await bungeoppangFixture(page)
      await page.goto('/park')
      await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
      await expect(page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true })).toBeVisible({ timeout: 90000 })
      await page.locator('canvas').focus(); await page.keyboard.press('KeyE')
      await page.getByRole('button', { name: '시작', exact: true }).click()
      await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 12000 })
      const customer = page.getByRole('region', { name: '손님 주문' }), tray = page.getByRole('region', { name: '완성품 쟁반' })
      await expect(customer).toContainText('팥 2개')
      await expect(customer.getByRole('button', { name: /주문 전달하기/ })).toBeVisible()
      await expect(tray.locator('li')).toHaveCount(4)
      for (const panel of [customer, tray]) {
        const box = (await panel.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
      }
      // Each slot centre and a ring around it must hit the canvas, not a HUD panel.
      const { points, covered } = await page.evaluate(async () => {
        const { slotScreen } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string)
        const points = slotScreen.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }))
        const covered = points.flatMap((p: { x: number; y: number }, slot: number) =>
          [[0, 0], [-24, 0], [24, 0], [0, -20], [0, 20]].flatMap(([dx, dy]) => {
            const hit = document.elementFromPoint(p.x + dx!, p.y + dy!)
            return hit?.tagName === 'CANVAS' ? [] : [`${slot}:${dx},${dy}:${hit?.closest('[aria-label]')?.getAttribute('aria-label') ?? hit?.tagName}`]
          }))
        return { points, covered }
      })
      expect(covered).toEqual([])
      for (const point of points) { await page.touchscreen.tap(point.x, point.y); await page.waitForTimeout(80) }
      await expect.poll(() => page.evaluate(async () => (await import('/src/features/bungeoppang/store.ts' as string))
        .useBungeoppang.getState().grill?.log.map((entry: { action: string; slot: number }) => `${entry.action}:${entry.slot}`)))
        .toEqual([0, 1, 2, 3, 4, 5].map(slot => `POUR:${slot}`))
      await screenshot(page, `bungeoppang-v4-touch-${viewport.width}`)
    })
  }
})
