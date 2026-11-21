import { expect, test } from '@playwright/test'
import { loadRenewalFixtureMap, parkFixture } from '../park-xr/fixture'

test('정문 첫 화면에 운세방과 대여 거치대가 함께 보인다 @renewal-entry', async ({ page }) => {
  test.skip(process.env.PARK_INTEGRATION_MAP !== 'renewal', '리뉴얼 공원 정문에서 검증')
  await parkFixture(page, undefined, loadRenewalFixtureMap())
  const now = new Date().toISOString()
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
    mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
    version: 1, updatedAt: now, serverTime: now,
  } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: {
    serverTime: now, refreshAt: new Date(Date.now() + 600_000).toISOString(), announcements: [],
  } }))

  await page.route('**/src/world/WorldCanvas.tsx*', async route => {
    const response = await route.fetch()
    const source = await response.text()
    const draw = 'gl.render(scene, camera);'
    expect(source).toContain(draw)
    // Capture the scene at the draw call, before later facilities can mount.
    const sampleFirstDraw = `
      if (!window.parkFirstDrawFacilities) {
        const drawn = new Set();
        scene.traverseVisible(object => {
          if (object.children.length) drawn.add(object.name);
        });
        window.parkFirstDrawFacilities = {
          fortune: drawn.has('facility-fortune'),
          gateRental: drawn.has('paired-rental-mobility-entry'),
          restRental: drawn.has('paired-rental-mobility-rest'),
        };
      }
    `
    await route.fulfill({ response, body: source.replace(draw, sampleFirstDraw + draw) })
  })

  await page.goto('/park', { waitUntil: 'domcontentloaded' })
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { parkFirstDrawFacilities?: unknown }).parkFirstDrawFacilities,
  ), { timeout: 90_000 }).toEqual({ fortune: true, gateRental: true, restRental: true })
})

test('주민 상태가 계속 도착해도 첫 진입과 새로고침 후 내 이동이 시작된다 @renewal-entry', async ({ page }) => {
  test.skip(process.env.PARK_INTEGRATION_MAP !== 'renewal', '리뉴얼 공원 정문에서 검증')
  const map = loadRenewalFixtureMap()
  const server = await parkFixture(page, { clientPositions: true }, map)
  const now = new Date().toISOString()
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
    mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
    version: 1, updatedAt: now, serverTime: now,
  } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: {
    serverTime: now, refreshAt: new Date(Date.now() + 600_000).toISOString(), announcements: [],
  } }))
  const [x, y, z] = map.data.physics.spawn.position
  let version = 0, heartbeat: ReturnType<typeof setInterval> | undefined
  const actors = () => server.emit('WORLD_AI_COMPANIONS', {
    channelId: 'channel-1', version: ++version,
    actors: [{ id: 'entry-child', channelId: 'channel-1', name: '정문 주민', role: 'VISITOR',
      persona: 'CHILD', x: x + 4, y, z: z - 8, yaw: 0, moving: false, seated: false }],
  })
  server.interceptRequest(request => {
    if (request.type === 'CHANNEL_JOIN') {
      clearInterval(heartbeat)
      heartbeat = setInterval(actors, 100)
    }
    return false
  })
  try {
    await page.goto('/park')
    for (const reload of [false, true]) {
      if (reload) await page.reload()
      await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length),
        { timeout: 30_000 }).toBeGreaterThan(0)
      await expect(page.getByText('공원을 준비하고 있어요…', { exact: true })).toBeHidden()
      const before = server.requests.filter(request => request.type === 'WORLD_POSITION').length
      await page.locator('canvas').first().focus()
      await page.keyboard.down('w')
      await page.waitForTimeout(400)
      await page.keyboard.up('w')
      await expect.poll(() => server.requests.filter(request => request.type === 'WORLD_POSITION').length)
        .toBeGreaterThan(before)
    }
  } finally {
    clearInterval(heartbeat)
    await page.close()
  }
})
