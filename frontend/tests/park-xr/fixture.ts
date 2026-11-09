import type { Page } from '@playwright/test'
import { parkFixture as baseParkFixture } from '../park-integration/fixture'

export { identity } from '../park-integration/fixture'

/** Empty private HUD data for XR browser QA; no production authentication/API bypass. */
export async function parkFixture(page: Page, options?: Parameters<typeof baseParkFixture>[1]) {
  const server = await baseParkFixture(page, options)
  await page.route('**/api/v1/events/winnings/me?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/v1/notifications?*', route => route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } }))
  await page.route('**/api/v1/skins/assets', route => route.fulfill({ json: [] }))
  return server
}
