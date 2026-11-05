import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

test('E picks up a nearby player, throws along the camera, and blocks games and chat', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`) })
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
  const server = await fixture(page, { generatedPark: true, carry: true, position: { x: 0, y: .84, z: 78, yaw: Math.PI } })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length),
    { timeout: 90000 }).toBeGreaterThan(0)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.evaluate(async () => {
    const path = '/tests/e2e/sceneProbe.ts'
    ;(await import(path)).faceCarryTarget()
  })
  const pickup = page.getByRole('button', { name: /님 들기/ })
  await expect(pickup).toBeVisible()
  await page.locator('canvas').focus()
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('button', { name: /바라보는 방향으로 던지기/ })).toBeVisible()
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_PICKUP').length).toBe(1)
  await screenshot(page, 'carry-holding-desktop')
  const direction = await page.evaluate(async () => {
    const path = '/tests/e2e/sceneProbe.ts'
    return (await import(path)).carryProbe().aim
  })
  await page.keyboard.press('KeyE')
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_THROW').length).toBe(1)
  const thrown = server.sent.find(message => message.type === 'WORLD_CARRY_THROW')!
  expect(thrown.payload.dx).toBeCloseTo(direction.dx, 2)
  expect(thrown.payload.dy).toBeCloseTo(direction.dy, 2)
  expect(thrown.payload.dz).toBeCloseTo(direction.dz, 2)
  await expect.poll(() => page.evaluate(async () => {
    const path = '/tests/e2e/sceneProbe.ts'
    return (await import(path)).carryProbe().carries['102']?.role
  }), { message: JSON.stringify(server.sent.filter(message => message.type.startsWith('WORLD_CARRY')
    || message.type === 'WORLD_INTERACTION_SET')) }).toBe('THROWN')
  await screenshot(page, 'carry-thrown-desktop')
  server.releaseCarry()
  await expect.poll(() => page.evaluate(async () => {
    const path = '/tests/e2e/sceneProbe.ts'
    return (await import(path)).carryProbe().carries['102'] ?? null
  })).toBeNull()
  await expect(pickup).toBeVisible()

  for (const activity of ['GAME', 'BUNGEOPPANG'] as const) {
    server.activity('102', activity)
    await expect(pickup).toBeHidden()
    const before = server.sent.filter(message => message.type.startsWith('WORLD_CARRY')).length
    await page.keyboard.press('KeyE')
    expect(server.sent.filter(message => message.type.startsWith('WORLD_CARRY')).length).toBe(before)
  }
  server.activity('102', null)
  await expect(pickup).toBeVisible()
  await page.keyboard.press('Enter')
  const chat = page.getByLabel('주변 채팅 메시지')
  await expect(chat).toBeFocused()
  await chat.fill('e')
  const before = server.sent.filter(message => message.type.startsWith('WORLD_CARRY')).length
  await chat.press('KeyE')
  expect(server.sent.filter(message => message.type.startsWith('WORLD_CARRY')).length).toBe(before)
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 900, height: 540 })
  await page.locator('canvas').focus()
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('button', { name: /바라보는 방향으로 던지기/ })).toBeInViewport()
  await screenshot(page, 'carry-short-viewport')
  await page.keyboard.press('Escape')
  await expect(pickup).toBeVisible()
  expect(server.sent.filter(message => message.type === 'WORLD_CARRY_RELEASE')).toHaveLength(1)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(await page.title()).not.toBe('')
  expect(page.url()).toContain('/park')
  expect(errors).toEqual([])
})
