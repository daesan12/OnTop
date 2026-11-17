import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { loadRenewalFixtureMap, parkFixture } from './fixture'

const helper = '/tests/park-xr/syntheticXR.ts'

async function mockParkStatus(page: Page) {
  const now = new Date().toISOString()
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: { mode: 'NORMAL', notice: '',
    maintenanceStartedAt: null, expectedOpenAt: null, version: 1, updatedAt: now, serverTime: now } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: { announcements: [], serverTime: now,
    refreshAt: new Date(Date.now() + 60000).toISOString() } }))
}

test('220m 공원 PC에서 E로 열기구 문을 오가고 같은 내부에서 비행하고 채팅한다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const server = await parkFixture(page, { balloonSupported: true })
  await mockParkStatus(page)
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.locator('canvas')).toBeVisible({ timeout: 90000 })
  const camera = '/src/world/cameraPerspective.ts'
  const aim = '/src/features/interactions/interactionAim.ts'
  const setCamera = (yaw = 0, pitch = 0) => page.evaluate(async ({ path, yaw, pitch }) => {
    const { viewControls, setCameraPerspective } = await import(path)
    setCameraPerspective('third-person')
    Object.assign(viewControls, { yaw, pitch, distance: 7 })
  }, { path: camera, yaw, pitch })
  const up = () => page.evaluate(async path => (await import(path)).interactionAim.dy, aim) as Promise<number>
  await expect.poll(() => page.evaluate(async path => (await import(path)).interactionAim.ready, aim), { timeout: 90000 }).toBe(true)
  await setCamera()
  await expect.poll(up).toBeCloseTo(0, 1)
  await page.mouse.move(720, 650)
  await page.mouse.down()
  await expect.poll(() => page.evaluate(async path => (await import(path)).roamingInput.draggingCamera,
    '/src/world/inputOwnership.ts')).toBe(true)
  await page.mouse.move(720, 180, { steps: 12 })
  await page.mouse.up()
  await expect.poll(up).toBeGreaterThan(.8)
  await page.screenshot({ path: info.outputPath('park-look-up.png') })

  const sign = await page.evaluate(async paths => {
    const [{ renewalAdSigns }, { groundSurfaceHeight }] = await Promise.all(paths.map(path => import(path)))
    const { x, z } = renewalAdSigns[0]
    return { x, z: z + 2, y: groundSurfaceHeight(x, z + 2) + .8 }
  }, ['/park-renewal-preview/live/advertisingPlacement.ts', '/park-renewal-preview/groundSurface.ts'])
  server.place(sign)
  await setCamera()
  await expect(page.getByRole('button', { name: 'E 광고 보기', exact: true })).toBeVisible({ timeout: 20000 })
  await page.keyboard.press('e')
  const ad = page.locator('.park-advertisement-dialog')
  await expect(ad).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(ad).toBeHidden()

  const station = loadRenewalFixtureMap().data.interactions.construction.find(site => site.id === 'balloon')!
  const [x, y, z] = station.reachPosition
  server.place({ x, y, z })
  await setCamera(station.yaw, .32)
  await expect(page.getByRole('button', { name: 'E 열기구 탑승', exact: true })).toBeVisible()
  const probe = '/tests/park-integration/probe.ts'
  const visible = (name: string) => page.evaluate(async ({ probe, name }) => (await import(probe)).preparedAssetVisible(name), { probe, name })
  const cabin = (name: string) => page.evaluate(async ({ probe, name }) => (await import(probe)).balloonCabinProbe(name), { probe, name })
  await expect.poll(() => visible('docked-balloon')).toBe(true)
  const dockedCabin = await cabin('docked-balloon')
  expect(dockedCabin).toMatchObject({ visible: true, controls: 2, door: Math.PI / 2 })
  expect(dockedCabin.floor).toBeGreaterThan(y - .8)
  expect(dockedCabin.floor).toBeLessThan(y - .8 + .05)
  await expect.poll(() => visible('balloon-wayfinding')).toBe(true)
  expect(await visible('balloon-boarding-gate')).toBe(false)
  expect(await visible('balloon-approach-sign')).toBe(false)
  await page.screenshot({ path: info.outputPath('park-balloon-entrance.png') })
  await page.keyboard.press('e')
  const boarding = page.getByRole('dialog', { name: '하늘언덕 열기구 탑승 준비' })
  await expect(boarding).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: '주변 채팅 메시지' })).toBeHidden()
  await boarding.getByRole('button', { name: '100냥 내고 탑승하기' }).click()
  const ride = page.getByRole('complementary', { name: '열기구 운항' })
  await expect(ride).toHaveAttribute('data-phase', 'boarding')
  await expect(ride.getByRole('button', { name: 'E 내리기' })).toBeVisible()
  await expect.poll(() => cabin('local-balloon-ride')).toMatchObject({
    visible: true, seats: dockedCabin.seats, controls: dockedCabin.controls, door: dockedCabin.door,
  })
  expect((await cabin('local-balloon-ride')).floor).toBeCloseTo(dockedCabin.floor)
  await expect.poll(() => visible('docked-balloon')).toBe(false)
  await page.screenshot({ path: info.outputPath('park-balloon-boarded.png') })
  await page.keyboard.press('e')
  await expect(ride).toBeHidden()
  await expect.poll(() => server.requests.filter(request => request.type === 'WORLD_BALLOON_END').length).toBe(1)
  await expect(page.getByRole('button', { name: 'E 열기구 탑승', exact: true })).toBeVisible()

  await page.keyboard.press('e')
  await boarding.getByRole('button', { name: '100냥 내고 탑승하기' }).click()
  await expect(ride).toHaveAttribute('data-phase', 'boarding')
  const tickets = server.restRequests.filter(request => request.path === '/api/v1/world/balloon/tickets')
  expect(tickets).toHaveLength(2)
  expect(tickets[0]!.body.requestId).toBe(tickets[1]!.body.requestId)
  await ride.getByRole('button', { name: '출발', exact: true }).click()
  const back = page.getByRole('button', { name: '승강장 복귀' })
  await expect(back).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await cabin('local-balloon-ride')).door).toBe(0)
  await page.keyboard.press('e')
  expect(server.requests.filter(request => request.type === 'WORLD_BALLOON_END')).toHaveLength(1)
  await page.keyboard.press('Enter')
  const chat = page.getByRole('textbox', { name: '주변 채팅 메시지' })
  await expect(chat).toBeFocused()
  await chat.pressSequentially('balloon chat')
  await page.screenshot({ path: info.outputPath('park-balloon-chat.png') })
  await chat.press('Enter')
  await expect(page.getByRole('log')).toContainText('balloon chat')
  await expect(page.locator('canvas')).toBeFocused()
  await back.click()
  await expect(page.getByText('승강장으로 돌아갑니다.', { exact: true })).toBeVisible()
  await expect.poll(() => server.requests.filter(request => request.type === 'WORLD_BALLOON_END').length).toBe(2)
  await expect(page.getByRole('button', { name: 'E 열기구 탑승', exact: true })).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('220m 공원에서 VR 열기구에 탑승해 자동 비행하고 B로 승강장에 복귀한다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const server = await parkFixture(page, { carrySupported: true, balloonSupported: true, environmentEpochMs: Date.now() - 600000 })
  await mockParkStatus(page)
  await page.goto('/park')
  const start = page.getByRole('button', { name: '공원 VR 시작', exact: true })
  await expect(start).toBeEnabled({ timeout: 90000 })
  await expect(page.getByText('공원을 준비하고 있어요…', { exact: true })).toBeHidden({ timeout: 90000 })
  await page.evaluate(async p => (await import(p)).install({ frameStep: .1 }), helper)
  await start.click()
  const snapshot = () => page.evaluate(async p => (await import(p)).snapshot(), helper)
  const visible = (name: string) => page.evaluate(async ({ helper, name }) => (await import(helper)).visibleXRObject(name), { helper, name })
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  expect(await visible('park-xr-balloon-entry')).toBe(false)
  const station = loadRenewalFixtureMap().data.interactions.construction.find(site => site.id === 'balloon')!
  const [x, y, z] = station.reachPosition
  server.place({ x, y, z })
  await expect.poll(() => visible('park-xr-balloon-entry')).toBe(true)
  await page.evaluate(async p => {
    const xr = await import(p)
    xr.aimCanvas('park-xr-balloon-entry', .5, .34)
    xr.buttons({ trigger: true })
  }, helper)

  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_BALLOON_START').length).toBe(1)
  const payload = server.requests.find(r => r.type === 'WORLD_BALLOON_START')!.payload
  expect(payload).toEqual({ ticketId: expect.any(String), x: expect.any(Number), y: expect.any(Number), z: expect.any(Number), capacity: 1 })
  await expect.poll(() => visible('park-xr-balloon-status')).toBe(true)
  await page.evaluate(async p => { const xr = await import(p); xr.buttons({}); xr.input(1, true) }, helper)
  const uplifting = () => server.requests.some(r => r.type === 'WORLD_BALLOON_POSE' && Number(r.payload.y) > 41
    && Math.hypot(Number(r.payload.x) - Number(payload.x), Number(r.payload.z) - Number(payload.z)) > 21)
  await expect.poll(uplifting, { timeout: 35000 }).toBe(true)
  expect(server.restRequests.filter(r => r.path === '/api/v1/world/balloon/tickets')).toHaveLength(1)
  expect(server.requests.some(r => r.type === 'WORLD_MOVE' && (r.payload.dx || r.payload.dz || r.payload.jump))).toBe(false)
  expect((await snapshot()).position[1]).toBeGreaterThan(43)

  const frame = await page.evaluate(async p => {
    const xr = await import(p)
    xr.lookAt(4, 5, 10)
    await new Promise(resolve => setTimeout(resolve, 150))
    return xr.sceneFramePNG()
  }, helper)
  await writeFile(info.outputPath('park-vr-balloon.png'), Buffer.from(frame.split(',')[1]!, 'base64'))

  await page.evaluate(async p => (await import(p)).input(0, false, 0, true), helper)
  await expect.poll(() => server.requests.some(r => r.type === 'WORLD_BALLOON_POSE' && r.payload.aboard === false), { timeout: 35000 }).toBe(true)
  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_BALLOON_END').length).toBe(1)
  await expect.poll(() => visible('park-xr-balloon-status')).toBe(false)
  await expect.poll(async () => (await snapshot()).position[1]).toBeCloseTo(y - .8 + 1.65)
  expect((await snapshot()).active).toBe(true)
  await page.evaluate(async p => (await import(p)).input(0), helper)
  await page.evaluate(async p => (await import(p)).input(1), helper)
  await expect.poll(() => server.requests.some(r => r.type === 'WORLD_MOVE' && (r.payload.dx || r.payload.dz))).toBe(true)
  expect(errors).toEqual([])
})
