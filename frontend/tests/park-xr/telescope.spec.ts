import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { loadRenewalFixtureMap, parkFixture } from './fixture'

const helper = '/tests/park-xr/syntheticXR.ts'

test('220m 공원 VR 망원경에서 밤에만 별자리를 표시하고 B로 산책을 이어간다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const server = await parkFixture(page, { carrySupported: true, environmentEpochMs: Date.now() - 450000 })
  const now = new Date().toISOString()
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: { mode: 'NORMAL', notice: '',
    maintenanceStartedAt: null, expectedOpenAt: null, version: 1, updatedAt: now, serverTime: now } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: { announcements: [], serverTime: now,
    refreshAt: new Date(Date.now() + 60000).toISOString() } }))
  await page.goto('/park')
  const start = page.getByRole('button', { name: '공원 VR 시작', exact: true })
  await expect(start).toBeEnabled({ timeout: 90000 })
  await expect(page.getByText('공원을 준비하고 있어요…', { exact: true })).toBeHidden({ timeout: 90000 })
  await page.evaluate(async p => (await import(p)).install(), helper)
  await start.click()
  const visible = (name: string) => page.evaluate(async ({ helper, name }) => (await import(helper)).visibleXRObject(name), { helper, name })
  const snapshot = () => page.evaluate(async p => (await import(p)).snapshot(), helper)
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  expect(await visible('park-xr-telescope-entry')).toBe(false)

  const telescope = loadRenewalFixtureMap().data.interactions.telescopes[0]!
  server.place(telescope.use)
  await expect.poll(() => visible('park-xr-telescope-entry')).toBe(true)
  await page.evaluate(async p => (await import(p)).aimCanvas('park-xr-telescope-entry', .5, .5), helper)
  await page.evaluate(async p => (await import(p)).buttons({ trigger: true }), helper)
  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_FACILITY_USE').map(r => r.payload.facilityId)).toEqual([telescope.id])
  await expect.poll(() => visible('park-xr-telescope-view'), { timeout: 45000 }).toBe(true)

  const requestsBeforeAim = server.requests.length
  const pitch = await page.evaluate(async p => {
    const xr = await import(p)
    const { telescopeView } = await import('/src/features/telescopeView.ts' as string)
    xr.buttons({})
    xr.input(1)
    xr.tiltRightStick(.8)
    const deadline = performance.now() + 12000
    while (telescopeView.pitch > -.33 && performance.now() < deadline)
      await new Promise(resolve => requestAnimationFrame(resolve))
    xr.input(0)
    xr.tiltRightStick(0)
    return telescopeView.pitch
  }, helper)
  expect(pitch).toBeLessThanOrEqual(-.33)
  expect(pitch).toBeGreaterThan(-.39)
  await expect.poll(() => server.requests.some(r => r.type === 'WORLD_FACILITY_AIM' && Number(r.payload.pitch) < -.31)).toBe(true)
  expect(server.requests.slice(requestsBeforeAim).some(r => r.type === 'WORLD_MOVE' && (r.payload.dx || r.payload.dz))).toBe(false)
  const frame = await page.evaluate(async p => (await import(p)).sceneFramePNG(), helper)
  await writeFile(info.outputPath('park-vr-telescope.png'), Buffer.from(frame.split(',')[1]!, 'base64'))

  await page.evaluate(async p => {
    const xr = await import(p)
    const { telescopeView } = await import('/src/features/telescopeView.ts' as string)
    xr.watchTelescopeSky()
    // Center Cassiopeia in the lens, including the label under the stars.
    Object.assign(telescopeView, { yaw: Math.PI / 2 + 1.18, pitch: .55 })
  }, helper)
  const sky = () => page.evaluate(async p => (await import(p)).readTelescopeSky(), helper)
  await expect.poll(sky).toMatchObject({ night: 0, lens: { index: -1 }, park: { index: -1 } })
  await page.evaluate(async () => {
    const { environmentConfig, environmentFrame } = await import('/src/world/environmentState.ts' as string)
    environmentConfig.epochMs = environmentFrame.serverTime - .875 * environmentConfig.dayDurationMs
  })
  await expect.poll(async () => (await sky())?.lens.index).toBe(1)
  await expect.poll(async () => (await sky())?.lens.time ?? 0, { timeout: 10000 }).toBeGreaterThanOrEqual(2.35)
  expect((await sky())?.park.index).toBe(-1)
  const nightFrame = await page.evaluate(async p => (await import(p)).sceneFramePNG(), helper)
  await writeFile(info.outputPath('park-vr-telescope-constellation.png'), Buffer.from(nightFrame.split(',')[1]!, 'base64'))

  const summer = await page.evaluate(async () => {
    const { environmentConfig, environmentFrame } = await import('/src/world/environmentState.ts' as string)
    const { telescopeView } = await import('/src/features/telescopeView.ts' as string)
    const { constellations, selectConstellations } = await import('/src/world/parkConstellations.ts' as string)
    const july = (Date.UTC(2026, 6, 1) - Date.UTC(2026, 0, 1)) / 86_400_000
    const selection = selectConstellations(july)
    const cygnus = constellations.findIndex((pattern: { name: string }) => pattern.name === '백조자리')
    const aim = (index: number) => Object.assign(telescopeView, {
      yaw: Math.PI / 2 - constellations[index].azimuth, pitch: constellations[index].elevation,
    })
    environmentConfig.epochMs = environmentFrame.serverTime - (july + .875) * environmentConfig.dayDurationMs
    aim(selection.hidden)
    return cygnus
  })
  await expect.poll(sky).toMatchObject({ lens: { index: -1, time: 0 }, park: { index: -1 } })
  await page.evaluate(async index => {
    const { constellations } = await import('/src/world/parkConstellations.ts' as string)
    const { telescopeView } = await import('/src/features/telescopeView.ts' as string)
    Object.assign(telescopeView, { yaw: Math.PI / 2 - constellations[index].azimuth, pitch: constellations[index].elevation })
  }, summer)
  await expect.poll(sky).toMatchObject({ lens: { index: summer }, park: { index: -1 } })
  await expect.poll(async () => (await sky())?.lens.time ?? 0, { timeout: 10000 }).toBeGreaterThanOrEqual(2.35)
  const summerFrame = await page.evaluate(async p => (await import(p)).sceneFramePNG(), helper)
  await writeFile(info.outputPath('park-vr-telescope-summer.png'), Buffer.from(summerFrame.split(',')[1]!, 'base64'))

  await page.evaluate(async () => {
    const { telescopeView } = await import('/src/features/telescopeView.ts' as string)
    telescopeView.pitch = 0
  })
  await expect.poll(sky).toMatchObject({ lens: { index: -1, time: 0 }, park: { index: -1 } })

  await page.evaluate(async p => (await import(p)).input(0, false, 0, true), helper)
  await expect.poll(() => visible('park-xr-telescope-view')).toBe(false)
  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_FACILITY_RELEASE').length).toBe(1)
  await expect.poll(async () => (await snapshot()).pose.x).toBeCloseTo(telescope.exit.x)
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  await page.evaluate(async p => (await import(p)).input(1), helper)
  await expect.poll(() => server.requests.some(r => r.type === 'WORLD_MOVE' && (r.payload.dz || r.payload.dx))).toBe(true)
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  expect(errors).toEqual([])
})
