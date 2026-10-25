import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

async function models(page: Page) {
  return page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).characterProbe())
}
async function loaded(page: Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
}

test('server public profiles update stationary names, chat and real character rigs without a display fixture', async ({ page }) => {
  const errors: string[] = [], consoleErrors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  const server = await fixture(page, {
    manualMovement: true, position: { x: 0, y: 0.8, z: 34, yaw: 0 },
    publicProfiles: { '102': { nickname: null, characterGender: null } },
  })
  await loaded(page)
  server.remotePose({ x: 2.2, y: 0.8, z: 34, yaw: 0 })
  const remoteName = page.locator('[data-player-id="102"] .avatar-nickname')
  await expect(remoteName).toHaveText('산책자 102')
  server.profile('102', { nickname: '봄산책', characterGender: 'FEMALE' })
  await expect(remoteName).toHaveText('봄산책')
  await expect.poll(async () => (await models(page)).avatars[1]!.character).toBe('girl')
  await expect.poll(async () => (await models(page)).avatars[1]!.bones).toBe(49)
  const girlSkeleton = (await models(page)).avatars[1]!.skeleton
  server.chatFrom('102', '안녕하세요')
  await expect(page.locator('.park-chat__message')).toContainText('봄산책')

  // A server refresh changes only the profile; no movement, ID list change or local display seeding.
  server.profile('102', { nickname: '여름산책', characterGender: null })
  await expect(remoteName).toHaveText('여름산책')
  await expect(page.locator('.park-chat__message')).toContainText('여름산책')
  expect((await models(page)).avatars[1]!.skeleton).toBe(girlSkeleton)
  server.profile('102', { nickname: null, characterGender: null })
  server.world()
  await expect(remoteName).toHaveText('여름산책')
  expect((await models(page)).avatars[1]!.character).toBe('girl')
  await screenshot(page, 'm03-public-profile-girl')

  server.profile('102', { nickname: null, characterGender: 'MALE' })
  await expect.poll(async () => (await models(page)).avatars[1]!.character).toBe('man')
  await expect.poll(async () => (await models(page)).avatars[1]!.bones).toBe(49)
  expect((await models(page)).avatars[1]!.skeleton).not.toBe(girlSkeleton)
  await expect(remoteName).toHaveText('여름산책')
  await screenshot(page, 'm03-public-profile-man')
  expect(page.url()).toContain('/park')
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('departure, re-entry and a fresh-ticket reconnect obtain new public profiles', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const server = await fixture(page, { publicProfiles: { '102': { nickname: '처음이름', characterGender: 'FEMALE' } } })
  await loaded(page)
  const name = page.locator('[data-player-id="102"] .avatar-nickname')
  await expect(name).toHaveText('처음이름')
  server.players(1)
  await expect(name).toHaveCount(0)
  server.profile('102', { nickname: null, characterGender: null })
  server.players(2)
  await expect(name).toHaveText('산책자 102')
  server.profile('102', { nickname: '재입장이름', characterGender: 'MALE' })
  await expect(name).toHaveText('재입장이름')
  server.close(1013)
  await expect.poll(() => server.connections).toBe(2)
  await expect.poll(() => server.tickets).toBe(2)
  await expect(name).toHaveText('재입장이름')
  await expect(page.locator('.park-account__nickname')).toHaveText('공원 산책자')
  await expect(page.getByLabel('보유 엽전', { exact: true })).toHaveText('100냥')
  expect(server.maxActive).toBe(1)
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
  expect(errors).toEqual([])
})
