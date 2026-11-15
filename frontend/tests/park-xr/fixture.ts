import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { identity, parkFixture as baseParkFixture } from '../park-integration/fixture'

export { identity } from '../park-integration/fixture'

type FixtureMap = NonNullable<Parameters<typeof baseParkFixture>[2]>
type RenewalArtifact = NonNullable<typeof import('../../src/park/renewalMap').renewalMap>
function loadRenewalFixtureMap() {
  const directory = new URL('../../generated/park-renewal/', import.meta.url)
  const { mapId, schemaVersion, mapVersion, data } = JSON.parse(readFileSync(new URL('server-map.json', directory), 'utf8')) as RenewalArtifact
  const { bindings } = JSON.parse(readFileSync(new URL('park-bindings.json', directory), 'utf8')) as Pick<FixtureMap, 'bindings'>
  return { identity: { mapId, schemaVersion, mapVersion }, data, bindings } satisfies FixtureMap
}

/** Empty private HUD data for XR browser QA; no production authentication/API bypass. */
export async function parkFixture(page: Page, options?: Parameters<typeof baseParkFixture>[1]) {
  const map = process.env.PARK_XR_MAP === 'renewal' ? loadRenewalFixtureMap() : undefined
  const server = await baseParkFixture(page, options, map)
  await page.route('**/api/v1/events/winnings/me?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/v1/notifications?*', route => route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } }))
  await page.route('**/api/v1/skins/assets', route => route.fulfill({ json: [] }))
  await page.route('**/api/v1/entry-news', route => route.fulfill({ json: { serverTime: new Date().toISOString(), pages: [] } }))
  await page.route('**/api/v1/ai/features', route => route.fulfill({ json: { companions: false, jokeContest: false } }))
  await page.route('**/api/v1/gacha', route => route.fulfill({ json: {
    enabled: false, ticketPrice: 100, products: [],
    machine: { roundId: '1', version: 1, remaining: 30, refillEndsAt: null,
      prizes: [1, 2, 4, 8, 15].map((count, index) => ({ grade: index + 1, initial: count, remaining: count, value: 0 })) },
    inventory: { tickets: 0, balance: 100, availableBalance: 100,
      boxes: [1, 2, 3, 4].map(grade => ({ grade, quantity: 0 })) },
  } }))
  return { ...server, mapIdentity: map?.identity ?? identity, renewalCourse: map?.data.jumpCourse }
}
