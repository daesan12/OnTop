import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

test('chat authors keep the received name after departure and a renamed re-entry', async ({ page }) => {
  const server = await fixture(page, { publicProfiles: { '102': { nickname: '처음이름', characterGender: 'MALE' } } })
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
    mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
    version: 1, updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(),
  } }))
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 90_000 })
  await expect(page.locator('[data-player-id="102"] .avatar-nickname')).toHaveText('처음이름', { timeout: 90_000 })
  await page.getByRole('button', { name: '채팅 기록 보기' }).click()
  server.chatFrom('102', '떠나기 전 메시지')
  const old = page.locator('.park-chat__message').filter({ hasText: '떠나기 전 메시지' })
  await expect(old).toContainText('처음이름')
  server.players(1)
  await expect(page.locator('[data-player-id="102"]')).toHaveCount(0)
  await expect(old).toContainText('처음이름')
  server.profile('102', { nickname: '새이름', characterGender: 'MALE' })
  server.players(2)
  await expect(page.locator('[data-player-id="102"] .avatar-nickname')).toHaveText('새이름')
  server.chatFrom('102', '다시 입장한 메시지')
  await expect(page.locator('.park-chat__message').filter({ hasText: '다시 입장한 메시지' })).toContainText('새이름')
  await expect(old).toContainText('처음이름')
  await screenshot(page, 'chat-author-after-reentry')
})

test('all 20 nearby names render; normal view applies 50m and typing expires or stops without draft disclosure', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const server = await fixture(page, { players: 20, manualMovement: true, position: { x: 0, y: 0.8, z: 34, yaw: 0 } })
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
    mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
    version: 1, updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(),
  } }))
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await expect(page.locator('.avatar-overhead')).toHaveCount(20, { timeout: 90_000 })
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).orbit(0, 0.2, 10))
  const name = page.locator('[data-player-id="102"] .avatar-nickname')
  const overhead = page.locator('[data-player-id="102"]')
  server.remotePose({ x: 0, y: 0.8, z: -15, yaw: 0 }) // 49m from local
  await expect(name).toBeVisible()
  await expect(overhead).toHaveCSS('visibility', 'visible')
  server.remotePose({ z: -17 }) // 51m
  await expect(overhead).toHaveCSS('visibility', 'hidden')
  server.remotePose({ x: 2, z: 32 })
  server.typing([{ userId: '102', expiresInMs: 5000 }])
  const indicator = overhead.locator('.avatar-typing')
  await expect(indicator).toHaveText('입력 중…')
  await screenshot(page, 'world-names-20-and-typing')
  server.typing([])
  await expect(indicator).toHaveCount(0)
  server.typing([{ userId: '102', expiresInMs: 200 }])
  await expect(indicator).toHaveCount(1)
  await expect(indicator).toHaveCount(0)

  await page.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
  const input = page.locator('.park-chat input')
  await input.fill('비공개 작성 중인 문장')
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CHAT_TYPING_SET').length).toBeGreaterThan(0)
  const starts = server.sent.filter(message => message.type === 'WORLD_CHAT_TYPING_SET')
  expect(starts.at(-1)?.payload).toEqual({ typing: true })
  await input.fill('')
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CHAT_TYPING_SET').at(-1)?.payload).toEqual({ typing: false })
  expect(server.sent.filter(message => message.type === 'WORLD_CHAT_TYPING_SET').every(message => !JSON.stringify(message).includes('비공개'))).toBe(true)
  expect(errors).toEqual([])
})
