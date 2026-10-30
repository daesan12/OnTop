import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot, tableId } from './contractFixture'
import { TABLES } from '../../src/config'
import { PARK_LAYOUT } from '../../src/map/park'
import { PARK_MAP_VERSION } from '../../src/map/park/generated/mapVersion'
import type { ChairCount } from '../../src/network/protocol'

const anchors = () => test.info().project.metadata.generatedPark ? PARK_LAYOUT.DRAFT_TABLES : TABLES
const anchor = { get id() { return anchors().find(table => table.pavilionId === 'P0')!.id },
  get position() { return anchors().find(table => table.pavilionId === 'P0')!.position } }
const chair = (chairCount: ChairCount) => ({ tableId, anchorId: anchor.id, chairCount })
const position = () => ({ x: anchor.position[0], y: anchor.position[1] + .8, z: anchor.position[2] + 5, yaw: Math.PI })
const probe = (page: Page) => page.evaluate(async id => (await import('/tests/e2e/sceneProbe.ts' as string)).pavilionChairProbe(id), anchor.id)
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', error => list.push(error.message))
  page.on('console', message => { if (message.type() === 'error') list.push(message.text()) })
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
async function loaded(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면', { exact: true })).toBeVisible({ timeout: 90000 })
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => {
    const state = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    return state.status === 'connected' && state.mapCompatible && state.tables.length > 0
  })).toBe(true)
  if (test.info().project.metadata.generatedPark) {
    await expect.poll(() => page.evaluate(async () => (await import('/src/park/mapSelection.ts' as string)).GENERATED_PARK_ENABLED)).toBe(true)
    expect(await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().mapVersion)).toBe(PARK_MAP_VERSION)
    expect((await probe(page)).position).toEqual([...anchor.position])
  }
}
async function count(page: Page, expected: ChairCount) {
  await expect.poll(async () => (await probe(page)).chairCount).toBe(expected)
}
function noPrivateRequests(sent: { type: string }[]) {
  expect(sent.some(message => ['TABLE_JOIN', 'TABLE_WATCH', 'GAME_WATCH', 'TABLE_START'].includes(message.type))).toBe(false)
}

test('full public chair snapshots drive real 2→3→4→2 meshes without HTTP polling, joining or watching', async ({ page }) => {
  const server = await fixture(page, { anchorId: anchor.id, position: position(), manualMovement: true, worldTables: [chair(2)] })
  let reads = 0
  await page.route(/\/api\/v1\/tables\?/, route => { reads++; return route.fulfill({ json: { tables: [{
    tableId, capacity: 4, occupiedSeats: 1, availableSeats: 3, joinable: true, gameCode: 'ONE_CARD',
    betAmountPerPlayer: 7, status: 'WAITING', startMode: 'MANUAL', selectedPlayers: 4, chairCount: 4,
  }] } }) })
  await loaded(page); await count(page, 2)
  const first = await probe(page)
  expect(first.counts.length).toBeGreaterThan(0)
  const totals: number[] = [first.counts.reduce((sum: number, parts: number) => sum + parts, 0)]
  const entryReads = reads
  for (const approved of [3, 4, 2] as const) {
    server.publicTables([chair(approved)])
    await count(page, approved)
    const current = await probe(page)
    totals.push(current.counts.reduce((sum: number, parts: number) => sum + parts, 0))
    if (approved === 2) expect(current.counts).toEqual(first.counts)
    await screenshot(page, `public-chairs-live-${approved}`)
  }
  expect(totals[1]).toBeGreaterThan(totals[0]!)
  expect(totals[2]! - totals[1]!).toBe(totals[1]! - totals[0]!)
  expect(reads).toBe(entryReads)
  noPrivateRequests(server.sent)
  expect(await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().tableId)).toBe('')
})

test('chair updates ignore stale/foreign frames, require the explicit binding and replace removed tables', async ({ page }) => {
  const server = await fixture(page, { anchorId: anchor.id, position: position(), manualMovement: true, worldTables: [chair(4)] })
  await loaded(page); await count(page, 4)
  server.worldSnapshot({ version: 0, tables: [chair(2)] })
  server.worldSnapshot({ channelId: 'other-channel', tables: [chair(2)] })
  await page.waitForTimeout(150); await count(page, 4)
  const wrongAnchor = anchors().find(table => table.id !== anchor.id)!.id
  server.publicTables([{ ...chair(4), anchorId: wrongAnchor }]); await count(page, 2)
  server.publicTables([{ ...chair(4), tableId: 'unbound-server-id' }]); await count(page, 2)
  server.publicTables([chair(3)]); await count(page, 3)
  server.publicTables([]); await count(page, 2)
  expect(await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().publicTables)).toEqual({})
  noPrivateRequests(server.sent)
})

test('legacy HTTP chairCount is a fallback until a public snapshot arrives, with no invented seat subscription', async ({ page }) => {
  const server = await fixture(page, { anchorId: anchor.id, position: position(), manualMovement: true })
  await page.route(/\/api\/v1\/tables\?/, route => route.fulfill({ json: { tables: [{
    tableId, capacity: 4, occupiedSeats: 1, availableSeats: 3, joinable: true,
    gameCode: null, status: 'WAITING', chairCount: 4,
  }] } }))
  await loaded(page); await count(page, 4)
  server.publicTables([chair(2)]); await count(page, 2)
  server.publicTables(undefined); await count(page, 4)
  noPrivateRequests(server.sent)
})

test('a fresh/reconnected observer receives current chairs and mismatched maps cannot keep the live projection', async ({ page }) => {
  const server = await fixture(page, { anchorId: anchor.id, position: position(), manualMovement: true, worldTables: [chair(3)] })
  await loaded(page); await count(page, 3)
  server.close(1013)
  await expect.poll(() => server.connections).toBe(2)
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().mapCompatible)).toBe(true)
  await count(page, 3)
  // Keep subsequent in-flight movement replies on the mismatched server map too.
  server.worldMapVersion('another-map')
  await count(page, 2)
  expect(await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().publicTables)).toBeNull()
  server.worldMapVersion(undefined)
  if (test.info().project.metadata.generatedPark) {
    // Generated maps latch admission failure; a later good frame cannot bypass confirmation.
    await count(page, 2)
    await page.getByRole('button', { name: '다시 연결', exact: true }).click()
    await expect.poll(() => server.connections).toBe(3)
  }
  await count(page, 3)
  noPrivateRequests(server.sent)
})

test('all 18 generated-map bindings update independently and a full empty snapshot resets every table', async ({ page }) => {
  test.skip(!test.info().project.metadata.generatedPark, 'Only the generated map has all 18 table anchors')
  const all = anchors(), bindings = all.map((table, index) => ({ channelId: 'fixture-channel', tableId: `chair-wire-${index}`, anchorId: table.id }))
  const tables = bindings.map((binding, index) => ({ tableId: binding.tableId, anchorId: binding.anchorId, chairCount: (2 + index % 3) as ChairCount }))
  const server = await fixture(page, { anchorId: anchor.id, position: position(), manualMovement: true, worldTables: tables })
  await page.route('**/park-bindings.generated.frontend-test.json', route => route.fulfill({ json: { bindings } }))
  await page.route(/\/api\/v1\/tables\?/, route => route.fulfill({ json: { tables: tables.map(table => ({
    ...table, capacity: 4, occupiedSeats: 0, availableSeats: 4, joinable: true, gameCode: null, status: 'WAITING',
  })) } }))
  await loaded(page)
  const counts = () => page.evaluate(async ids => {
    const { pavilionChairProbe } = await import('/tests/e2e/sceneProbe.ts' as string)
    return ids.map((id: string) => pavilionChairProbe(id).chairCount)
  }, all.map(table => table.id))
  await expect.poll(counts).toEqual(tables.map(table => table.chairCount))
  server.publicTables(tables.map(table => ({ ...table, chairCount: table.chairCount === 4 ? 2 : 4 })))
  await expect.poll(counts).toEqual(tables.map(table => table.chairCount === 4 ? 2 : 4))
  server.publicTables([])
  await expect.poll(counts).toEqual(all.map(() => 2))
  noPrivateRequests(server.sent)
})

test('GAME bubbles coexist with public chairs, outlive chat and clear only the ended participant', async ({ page }) => {
  const server = await fixture(page, { players: 3, anchorId: anchor.id, manualMovement: true, worldTables: [chair(3)],
    position: position() })
  await loaded(page); await count(page, 3)
  server.remotePose({ x: anchor.position[0] - 2, y: anchor.position[1] + .8, z: anchor.position[2] + 3, yaw: 0 })
  const other = page.locator('.avatar-overhead[data-player-id="102"]')
  await expect(other.locator('.avatar-activity')).toHaveCount(0)
  server.activity('102', 'GAME')
  await expect(other.locator('.avatar-activity')).toHaveText('게임 중')
  await expect(other.locator('.avatar-activity')).toBeVisible()
  server.chatFrom('102', '경기 끝나면 함께 걸어요')
  await expect(other.getByText('경기 끝나면 함께 걸어요', { exact: true })).toBeVisible()
  await expect(other.getByText('경기 끝나면 함께 걸어요', { exact: true })).toHaveCount(0, { timeout: 12000 })
  await expect(other.locator('.avatar-activity')).toHaveText('게임 중')
  await screenshot(page, 'public-chairs-game-activity')
  server.activity('103', 'GAME'); server.activity('102', null)
  await expect(other.locator('.avatar-activity')).toHaveCount(0)
  expect(await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().activities)).toEqual({ '103': 'GAME' })
  await count(page, 3)
  server.worldSnapshot({ version: 0, tables: [chair(4)] })
  await count(page, 3); await expect(other.locator('.avatar-activity')).toHaveCount(0)
  noPrivateRequests(server.sent)
})
