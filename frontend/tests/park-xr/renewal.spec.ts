import { expect, test } from '@playwright/test'
import { parkFixture } from './fixture'
import { disabledJumpmapStatus } from '../fixtures/jumpmap'

const syntheticXR = '/tests/park-xr/syntheticXR.ts'

test('두더지와 비둘기 발판에 올라타면 서버 업데이트 사이에도 발판과 같이 움직인다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const server = await parkFixture(page)
  const course = server.renewalCourse!
  const scope = { channelId: 'channel-1', mapVersion: server.mapIdentity.mapVersion }
  const versions = { courseVersion: course.courseVersion, rulesVersion: course.rulesVersion }
  const status = disabledJumpmapStatus(scope.channelId, scope.mapVersion)
  await page.route('**/api/v1/minigames/jumpmap/status?**', route =>
    route.fulfill({ json: { ...status, ...versions, enabled: true } }))
  const now = new Date().toISOString()
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: { mode: 'NORMAL', notice: '',
    maintenanceStartedAt: null, expectedOpenAt: null, version: 1, updatedAt: now, serverTime: now } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: { serverTime: now,
    refreshAt: new Date(Date.now() + 10000).toISOString(), announcements: [] } }))

  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page).toHaveURL(/\/park$/)
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length),
    { timeout: 90000 }).toBeGreaterThan(0)
  await expect(page.getByText('공원을 준비하고 있어요…', { exact: true })).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/jumpmapProbe.ts' as string)).jumpmapProbe().state.checked)).toBe(true)
  server.emit('JUMPMAP_STARTED', { ...scope, ...versions, runId: 'moving-pads', revision: 1,
    earningsDate: status.earningsDate, todayEarned: 0, dailyCap: status.dailyCap, serverTime: Date.now() })
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/jumpmapProbe.ts' as string)).jumpmapProbe().state.run?.runId)).toBe('moving-pads')

  let version = 1000
  for (const theme of ['mole', 'pigeon'] as const) {
    const pad = course.pads.find(p => p.theme === theme)!
    const send = (height: number, movingPad?: { block: number; dipStartedAt?: number }) => {
      version++
      server.emit('WORLD_STATE', { ...scope, version, avatars: [{
        userId: '101',
        position: { x: pad.x, y: height + .8, z: pad.z, yaw: 0, lastInputSeq: 0,
          moving: false, running: false, swimming: false },
        motion: { epoch: 1, tick: version, appliedInputSeq: 0, inputAgeMs: 0, profile: 'PARK_V1',
          velocityY: movingPad ? 0 : 8, grounded: !!movingPad, inputActive: false, movingPad },
      }] })
    }
    send(pad.top, { block: pad.block })
    const probePath = '/tests/park-integration/jumpmapProbe.ts'
    await expect.poll(() => page.evaluate(async ({ block, probePath }) => {
      const { movingPadFrame } = await import(probePath)
      const frame = movingPadFrame(block)
      return frame ? Math.abs(frame.avatarY - frame.padY) : Infinity
    }, { block: pad.block, probePath }), { timeout: 15000 }).toBeLessThan(2)
    const ride = { block: pad.block, ...(theme === 'mole' ? { dipStartedAt: (Date.now() + 600) / 1000 } : {}) }
    send(pad.top, ride)
    await expect.poll(() => page.evaluate(async () => {
      const { avatars } = await import('/src/network/worldClient.ts' as string)
      return avatars.get('101')?.movingPad
    })).toEqual(ride)
    const frames = await page.evaluate(async block => {
      const { movingPadFrame } = await import('/tests/park-integration/jumpmapProbe.ts' as string)
      const frames: { padY: number; avatarY: number }[] = []
      const start = performance.now()
      do {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        const frame = movingPadFrame(block)
        if (frame) frames.push(frame)
      } while (performance.now() - start < 1500)
      return frames
    }, pad.block)
    expect(frames.length).toBeGreaterThan(3)
    const heights = frames.map(f => f.padY)
    expect(Math.max(...heights) - Math.min(...heights), theme).toBeGreaterThan(.025)
    expect(Math.max(...frames.map(f => Math.abs(f.avatarY - f.padY))), theme).toBeLessThan(.02)

    await page.screenshot({ path: info.outputPath(`jumpmap-${theme}-ride.png`) })
    send(pad.top + .8)
    await expect.poll(() => page.evaluate(async block => {
      const { movingPadFrame } = await import('/tests/park-integration/jumpmapProbe.ts' as string)
      const frame = movingPadFrame(block)
      return frame ? frame.avatarY - frame.padY : 0
    }, pad.block)).toBeGreaterThan(.3)
  }
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('220m 공원에서 안내 비석으로 돌탑 VR에 진입하고 일반 공원으로 돌아온다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`${message.location().url} ${message.text()}`.trim())
  })
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const server = await parkFixture(page, { carrySupported: true, vrMobilityAvailable: true })
  const course = server.renewalCourse!
  const scope = { channelId: 'channel-1', mapVersion: server.mapIdentity.mapVersion }
  const versions = { courseVersion: course.courseVersion, rulesVersion: course.rulesVersion }
  const status = disabledJumpmapStatus(scope.channelId, scope.mapVersion)
  await page.route('**/api/v1/minigames/jumpmap/status?**', route => route.fulfill({ json: { ...status, ...versions, enabled: true } }))
  const now = new Date().toISOString()
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: { mode: 'NORMAL', notice: '',
    maintenanceStartedAt: null, expectedOpenAt: null, version: 1, updatedAt: now, serverTime: now } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: { serverTime: now,
    refreshAt: new Date(Date.now() + 10000).toISOString(), announcements: [] } }))

  const map = page.waitForResponse(response => new URL(response.url()).pathname === '/generated/park-renewal/server-map.json')
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page).toHaveURL(/\/park$/)
  expect((await (await map).json()).data.world.half).toBe(110)
  await expect(page.getByRole('button', { name: '공원 VR 시작', exact: true })).toBeEnabled({ timeout: 90000 })
  await expect(page.getByText('공원을 준비하고 있어요…', { exact: true })).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await page.screenshot({ path: info.outputPath('park-220m-vr.png') })

  server.place({ ...course.guide, y: course.guide.y + .8 })
  const start = page.getByRole('button', { name: '돌탑 점프맵 VR 시작', exact: true })
  await expect(start).toBeEnabled()
  await page.evaluate(async helper => (await import(helper)).install(), syntheticXR)
  await start.click()
  const xr = () => page.evaluate(async helper => (await import(helper)).snapshot(), syntheticXR)
  await expect.poll(async () => (await xr()).active).toBe(true)
  expect(server.requests.some(r => r.type === 'WORLD_INTERACTION_SET' && r.payload.vrActive === true && r.payload.busy === false)).toBe(true)
  await page.evaluate(async helper => (await import(helper)).buttons({ guide: true }), syntheticXR)
  await expect.poll(async () => (await xr()).view?.lines.join(' ')).toContain('열 구간')
  await page.evaluate(async helper => {
    const xr = await import(helper)
    xr.buttons({ guide: false })
    xr.input(0, true)
  }, syntheticXR)
  await expect.poll(async () => (await xr()).view?.key).toBe('roaming')
  await page.evaluate(async helper => (await import(helper)).input(1), syntheticXR)
  await expect.poll(() => server.requests.some(request => request.type === 'WORLD_MOVE' && request.payload.dz !== 0)).toBe(true)

  const first = course.pads[0]!
  server.place({ x: first.x, y: first.top + .8, z: first.z })
  const money = { earningsDate: status.earningsDate, todayEarned: 0, dailyCap: status.dailyCap }
  const runId = 'park-220m-xr'
  server.emit('JUMPMAP_STARTED', { ...scope, ...versions, ...money, runId, revision: 1, serverTime: Date.now() })
  await expect.poll(async () => (await xr()).view?.title).toContain('/ 10구간')
  server.emit('JUMPMAP_ENDED', { ...scope, ...money, runId, revision: 2, reason: 'FINISH', gatesPassed: 10,
    maxHeight: first.top, runCoins: 0, elapsedMs: 125400, finishMs: 125400, bestFinishMs: 125400, newBest: true })
  await expect.poll(async () => (await xr()).view?.lines.join(' ')).toContain('호수섬까지 완주')
  await page.evaluate(async helper => (await import(helper)).input(0, true), syntheticXR)
  await expect.poll(async () => (await xr()).view?.key).toBe('roaming')
  const rentals = await page.evaluate(async () => (await import('/src/features/mobility/targets.ts' as string)).rentalTargets)
  for (const vehicle of ['BICYCLE', 'SCOOTER'] as const) {
    const rack = rentals.find((target: { vehicle: string }) => target.vehicle === vehicle)
    server.place(rack.reach)
    const card = `park-xr-rental-${vehicle.toLowerCase()}`
    await expect.poll(() => page.evaluate(async ({ helper, card }) =>
      (await import(helper)).visibleXRObject(card), { helper: syntheticXR, card })).toBe(true)
  }
  expect(server.requests.some(r => r.type === 'WORLD_MOBILITY_START')).toBe(false)
  await page.evaluate(async helper => (await import(helper)).input(0, false, 0, true), syntheticXR)
  await expect.poll(async () => (await xr()).ownsInput).toBe(false)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
