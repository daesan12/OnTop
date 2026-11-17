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
  ), { timeout: 90_000 }).toEqual({ fortune: true, gateRental: true, restRental: false })
})
