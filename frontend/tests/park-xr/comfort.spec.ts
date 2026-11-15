import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { parkFixture } from './fixture'

const helper = '/tests/park-xr/syntheticXR.ts'
const snapshot = (page: Page) => page.evaluate(async p => (await import(p)).snapshot(), helper)
async function select(page: Page, action: string) {
  await page.evaluate(async ({ p, action }) => {
    const xr = await import(p); xr.buttons({ trigger: false }); xr.aim(action)
  }, { p: helper, action })
  await page.waitForTimeout(100)
  await page.evaluate(async p => (await import(p)).buttons({ trigger: true }), helper)
  await page.waitForTimeout(150)
}
async function prepare(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const server = await parkFixture(page, { carrySupported: true })
  await page.route('**/api/v1/operations/status', r => r.fulfill({ json: { mode: 'NORMAL', notice: '', version: 1,
    updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(), maintenanceStartedAt: null, expectedOpenAt: null } }))
  await page.route('**/api/v1/announcements', r => r.fulfill({ json: { serverTime: new Date().toISOString(), refreshAt: new Date(Date.now() + 10000).toISOString(), announcements: [] } }))
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByRole('button', { name: '공원 VR 시작', exact: true })).toBeEnabled({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  return { server, errors }
}

test('준비 화면 설정은 한지 팝업에서 선택하고 작은 화면에서도 마지막 버튼까지 접근한다', async ({ page }, info) => {
  const { errors } = await prepare(page)
  await page.getByRole('button', { name: 'VR 편안함 설정', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'VR 편안함 설정', exact: true })
  await expect(dialog.getByLabel('회전 속도')).toHaveValue('90')
  await expect(dialog.getByLabel('플레이 자세')).toHaveValue('seated')
  await expect(dialog.getByLabel('앉기 모드 기준 눈높이')).toHaveValue('1.8')
  await dialog.getByLabel('회전 방식').selectOption('snap')
  await dialog.getByLabel('스냅 각도').selectOption('45')
  for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size)
    await dialog.getByRole('button', { name: '설정 완료' }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('button', { name: '설정 완료' })).toBeInViewport()
    const rect = (await dialog.boundingBox())!
    expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(size.width + 1)
    await page.screenshot({ path: info.outputPath(`comfort-${size.width}x${size.height}.png`) })
  }
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ontop:park-xr-comfort:v1')!))
  expect(saved).toMatchObject({ turnMode: 'snap', snapAngle: 45, posture: 'seated', seatedEyeHeight: 1.8 })
  await dialog.getByRole('button', { name: '설정 완료' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('VR 레이저 설정·좌식 보정·재설정·스냅 회전은 몸 위치와 보호를 유지한다', async ({ page }, info) => {
  const { server, errors } = await prepare(page)
  await page.getByRole('button', { name: 'VR 편안함 설정', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'VR 편안함 설정', exact: true })
  await dialog.getByLabel('플레이 자세').selectOption('seated')
  await dialog.getByLabel('앉기 모드 기준 눈높이').selectOption('1.6')
  await dialog.getByRole('button', { name: '설정 완료' }).click()
  await page.evaluate(async p => { const xr = await import(p); xr.install(); xr.height(1) }, helper)
  await page.getByRole('button', { name: '공원 VR 시작', exact: true }).click()
  await expect.poll(async () => (await snapshot(page)).active).toBe(true)
  const eyeHeight = async () => { const s = await snapshot(page); return s.position[1]! - (s.pose.y - .8) }
  await expect.poll(eyeHeight).toBeCloseTo(1.6, 2)
  await page.evaluate(async p => (await import(p)).height(.8), helper)
  await expect.poll(eyeHeight).toBeCloseTo(1.4, 2)
  await page.evaluate(async p => (await import(p)).height(1.2), helper)
  await page.getByRole('button', { name: 'VR 조작 안내', exact: true }).click()
  await expect.poll(async () => (await snapshot(page)).view?.key).toBe('park-guide')
  await select(page, 'comfort')
  await expect.poll(async () => (await snapshot(page)).view?.key).toBe('comfort')
  await select(page, 'reset-height')
  await expect.poll(eyeHeight).toBeCloseTo(1.6, 2)
  await expect.poll(async () => (await snapshot(page)).heightNotice).toContain('맞췄어요')
  await select(page, 'posture')
  await expect.poll(eyeHeight).toBeCloseTo(1.2, 2)
  await select(page, 'turn-mode')
  await select(page, 'turn-value')
  await expect.poll(async () => (await snapshot(page)).settings.snapAngle).toBe(45)
  const native = await page.evaluate(async p => (await import(p)).guideTexturePNG(), helper)
  await writeFile(info.outputPath('comfort-immersive-native.png'), Buffer.from(native.split(',')[1]!, 'base64'))
  const blockedAt = server.requests.length
  await page.evaluate(async p => (await import(p)).input(1, true, 1), helper)
  await page.waitForTimeout(200)
  expect(server.requests.slice(blockedAt).some(r => r.type === 'WORLD_MOVE' && (r.payload.dx || r.payload.dz || r.payload.jump))).toBe(false)
  await page.evaluate(async p => (await import(p)).input(0), helper)
  await select(page, 'comfort-back')
  await select(page, 'continue')
  await expect.poll(async () => (await snapshot(page)).dialogVisible).toBe(false)
  const before = await snapshot(page)
  await page.evaluate(async p => (await import(p)).input(0, false, 1), helper)
  await expect.poll(async () => Math.abs((await snapshot(page)).rigYaw - before.rigYaw)).toBeCloseTo(Math.PI / 4, 2)
  await page.waitForTimeout(300)
  const after = await snapshot(page)
  expect(Math.abs(after.rigYaw - before.rigYaw)).toBeCloseTo(Math.PI / 4, 2)
  expect(Math.hypot(after.position[0]! - before.position[0]!, after.position[2]! - before.position[2]!)).toBeLessThan(.01)
  expect(after.active).toBe(true); expect(after.statusVisible).toBe(false)
  expect(server.requests.filter(r => r.type === 'WORLD_INTERACTION_SET').at(-1)?.payload.vrActive).toBe(true)
  await page.evaluate(async p => (await import(p)).input(0, false, 0, true), helper)
  await expect.poll(async () => (await snapshot(page)).active).toBe(false)
  await expect.poll(() => server.requests.some(r => r.type === 'WORLD_INTERACTION_SET' && r.payload.vrActive === false)).toBe(true)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
