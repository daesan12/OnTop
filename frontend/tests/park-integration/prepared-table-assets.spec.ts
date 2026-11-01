import { expect, test } from '@playwright/test'
import { fixture, screenshot, tableId } from '../e2e/contractFixture'
const assets = { OMOK: 'omok-board-table-1', ONE_CARD: 'onecard-table', DICE_LEDGER: 'ledger-table-table-1' } as const
for (const game of Object.keys(assets) as (keyof typeof assets)[]) test(`${game}: 비착석자에게 준비 에셋을 즉시 공개하고 변경·해제를 반영한다`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
  const server = await fixture(page, { generatedPark: true, manualLobby: true, tabletServer: true,
    ownUserId: '505', manualMovement: true, worldTables: [{ tableId, anchorId: 'table-1', chairCount: 2, gameCode: null }] })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  const visible = (name: string) => page.evaluate(async name => (await import('/tests/park-integration/probe.ts' as string)).preparedAssetVisible(name), name)
  expect(await visible(assets[game])).toBe(false)
  server.publicTables([{ tableId, anchorId: 'table-1', chairCount: 2, gameCode: game }])
  await expect.poll(() => visible(assets[game]), { timeout: 15000 }).toBe(true)
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).parkVisible())).toBe(true)
  for (const [code, name] of Object.entries(assets)) if (code !== game) expect(await visible(name)).toBe(false)
  await screenshot(page, `prepared-table-${game}`)
  await page.reload()
  await expect.poll(() => visible(assets[game]), { timeout: 90000 }).toBe(true)
  server.publicTables([{ tableId, anchorId: 'table-1', chairCount: 2, gameCode: null }])
  await expect.poll(() => visible(assets[game])).toBe(false)
  expect(server.sent.filter(m => ['TABLE_JOIN', 'TABLE_WATCH', 'GAME_WATCH', 'GAME_ACTION_SEND'].includes(m.type))).toHaveLength(0)
  expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
