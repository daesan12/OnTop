import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { parkFixture } from './fixture'

const xr = '/tests/park-xr/syntheticXR.ts'
const state = (page: Page) => page.evaluate(async p => (await import(p)).snapshot(), xr)
async function enter(page: Page) {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const server = await parkFixture(page, { carrySupported: true })
  await page.route('**/api/v1/operations/status', r => r.fulfill({ json: { mode: 'NORMAL', notice: '', version: 1,
    updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(), maintenanceStartedAt: null, expectedOpenAt: null } }))
  await page.route('**/api/v1/announcements', r => r.fulfill({ json: { serverTime: new Date().toISOString(), refreshAt: new Date(Date.now() + 10000).toISOString(), announcements: [] } }))
  await page.route('**/api/v1/minigames/skewer/coop/rooms?**', r => r.fulfill({ json: { mine: null, rooms: [] } }))
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByRole('button', { name: '공원 VR 시작', exact: true })).toBeEnabled({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await page.evaluate(async p => (await import(p)).install(), xr)
  await page.getByRole('button', { name: '공원 VR 시작', exact: true }).click()
  await expect.poll(async () => (await state(page)).active).toBe(true)
  await page.waitForTimeout(120)
  return { server, errors }
}

async function approach(page: Page, server: Awaited<ReturnType<typeof enter>>['server']) {
  const entrance = await page.evaluate(async () => (await import('/src/features/vrZone/parkBridge.ts' as string)).parkVrEntrance)
  const position = { x: entrance.x + Math.sin(entrance.yaw) * 1.4, y: entrance.y,
    z: entrance.z + Math.cos(entrance.yaw) * 1.4 }
  server.place(position)
  await expect.poll(async () => {
    const s = await state(page)
    return Math.max(Math.hypot(s.pose.x - position.x, s.pose.z - position.z),
      Math.hypot(s.position[0] - position.x, s.position[2] - position.z))
  }).toBeLessThan(.01)
  await expect.poll(async () => (await state(page)).skewerEntryVisible).toBe(true)
  await page.evaluate(async p => (await import(p)).faceSkewerEntry(), xr)
  await expect.poll(async () => (await state(page)).entryBounds
    .every((p: number[]) => Math.abs(p[0]!) < 1 && Math.abs(p[1]!) < 1)).toBe(true)
}

test('정면 팁 없이 연속·정밀 회전하고 X 안내를 닫으면 다시 시야를 비운다', async ({ page }, info) => {
  const { errors } = await enter(page)
  expect((await state(page)).statusVisible).toBe(false)
  expect((await state(page)).dialogVisible).toBe(false)
  const offset = (await page.evaluate(async p => (await import(p)).rotationSamples(), xr)).length
  await page.evaluate(async p => (await import(p)).input(0, false, .4), xr)
  await page.waitForTimeout(500)
  const samples: number[] = await page.evaluate(async p => (await import(p)).rotationSamples(), xr)
  const turns = samples.slice(offset)
  expect(turns.length).toBeGreaterThan(5)
  // 기본 90도/초의 선형 입력: .4 기울기는 약 24도/초다. 예전 제곱 감쇠보다 빠르되
  // 단일 프레임은 50ms 한도 내에서만 회전해 시점이 한꺼번에 튀지 않는다.
  expect(Math.abs(turns.at(-1)! - turns[0]!)).toBeGreaterThan(.1)
  expect(Math.abs(turns.at(-1)! - turns[0]!)).toBeLessThan(.35)
  const maxFrameTurn = 90 * Math.PI / 180 * .05 * (.4 - .18) / (1 - .18)
  expect(turns.slice(1).every((yaw, i) => Math.abs(yaw - turns[i]!) <= maxFrameTurn + 1e-6)).toBe(true)
  await page.evaluate(async p => (await import(p)).input(0), xr)
  await page.waitForTimeout(100)
  const stopped = (await state(page)).rigYaw
  await page.waitForTimeout(200)
  expect((await state(page)).rigYaw).toBeCloseTo(stopped, 5)
  await page.evaluate(async p => (await import(p)).buttons({ guide: true }), xr)
  await expect.poll(async () => (await state(page)).dialogVisible).toBe(true)
  await page.evaluate(async p => (await import(p)).buttons({ guide: false }), xr)
  await page.evaluate(async p => (await import(p)).input(0, true), xr)
  await expect.poll(async () => (await state(page)).dialogVisible).toBe(false)
  await page.evaluate(async p => (await import(p)).input(0), xr)
  await page.waitForTimeout(300)
  expect((await state(page)).statusVisible).toBe(false)
  const frame = await page.evaluate(async p => (await import(p)).sceneFramePNG(), xr)
  await writeFile(info.outputPath('park-vr-clear-view.png'), Buffer.from(frame.split(',')[1]!, 'base64'))
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('입구 밖에서는 버튼이 없고 입구에서는 키보드 없이 트리거로 협동 방에 진입한다', async ({ page }, info) => {
  const { server, errors } = await enter(page)
  expect((await state(page)).skewerEntryVisible).toBe(false)
  await approach(page, server)
  const frame = await page.evaluate(async p => (await import(p)).sceneFramePNG(), xr)
  await writeFile(info.outputPath('skewer-vr-entry.png'), Buffer.from(frame.split(',')[1]!, 'base64'))
  await page.evaluate(async p => (await import(p)).aim('skewer-entry-edge'), xr)
  await page.waitForTimeout(100)
  await page.evaluate(async p => (await import(p)).buttons({ trigger: true }), xr)
  await expect(page.getByRole('button', { name: /방 만들기/ }).first()).toBeVisible()
  await expect.poll(async () => (await state(page)).active).toBe(false)
  expect((await state(page)).ownsInput).toBe(false)
  await expect.poll(() => server.requests.some(r => r.type === 'WORLD_INTERACTION_SET' && r.payload.vrActive === false)).toBe(true)
  await page.screenshot({ path: info.outputPath('skewer-coop-from-vr.png') })
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

for (const cancel of ['B', 'interrupt'] as const) test(`입구 선택 후 XR 종료 대기 중 ${cancel}로 취소하면 협동 방을 열지 않는다`, async ({ page }) => {
  const { server, errors } = await enter(page)
  await approach(page, server)
  await page.evaluate(async p => {
    const helper = await import(p); helper.holdEnd(); helper.aim('skewer-entry')
  }, xr)
  await page.waitForTimeout(100)
  await page.evaluate(async p => (await import(p)).buttons({ trigger: true }), xr)
  await expect.poll(async () => (await state(page)).phase).toBe('ending')
  await page.evaluate(async ({ p, cancel }) => {
    const helper = await import(p)
    if (cancel === 'B') helper.input(0, false, 0, true)
    else helper.visibility('visible-blurred')
  }, { p: xr, cancel })
  await page.waitForTimeout(100)
  await page.evaluate(async p => (await import(p)).completeEnd(), xr)
  await expect.poll(async () => (await state(page)).phase).toBe('idle')
  expect(await page.evaluate(async () => (await import('/src/features/vrZone/parkBridge.ts' as string)).parkVrZone.store.getState().phase)).toBe('closed')
  await expect(page.getByRole('button', { name: /방 만들기/ })).toHaveCount(0)
  expect((await state(page)).ownsInput).toBe(false)
  expect(errors).toEqual([])
})
