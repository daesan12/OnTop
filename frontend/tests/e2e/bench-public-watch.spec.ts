import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { facilityCatalog } from '../fixtures/facilityCatalog'
import { benchTable } from '../../src/features/interactions/benchSpectator'

const bench = facilityCatalog.facilities.find(d => d.kind === 'BENCH' && benchTable(d.facilityId)?.pavilionId === 'P1')!
const anchor = benchTable(bench.facilityId)!
const connection = (page: Page) => page.locator('.bench-watch-status')
const game = (page: Page) => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game)
async function loaded(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop'); await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/src/features/facilities/state.ts' as string)).useFacilityState.getState().ready)).toBe(true)
  await page.locator('canvas').focus()
}
async function sitAndWatch(page: Page) {
  expect(await page.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id, 0), bench.facilityId)).toBe(true)
  await page.getByRole('button', { name: '가까이 관전', exact: true }).click()
}
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', e => list.push(e.message)); page.on('console', m => { if (m.type() === 'error') list.push(m.text()) })
})
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0) })

for (const kind of ['OMOK', 'DICE', 'ONE_CARD', 'LIAR_BRIDGE'] as const) {
  test(`real public-ID adapter connects ${kind} from a bench without granting a seat, secret or action`, async ({ page }) => {
    const server = await fixture(page, { publicSpectator: true, manualMovement: true, position: bench.center, anchorId: anchor.id,
      ...(kind === 'DICE' ? { dice: true } : kind === 'ONE_CARD' ? { onecard: 4 as const } : kind === 'LIAR_BRIDGE' ? { bridge: 4 as const } : { omok: true }) })
    await loaded(page); await page.keyboard.press('KeyV')
    await sitAndWatch(page); await expect(connection(page)).toHaveText('공개 경기 관전 중')
    const current = await game(page); expect(current?.role).toBe('SPECTATOR')
    await expect(page.getByRole('button', { name: '기권', exact: true })).toHaveCount(0)
    if (kind === 'ONE_CARD') expect(current?.hand).toBeNull()
    if (kind === 'LIAR_BRIDGE') expect(current?.secret).toBeNull()
    const targetId = current!.gameId
    expect(server.sent.filter(m => m.type === 'GAME_WATCH').map(m => m.payload)).toEqual([{ gameId: targetId }])
    expect(server.sent.filter(m => m.type === 'TABLE_WATCH').map(m => m.payload)).toEqual([{ tableId: 'fixture-server-table' }])
    expect(await page.evaluate(async () => {
      const s = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
      const g = await import('/src/game/store.ts' as string)
      return { seat: s.tableId, granted: g.useGame.getState().permittedGameId, canPlace: g.canPlace(s.sessionId, 7, 7), canRoll: g.canPlayDice(s.sessionId) }
    })).toEqual({ seat: '', granted: '', canPlace: false, canRoll: false })
    await expect(page.getByRole('dialog', { name: '테이블 정보', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '판 자세히 보기', exact: true }).click()
    await expect(page.getByRole('button', { name: '판 자세히 보기', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).adCameraProbe().direction[1])).toBeLessThan(-.999)
    if (kind === 'OMOK') {
      const chat = page.getByRole('region', { name: '주변 채팅', exact: true })
      await expect(page.getByLabel('보유 엽전', { exact: true })).toHaveText('100냥')
      await page.getByRole('button', { name: '공원 잔액 다시 확인', exact: true }).click()
      await expect(page.locator('.park-wallet')).toHaveAttribute('aria-busy', 'false')
      await page.locator('canvas').focus(); await page.keyboard.press('Enter')
      await page.getByRole('textbox', { name: '주변 채팅 메시지', exact: true }).fill('씨.발 관전 중 대화')
      await page.getByRole('textbox', { name: '주변 채팅 메시지', exact: true }).press('Enter')
      await expect(chat.locator('.park-chat__message').last()).toContainText('** 관전 중 대화')
      expect(server.sent.filter(m => m.type === 'WORLD_CHAT_SEND').at(-1)?.payload).toEqual({ text: '** 관전 중 대화' })
      await page.locator('canvas').focus(); await page.keyboard.press('KeyZ')
      await expect(chat).toHaveAttribute('data-history', 'true')
      await page.keyboard.press('KeyZ'); await expect(chat).toHaveAttribute('data-history', 'false')
      await expect(connection(page)).toHaveText('공개 경기 관전 중')
      expect((await game(page))?.gameId).toBe(targetId)
      server.publicMoveForRefresh()
      await page.getByRole('region', { name: '오목 경기', exact: true }).getByRole('button', { name: '최신 판 확인', exact: true }).click()
      await expect.poll(async () => (await game(page))?.omok?.moveCount).toBe(1)
      await screenshot(page, 'bench-public-omok')
    }
    await page.setViewportSize({ width: 1000, height: 700 })
    const labels = { OMOK: '오목 경기', DICE: '주사위 경기', ONE_CARD: '원카드 경기', LIAR_BRIDGE: '다리 경기' }
    await expect.poll(async () => {
      const panel = await page.getByRole('region', { name: labels[kind], exact: true }).boundingBox()
      const dock = await page.getByRole('complementary', { name: '가까운 상호작용', exact: true }).boundingBox()
      return !!panel && !!dock && panel.y + panel.height <= dock.y
    }).toBe(true)
    if (kind === 'OMOK') await screenshot(page, 'bench-public-small-pc')
    await page.locator('canvas').focus(); await page.keyboard.down('KeyW')
    await expect.poll(async () => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().benchId)).toBe('')
    await expect.poll(() => server.sent.filter(m => m.type === 'GAME_UNWATCH').length).toBe(1)
    await expect.poll(() => server.sent.filter(m => m.type === 'TABLE_UNWATCH').length).toBe(1)
    await expect.poll(() => game(page)).toBeNull()
    await expect.poll(() => server.sent.some(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz))).toBe(true)
    await page.keyboard.up('KeyW')
    await expect(page.getByRole('button', { name: '1인칭 시점', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(server.sent.some(m => ['TABLE_JOIN', 'GAME_ACTION_SEND', 'GAME_RESULT_CHECK', 'GAME_FORFEIT'].includes(m.type))).toBe(false)
  })
}

test('new/null IDs unwatch before switching, ignore stale IDs and late frames, and wait for the next confirmed match', async ({ page }) => {
  const server = await fixture(page, { publicSpectator: true, manualMovement: true, position: bench.center, anchorId: anchor.id, omok: true })
  await loaded(page); await sitAndWatch(page); await expect(connection(page)).toHaveText('공개 경기 관전 중')
  const oldId = (await game(page))!.gameId
  server.publicMatch('public-next'); await expect.poll(async () => (await game(page))?.gameId).toBe('public-next')
  expect(server.sent.filter(m => ['GAME_WATCH', 'GAME_UNWATCH'].includes(m.type)).map(m => [m.type, m.payload])).toEqual([
    ['GAME_WATCH', { gameId: oldId }], ['GAME_UNWATCH', {}], ['GAME_WATCH', { gameId: 'public-next' }],
  ])
  server.stalePublicMatch(oldId); server.latePublicGame(oldId); await page.waitForTimeout(200)
  expect((await game(page))?.gameId).toBe('public-next')
  server.publicMatch(null); await expect(connection(page)).toHaveText('진행 경기 시작 대기'); expect(await game(page)).toBeNull()
  server.world(); await page.waitForTimeout(200); expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(2)
  server.publicMatch('public-third'); await expect.poll(async () => (await game(page))?.gameId).toBe('public-third')
  expect(server.sent.filter(m => m.type === 'GAME_WATCH').at(-1)?.payload).toEqual({ gameId: 'public-third' })
})

test('no confirmed ID waits without guessing; a subsequent start push begins public watching', async ({ page }) => {
  const server = await fixture(page, { publicSpectator: true, manualMovement: true, position: bench.center, anchorId: anchor.id, omok: true })
  await loaded(page); server.publicMatch(null); await sitAndWatch(page)
  await expect(connection(page)).toHaveText('진행 경기 시작 대기')
  expect(server.sent.some(m => m.type === 'GAME_WATCH')).toBe(false)
  server.publicMatch('public-confirmed-later'); await expect(connection(page)).toHaveText('공개 경기 관전 중')
  expect((await game(page))?.gameId).toBe('public-confirmed-later')
})

test('denial and later revocation clear public data and need explicit retry without a request loop', async ({ page }) => {
  const server = await fixture(page, { publicSpectator: true, manualMovement: true, position: bench.center, anchorId: anchor.id, omok: true })
  server.rejectGameWatch(true); await loaded(page); await sitAndWatch(page)
  await expect(connection(page)).toContainText('권한이 없습니다'); expect(await game(page)).toBeNull()
  server.world(); await page.waitForTimeout(200); expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(1)
  server.rejectGameWatch(false); await page.locator('.bench-spectator-help summary').click()
  await page.getByRole('button', { name: '경기 관전 다시 연결', exact: true }).click()
  await expect(connection(page)).toHaveText('공개 경기 관전 중')
  server.revokeWatch(); await expect(connection(page)).toContainText('종료됐어요'); expect(await game(page)).toBeNull()
  server.world(); await page.waitForTimeout(200); expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(2)
})

test('leaving during the initial pending watch cancels it and discards its late approval', async ({ page }) => {
  const server = await fixture(page, { publicSpectator: true, manualMovement: true, position: bench.center, anchorId: anchor.id, omok: true })
  server.holdGameWatch(true); await loaded(page); await sitAndWatch(page)
  await expect(connection(page)).toHaveText('경기 관전 연결 중…')
  await page.getByRole('button', { name: '벤치에서 일어나기', exact: true }).click()
  await expect.poll(() => server.sent.filter(m => m.type === 'GAME_UNWATCH').length).toBe(1)
  server.lateGameWatch(); await expect.poll(() => game(page)).toBeNull()
  await expect(page.getByRole('group', { name: '벤치 관전', exact: true })).toHaveCount(0)
  expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(1)
})

test('reconnect clears the bench target and never automatically reuses the old public ID', async ({ page }) => {
  const server = await fixture(page, { publicSpectator: true, manualMovement: true, position: bench.center, anchorId: anchor.id, omok: true })
  await loaded(page); await sitAndWatch(page); await expect(connection(page)).toHaveText('공개 경기 관전 중')
  const id = (await game(page))!.gameId
  server.close(1013); await expect.poll(() => server.connections).toBe(2)
  server.latePublicGame(id); await expect.poll(() => game(page)).toBeNull()
  await expect(page.getByRole('group', { name: '벤치 관전', exact: true })).toHaveCount(0)
  expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(1)
})
