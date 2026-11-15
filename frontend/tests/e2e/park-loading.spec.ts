import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { bungeoppangFixture } from './bungeoppangFixture'

test('keeps the startup cover until the first local avatar pose arrives', async ({ page }) => {
  let release!: () => void
  const firstWorldStateGate = new Promise<void>(resolve => { release = resolve })
  const server = await fixture(page, { firstWorldStateGate })
  try {
    await page.goto('/park')
    await expect.poll(() => server.sent.some(message => message.type === 'CHANNEL_JOIN'), { timeout: 30000 }).toBe(true)
    await expect(page.getByText('공원을 준비하고 있어요…')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('.park-scene--preparing-gate')).toBeVisible()
    await expect(page.locator('.park-scene canvas:visible')).toHaveCount(0)
    expect(await page.evaluate(() => performance.getEntriesByName('park-scene-presented').length)).toBe(0)
    release()
    await expect(page.locator('.park-scene canvas')).toBeVisible({ timeout: 90000 })
    await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden()
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  } finally { release() }
})

test('park assets start while authentication is pending without opening a socket', async ({ page }) => {
  const server = await fixture(page)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let characters = 0, scenes = 0
  page.on('request', request => {
    if (request.url().includes('/art/characters/')) characters++
    if (request.url().includes('/src/world/WorldCanvas.tsx')) scenes++
  })
  await page.route('**/api/v1/auth/refresh', async route => { await gate; await route.fallback() })
  try {
    await page.goto('/park', { waitUntil: 'domcontentloaded' })
    await expect.poll(() => characters).toBe(2)
    await expect.poll(() => scenes).toBe(1)
    await expect(page.locator('canvas')).toHaveCount(0)
    expect(server.connections).toBe(0)
    release()
    await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
    await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
    expect(server.maxActive).toBe(1)
  } finally { release() }
})

test('ticket acquisition overlaps channel loading but CONNECTED waits for validated setup', async ({ page }) => {
  const server = await fixture(page)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/channels', async route => { await gate; await route.fallback() })
  try {
    await page.goto('/park')
    await expect.poll(() => server.tickets).toBe(1)
    expect(server.connections).toBe(0)
    release()
    await expect.poll(() => server.connections).toBe(1)
    await expect(page.locator('.park-account__nickname')).toHaveText('공원 산책자')
    expect(server.maxActive).toBe(1)
  } finally { release() }
})

test('leaving the cooking screen restores controls immediately across repeat visits', async ({ page }) => {
  const errors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  const server = await bungeoppangFixture(page)
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  const canvas = await page.locator('canvas').elementHandle()
  for (let visit = 0; visit < 3; visit++) {
    await page.locator('canvas').focus()
    await page.keyboard.press('KeyE')
    await expect(page.getByRole('region', { name: '붕어빵 굽기 시작' })).toBeVisible()
    await page.getByRole('button', { name: 'ESC 나가기', exact: true }).click()
    const immediate = await page.evaluate(async () => {
      const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
      const { inputState } = await import('/src/world/inputOwnership.ts' as string)
      return { phase: useBungeoppang.getState().phase, locked: inputState.minigameOpen }
    })
    expect(immediate).toEqual({ phase: 'idle', locked: false })
  }
  expect(await canvas!.evaluate(element => element.isConnected)).toBe(true)
  await page.locator('canvas').focus()
  await page.keyboard.down('KeyS')
  await expect.poll(() => server.sent.some(message => message.type === 'WORLD_MOVE' && Number(message.payload.dz) > 0)).toBe(true)
  await page.keyboard.up('KeyS')
  await expect(page.getByLabel('조작 방법')).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
  expect(server.sent.filter(message => message.type === 'CHANNEL_JOIN')).toHaveLength(1)
  // Allow the independent 240ms camera return to settle before visual evidence.
  await page.waitForTimeout(300)
  await screenshot(page, 'park-return-desktop')
  await page.setViewportSize({ width: 740, height: 900 })
  await screenshot(page, 'park-return-narrow')
})
