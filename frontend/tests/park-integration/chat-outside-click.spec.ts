import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'
import { PARK_DATA } from '../../src/map/park'

const input = (page: Page) => page.getByRole('textbox', { name: '주변 채팅 메시지', exact: true })
const openChat = (page: Page) => page.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
const chatOpen = (page: Page) => page.evaluate(async () =>
  (await import('/src/world/inputOwnership.ts' as string)).inputState.chatOpen)
const errors = new WeakMap<Page, string[]>()

test.beforeEach(({ page }) => {
  const messages: string[] = []; errors.set(page, messages)
  page.on('pageerror', error => messages.push(error.message))
  page.on('console', message => { if (message.type() === 'error') messages.push(message.text()) })
})
test.afterEach(async ({ page }) => {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors.get(page)).toEqual([])
})

async function loaded(page: Page, chatDelayMs = 0) {
  const [x, y, z] = PARK_DATA.physics.spawn.position
  const server = await fixture(page, { generatedPark: true, manualMovement: true, chatDelayMs,
    position: { x, y, z, yaw: 0 } })
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
    mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
    version: 1, updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(),
  } }))
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.locator('.park-chat__radius')).toHaveText('반경 50m', { timeout: 90_000 })
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/world/roamingCamera.ts' as string)).canControlRoamingCamera())).toBe(true)
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/world/cameraPerspective.ts' as string)).useCameraPerspective.getState().perspective)).toBe('third-person')
  return server
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
  test(`mouse-opened chat dismisses on a canvas click, preserves the draft and restores movement at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const server = await loaded(page)
    const moves = () => server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length
    await openChat(page)
    await input(page).fill('작성 중인 한글 초안')
    await expect.poll(() => chatOpen(page)).toBe(true)
    const before = moves()
    await input(page).press('KeyW')
    expect(moves()).toBe(before)
    await input(page).fill('작성 중인 한글 초안')
    await screenshot(page, `chat-outside-before-${viewport.width}`)
    await page.locator('canvas').click({ position: { x: viewport.width / 2, y: 140 } })
    await expect(input(page)).toHaveCount(0)
    await expect.poll(() => chatOpen(page)).toBe(false)
    await expect(page.locator('canvas')).toBeFocused()
    await expect.poll(() => server.sent.filter(m => m.type === 'WORLD_CHAT_TYPING_SET').at(-1)?.payload.typing).toBe(false)
    expect(server.sent.filter(m => m.type === 'WORLD_CHAT_SEND')).toHaveLength(0)
    await page.keyboard.down('KeyW')
    await expect.poll(moves).toBeGreaterThan(before)
    await page.keyboard.up('KeyW')
    await screenshot(page, `chat-outside-restored-${viewport.width}`)
    await openChat(page)
    await expect(input(page)).toHaveValue('작성 중인 한글 초안')
  })
}

test('chat history clicks keep editing and mouse submission sends once then releases movement', async ({ page }) => {
  const server = await loaded(page)
  await openChat(page)
  await input(page).fill('마우스로 전송')
  await page.getByRole('button', { name: '채팅 기록 보기', exact: true }).click()
  await page.getByRole('log').click()
  await expect(input(page)).toHaveValue('마우스로 전송')
  await expect.poll(() => chatOpen(page)).toBe(true)
  await page.getByRole('button', { name: '메시지 보내기', exact: true }).click()
  await expect(input(page)).toHaveCount(0)
  expect(server.sent.filter(m => m.type === 'WORLD_CHAT_SEND')).toHaveLength(1)
  await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.down('KeyW')
  await expect.poll(() => server.sent.some(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz))).toBe(true)
  await page.keyboard.up('KeyW')
})

test('closing during a delayed rejected send keeps the draft and allows a mouse retry', async ({ page }) => {
  const server = await loaded(page, 1000)
  server.rejectChat()
  await openChat(page)
  await input(page).fill('실패해도 보관할 초안')
  await page.getByRole('button', { name: '메시지 보내기', exact: true }).click()
  await page.locator('canvas').click({ position: { x: 960, y: 140 } })
  await expect(input(page)).toHaveCount(0)
  await expect.poll(() => chatOpen(page)).toBe(false)
  await expect(page.locator('.park-chat__notice')).toContainText('내용을 보관')
  await expect(page.locator('canvas')).toBeFocused()
  await openChat(page)
  await expect(input(page)).toHaveValue('실패해도 보관할 초안')
  await expect(input(page)).toBeEditable()
  await page.getByRole('button', { name: '메시지 보내기', exact: true }).click()
  await expect.poll(() => server.sent.filter(m => m.type === 'WORLD_CHAT_SEND').length).toBe(2)
  await expect(input(page)).toBeEditable()
  await expect(input(page)).toHaveValue('실패해도 보관할 초안')
})

test('an outside UI click opens its panel while chat releases only its own input ownership', async ({ page }) => {
  const server = await loaded(page)
  await openChat(page)
  await input(page).fill('설명서를 보고 이어 쓸 초안')
  await page.locator('.manual-launcher').click()
  const manual = page.getByRole('dialog', { name: '게임 설명서', exact: true })
  await expect(manual).toHaveAttribute('data-phase', 'open')
  await expect(input(page)).toHaveCount(0)
  await expect.poll(() => chatOpen(page)).toBe(false)
  const moves = () => server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length
  const before = moves()
  await page.keyboard.press('KeyW')
  expect(moves()).toBe(before)
  await page.getByRole('button', { name: '설명서 닫기', exact: true }).click()
  await expect(manual).toHaveCount(0)
  await openChat(page)
  await expect(input(page)).toHaveValue('설명서를 보고 이어 쓸 초안')
})

test('a delayed successful send does not steal focus from the outside control clicked after submitting', async ({ page }) => {
  await loaded(page, 3000)
  await openChat(page)
  await input(page).fill('전송 응답을 기다리는 메시지')
  await page.getByRole('button', { name: '메시지 보내기', exact: true }).click()
  const channel = page.getByRole('button', { name: '현재 공원과 접속 인원', exact: true })
  await channel.click()
  await expect(input(page)).toHaveCount(0)
  await expect(channel).toBeFocused()
  await expect(page.locator('.park-chat__message')).toContainText('전송 응답을 기다리는 메시지')
  await expect(channel).toBeFocused()
  await expect.poll(() => chatOpen(page)).toBe(false)
})
