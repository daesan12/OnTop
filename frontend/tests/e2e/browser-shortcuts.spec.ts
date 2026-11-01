import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

test('developer tool, source and close shortcuts are cancelled when delivered to the park', async ({ page }) => {
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
  // Dispatch cancellable DOM events so testing refresh/print/save does not leave the flow.
  const allowed = await page.evaluate(() => {
    const shortcuts = [
      { code: 'F5' }, { code: 'F5', ctrlKey: true }, { code: 'F11' },
      { code: 'KeyR', ctrlKey: true }, { code: 'KeyR', ctrlKey: true, shiftKey: true },
      { code: 'KeyR', metaKey: true, shiftKey: true },
      { code: 'KeyK', ctrlKey: true, shiftKey: true },
      ...['KeyS', 'KeyP'].map(code => ({ code, ctrlKey: true })),
      { code: 'KeyZ', ctrlKey: true, shiftKey: true },
    ]
    return shortcuts.map(shortcut => {
      const event = new KeyboardEvent('keydown', { ...shortcut, bubbles: true, cancelable: true })
      window.dispatchEvent(event)
      window.dispatchEvent(new KeyboardEvent('keyup', { ...shortcut, bubbles: true, cancelable: true }))
      return { shortcut, cancelled: event.defaultPrevented }
    })
  })
  for (const result of allowed) expect(result.cancelled, JSON.stringify(result.shortcut)).toBe(false)
  const restricted = ['F12', 'Control+F12', 'Control+Shift+KeyI', 'Control+Shift+KeyJ', 'Control+Shift+KeyC',
    'Control+KeyU', 'Control+KeyW', 'Control+F4', 'Control+Shift+KeyW', 'Meta+KeyW', 'Meta+Shift+KeyW',
    'Meta+Alt+KeyI', 'Meta+Alt+KeyJ', 'Meta+Alt+KeyC', 'Meta+Alt+KeyU', 'Meta+Shift+KeyC']
  for (const chord of restricted) {
    await page.keyboard.press(chord)
    expect(await page.evaluate(() => {
      const records = (window as unknown as { shortcutRecords: KeyboardEvent[] }).shortcutRecords
      return records.at(-1)?.defaultPrevented
    }), chord).toBe(true)
  }
  expect(await page.evaluate(() => (window as unknown as { pointerRequests: number }).pointerRequests)).toBe(0)
  await expect(page).toHaveURL(/\/park$/)

  // Each intercepted shortcut stops held movement without waiting for keyup.
  for (const chord of ['F12', 'Control+Shift+KeyI', 'Control+Shift+KeyJ', 'Control+Shift+KeyC', 'Control+KeyW', 'Meta+Alt+KeyI']) {
    await canvas.focus()
    const before = server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length
    await page.keyboard.down('KeyW')
    await expect.poll(() => server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length).toBeGreaterThan(before)
    await page.keyboard.press(chord)
    const moving = server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length
    await page.waitForTimeout(250)
    expect(server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length, chord).toBe(moving)
    await page.keyboard.up('KeyW')
  }

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
  for (const chord of restricted) {
    await page.keyboard.press(chord)
    expect(await page.evaluate(() =>
      (window as unknown as { shortcutRecords: KeyboardEvent[] }).shortcutRecords.at(-1)?.defaultPrevented), chord).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(page.locator('dialog[open]')).toHaveCount(0)

  await canvas.focus(); await page.keyboard.press('Enter')
  const input = page.locator('.park-chat input')
  await expect(input).toBeFocused()
  await input.fill('입력 유지 확인')
  await page.keyboard.press('Control+A')
  expect(await input.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!)).toBe('입력 유지 확인'.length)
  for (const chord of ['F12', 'Control+KeyW', 'Meta+Alt+KeyI']) {
    await page.keyboard.press(chord)
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('입력 유지 확인')
  }
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
    return ['F12', 'KeyI', 'KeyJ', 'KeyC', 'KeyW', 'KeyU', 'F4'].every(code => window.dispatchEvent(new KeyboardEvent('keydown', {
      code, key: code, ctrlKey: code !== 'F12', shiftKey: code !== 'F12', bubbles: true, cancelable: true,
    })))
  })).toBe(true)
})
