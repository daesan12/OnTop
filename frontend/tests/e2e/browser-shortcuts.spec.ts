import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

test('game shortcuts are cancelled before modal handlers; editing, F1 and Esc remain usable', async ({ page }) => {
  const errors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.addInitScript(() => {
    const records: KeyboardEvent[] = []
    Object.assign(window, { shortcutRecords: records, pointerRequests: 0 })
    // Register before the app; inspect final cancellation even if propagation stops later.
    window.addEventListener('keydown', event => records.push(event), true)
  })
  const server = await fixture(page, { manualMovement: true, emoteBindings: 'development',
    position: { x: 0, y: 0.8, z: 34, yaw: 0 } })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  const canvas = page.locator('canvas')
  await canvas.focus()
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/world/inputOwnership.ts' as string)).roamingInput.ready)).toBe(true)
  await page.evaluate(() => {
    document.querySelector('canvas')!.requestPointerLock = () => {
      const state = window as unknown as { pointerRequests: number }
      state.pointerRequests++
      return Promise.resolve()
    }
  })
  for (const chord of ['F11', 'F12', 'F5', 'Control+Shift+KeyI', 'Control+Shift+KeyJ', 'Control+Shift+KeyC',
    'Control+Shift+KeyK', 'Control+KeyU', 'Control+KeyS', 'Control+KeyP', 'Control+KeyR',
    'Control+Shift+KeyR', 'Meta+Alt+KeyI', 'Meta+Alt+KeyU']) {
    await page.keyboard.press(chord)
    expect(await page.evaluate(() => {
      const records = (window as unknown as { shortcutRecords: KeyboardEvent[] }).shortcutRecords
      return records.at(-1)?.defaultPrevented
    }), chord).toBe(true)
  }
  expect(await page.evaluate(() => (window as unknown as { pointerRequests: number }).pointerRequests)).toBe(0)
  await expect(page).toHaveURL(/\/park$/)

  // Held movement stops on the intercepted shortcut without waiting for keyup.
  await canvas.focus()
  await page.keyboard.down('KeyW')
  await expect.poll(() => server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length).toBeGreaterThan(0)
  await page.keyboard.press('F12')
  const moving = server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length
  await page.waitForTimeout(400)
  expect(server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length).toBe(moving)
  await page.keyboard.up('KeyW')

  // The same input reset reaches the live world controls on browser lifecycle changes.
  for (const lifecycle of ['blur', 'pagehide', 'fullscreenchange', 'visibilitychange']) {
    await canvas.focus()
    const before = server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length
    await page.keyboard.down('KeyW')
    await expect.poll(() => server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length).toBeGreaterThan(before)
    await page.evaluate(type => {
      if (type === 'visibilitychange') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true })
        document.dispatchEvent(new Event(type))
        Reflect.deleteProperty(document, 'hidden')
      } else (type === 'fullscreenchange' ? document : window).dispatchEvent(new Event(type))
    }, lifecycle)
    const stopped = server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length
    await page.waitForTimeout(250)
    expect(server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length, lifecycle).toBe(stopped)
    await page.keyboard.up('KeyW')
  }

  const emotesBefore = server.sent.filter(m => m.type === 'WORLD_EMOTE_SEND').length
  await page.keyboard.down('KeyG')
  const wheel = page.getByRole('dialog', { name: '감정표현 선택' })
  await expect(wheel).toBeVisible()
  await page.keyboard.press('F12')
  await expect(wheel).toHaveCount(0)
  await page.keyboard.up('KeyG')
  expect(server.sent.filter(m => m.type === 'WORLD_EMOTE_SEND').length).toBe(emotesBefore)

  // The existing manual consumes capture events; the guard must still run first.
  await page.keyboard.press('F1')
  await expect(page.locator('dialog[open]')).toBeVisible()
  await page.keyboard.press('F12')
  expect(await page.evaluate(() =>
    (window as unknown as { shortcutRecords: KeyboardEvent[] }).shortcutRecords.at(-1)?.defaultPrevented)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.locator('dialog[open]')).toHaveCount(0)

  await canvas.focus(); await page.keyboard.press('Enter')
  const input = page.locator('.park-chat input')
  await expect(input).toBeFocused()
  await input.fill('입력 유지 확인')
  await page.keyboard.press('Control+A')
  expect(await input.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!)).toBe('입력 유지 확인'.length)
  await page.keyboard.press('Control+KeyU')
  await expect(input).toHaveValue('입력 유지 확인')
  await page.keyboard.press('Escape')
  await screenshot(page, 'browser-shortcuts-park')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('login has no game shortcut guard', async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: { code: 'UNAUTHORIZED' } }))
  await page.goto('/')
  await expect(page.locator('.login-page')).toBeVisible()
  expect(await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { code: 'F12', key: 'F12', bubbles: true, cancelable: true })
    return window.dispatchEvent(event)
  })).toBe(true)
})
