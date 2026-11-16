import { expect, test, type Page } from '@playwright/test'
import { identity, parkFixture } from './fixture'
import { PARK_DATA } from '../../src/map/park'

const xr = '/tests/park-xr/syntheticXR.ts'
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
})
async function enter(page: Page) {
  const server = await parkFixture(page, { carrySupported: true })
  await page.route('**/api/v1/operations/status', r => r.fulfill({ json: { mode: 'NORMAL', notice: '', version: 1,
    updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(), maintenanceStartedAt: null, expectedOpenAt: null } }))
  await page.route('**/api/v1/announcements', r => r.fulfill({ json: { serverTime: new Date().toISOString(), refreshAt: new Date(Date.now() + 10000).toISOString(), announcements: [] } }))
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByRole('button', { name: '공원 VR 시작', exact: true })).toBeEnabled({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  return server
}

test('VR 닉네임은 잠시 멀어지면 재사용하고 오래 벗어나면 자원을 해제한다', async ({ page }) => {
  const server = await enter(page)
  const [x, y, z] = PARK_DATA.physics.spawn.position
  const position = { x, y, z, yaw: 0, lastInputSeq: 0, moving: false, running: false, swimming: false }
  server.emit('WORLD_STATE', { channelId: 'channel-1', mapVersion: identity.mapVersion, version: 1000,
    avatars: [{ userId: '101', position, carry: null }, { userId: '102', nickname: 'VR 체험자',
      position: { ...position, x: x + 1.5 }, carry: null }] })
  await expect.poll(() => page.evaluate(async path => (await import(path)).checkNicknamePanelLifetime('102'), xr)).toEqual({
    hidden: true, reused: true, removed: true, recreated: true, disposed: ['geometry', 'material', 'texture'],
  })
})

test('다른 유저 닉네임 옆 VR 배지를 표시하고 일반 팝업·종료·퇴장은 구분한다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const server = await enter(page)
  const [x, y, z] = PARK_DATA.physics.spawn.position
  const position = { x, y, z, yaw: 0, lastInputSeq: 0, moving: false, running: false, swimming: false }
  let version = 1000
  const peer = (vrActive: boolean, present = true) => server.emit('WORLD_STATE', { channelId: 'channel-1', mapVersion: identity.mapVersion,
    version: ++version, avatars: [{ userId: '101', position, carry: null }, ...(present ? [{ userId: '102', nickname: 'VR 체험자',
      characterGender: 'FEMALE', position: { ...position, x: x + 1.5 }, carry: null, interactionBusy: true, vrActive }] : [])] })
  const badge = page.locator('.avatar-overhead[data-player-id="102"]').getByLabel('VR 플레이 중', { exact: true })
  peer(false)
  await expect(page.locator('.avatar-overhead[data-player-id="102"] .avatar-nickname')).toContainText('VR 체험자')
  await expect(badge).toHaveCount(0)
  peer(true)
  await expect(badge).toBeVisible()
  await expect(page.locator('.avatar-overhead[data-player-id="102"] .avatar-nickname')).toContainText('VR 체험자VR')
  await page.screenshot({ path: info.outputPath('remote-vr-badge.png') })
  peer(false)
  await expect(badge).toHaveCount(0)
  peer(true); await expect(badge).toBeVisible()
  peer(false, false)
  await expect(badge).toHaveCount(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

for (const end of ['button', 'disconnect']) test(`VR 시작·${end} 시 서버 표시 동기화와 초기화`, async ({ page }) => {
  const server = await enter(page)
  const start = page.getByRole('button', { name: '공원 VR 시작', exact: true })
  await expect(start).toBeEnabled({ timeout: 90000 })
  await page.evaluate(async path => (await import(path)).install(), xr)
  await start.click()
  const active = () => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().vrPlayers['101'] === true)
  await expect.poll(active).toBe(true)
  expect(server.requests.some(r => r.type === 'WORLD_INTERACTION_SET' && r.payload.busy === true && r.payload.vrActive === true)).toBe(true)
  await page.waitForTimeout(100)
  if (end === 'button') {
    await page.evaluate(async path => (await import(path)).input(0, false, 0, true), xr)
    await expect.poll(active).toBe(false)
    expect(server.requests.some(r => r.type === 'WORLD_INTERACTION_SET' && r.payload.vrActive === false)).toBe(true)
  } else {
    await page.evaluate(async path => (await import(path)).disconnectWithoutFrames(), xr)
    await expect(page.getByLabel('VR 플레이 중', { exact: true })).toHaveCount(0)
  }
  await expect.poll(async () => page.evaluate(async path => (await import(path)).snapshot().active, xr)).toBe(false)
})
