import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { facilityCatalog } from '../fixtures/facilityCatalog'
import { benchTable } from '../../src/features/interactions/benchSpectator'

// Camera buttons are gone from the HUD; V and a Ctrl tap drive the same state, read here.
const cameraState = (page: Page) => page.evaluate(async () => ({
  first: (await import('/src/world/cameraPerspective.ts' as string)).useCameraPerspective.getState().perspective === 'first-person',
  mouse: (await import('/src/world/mouseLook.ts' as string)).useMouseLook.getState().active as boolean,
}))

const bench = facilityCatalog.facilities.find(d => d.kind === 'BENCH' && benchTable(d.facilityId)?.pavilionId === 'P1')!
const anchor = benchTable(bench.facilityId)!
const connection = (page: Page) => page.locator('.bench-watch-error')
const watchStatus = (page: Page) => page.evaluate(async () => (await import('/src/features/tableLobby/state.ts' as string)).useTableLobby.getState().spectatorStatus)
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
      ...(kind === 'DICE' ? { dice: true } : kind === 'ONE_CARD' ? { onecard: 4 as const } : kind === 'LIAR_BRIDGE' ? { bridge: 4 as const } : { omok: true, spectatorEvents: true }) })
    await loaded(page); await page.keyboard.press('KeyV')
    await sitAndWatch(page); await expect.poll(() => watchStatus(page)).toBe('watching')
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
    const boardButton = page.getByRole('button', { name: kind === 'OMOK' ? '판 보기' : '판 자세히 보기', exact: true })
    await boardButton.click()
    await expect(boardButton).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).adCameraProbe().direction[1])).toBeLessThan(-.999)
    if (kind === 'OMOK') {
      // Approved OMOK spectating uses the same private match chat panel as every game.
      const chat = page.getByRole('region', { name: '경기 채팅', exact: true })
      await expect(page.getByLabel('보유 엽전', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: '공원 잔액 다시 확인', exact: true })).toHaveCount(0)
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await page.locator('canvas').focus(); await page.keyboard.press('Enter')
      const input = chat.getByRole('textbox')
      await expect(input).toBeFocused()
      await input.fill('관전 중 대화'); await input.press('Enter')
      await expect(chat.getByRole('textbox')).toHaveCount(0)
      expect(server.sent.filter(m => m.type === 'GAME_SPECTATOR_CHAT_SEND').at(-1)?.payload).toEqual({
        gameId: targetId, eventId: expect.any(String), text: '관전 중 대화',
      })
      expect(server.sent.some(m => m.type === 'WORLD_CHAT_SEND')).toBe(false)
      await page.keyboard.press('Enter'); await page.keyboard.press('Enter')
      await expect(page.getByRole('region', { name: '주변 채팅', exact: true })).toHaveCount(0)
      await expect.poll(() => watchStatus(page)).toBe('watching')
      expect((await game(page))?.gameId).toBe(targetId)
      server.publicMoveForRefresh()
      server.resendGame('SPECTATOR')
      await expect.poll(async () => (await game(page))?.omok?.moveCount).toBe(1)
      await screenshot(page, 'bench-public-omok')
    }
    await page.setViewportSize({ width: 1000, height: 700 })
    const labels = { OMOK: '오목 경기', DICE: '주사위 경기', ONE_CARD: '원카드 경기', LIAR_BRIDGE: '다리 경기' }
    if (kind === 'ONE_CARD') await screenshot(page, 'bench-onecard-small-pc')
    await expect.poll(async () => {
      const region = page.getByRole('region', { name: labels[kind], exact: true })
      // The current OneCard HUD spans the viewport; its exit controls must clear the dock.
      const panel = await (kind === 'ONE_CARD' ? region.locator('.onecard-recovery-controls') : region).boundingBox()
      if (kind === 'OMOK') return !!panel && await page.locator('.omok-spectator-toolbar').isVisible()
      const dock = await page.getByRole('complementary', { name: '가까운 상호작용', exact: true }).boundingBox()
      return !!panel && !!dock && (panel.y + panel.height <= dock.y || panel.x + panel.width <= dock.x
        || panel.x >= dock.x + dock.width || panel.y >= dock.y + dock.height)
    }).toBe(true)
    await page.getByRole('region', { name: labels[kind], exact: true }).getByRole('button', { name: '관전 종료', exact: true }).click({ trial: true })
    await expect(page.getByRole('button', { name: '벤치에서 일어나기', exact: true })).toHaveCount(0)
    if (kind === 'OMOK') await screenshot(page, 'bench-public-small-pc')
    await page.locator('canvas').focus(); await page.keyboard.down('KeyW')
    await expect.poll(async () => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().benchId)).toBe('')
    await expect.poll(() => server.sent.filter(m => m.type === 'GAME_UNWATCH').length).toBe(1)
    await expect.poll(() => server.sent.filter(m => m.type === 'TABLE_UNWATCH').length).toBe(1)
    await expect.poll(() => game(page)).toBeNull()
    await expect.poll(() => server.sent.some(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz))).toBe(true)
    await page.keyboard.up('KeyW')
    await expect.poll(async () => String((await cameraState(page)).first)).toBe('true')
    expect(server.sent.some(m => ['TABLE_JOIN', 'GAME_ACTION_SEND', 'GAME_RESULT_CHECK', 'GAME_FORFEIT'].includes(m.type))).toBe(false)
  })
}

test('new/null IDs unwatch before switching, ignore stale IDs and late frames, and wait for the next confirmed match', async ({ page }) => {
  const server = await fixture(page, { publicSpectator: true, manualMovement: true, position: bench.center, anchorId: anchor.id, omok: true })
  await loaded(page); await sitAndWatch(page); await expect.poll(() => watchStatus(page)).toBe('watching')
  const oldId = (await game(page))!.gameId
  server.publicMatch('public-next'); await expect.poll(async () => (await game(page))?.gameId).toBe('public-next')
  expect(server.sent.filter(m => ['GAME_WATCH', 'GAME_UNWATCH'].includes(m.type)).map(m => [m.type, m.payload])).toEqual([
    ['GAME_WATCH', { gameId: oldId }], ['GAME_UNWATCH', {}], ['GAME_WATCH', { gameId: 'public-next' }],
  ])
  server.stalePublicMatch(oldId); server.latePublicGame(oldId); await page.waitForTimeout(200)
  expect((await game(page))?.gameId).toBe('public-next')
  server.publicMatch(null); await expect.poll(() => watchStatus(page)).toBe('waiting'); expect(await game(page)).toBeNull()
  server.world(); await page.waitForTimeout(200); expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(2)
  server.publicMatch('public-third'); await expect.poll(async () => (await game(page))?.gameId).toBe('public-third')
  expect(server.sent.filter(m => m.type === 'GAME_WATCH').at(-1)?.payload).toEqual({ gameId: 'public-third' })
})

test('no confirmed ID blocks viewing; a subsequent start enables explicit Tab watching', async ({ page }) => {
  const server = await fixture(page, { publicSpectator: true, manualMovement: true, position: bench.center, anchorId: anchor.id, omok: true })
  await loaded(page); server.publicMatch(null)
  expect(await page.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id, 0), bench.facilityId)).toBe(true)
  await expect(page.getByRole('button', { name: '가까이 관전', exact: true })).toBeDisabled()
  await page.locator('canvas').focus(); await page.keyboard.press('Tab')
  expect(await game(page)).toBeNull()
  expect(server.sent.some(m => m.type === 'GAME_WATCH')).toBe(false)
  server.publicMatch('public-confirmed-later')
  await expect(page.getByRole('button', { name: '가까이 관전', exact: true })).toBeEnabled()
  expect(await game(page)).toBeNull()
  await page.keyboard.press('Tab')
  await expect.poll(() => watchStatus(page)).toBe('watching')
  expect((await game(page))?.gameId).toBe('public-confirmed-later')
})

test('denial and later revocation clear public data and need explicit retry without a request loop', async ({ page }) => {
  const server = await fixture(page, { publicSpectator: true, manualMovement: true, position: bench.center, anchorId: anchor.id, omok: true })
  server.rejectGameWatch(true); await loaded(page); await sitAndWatch(page)
  await expect(connection(page)).toContainText('권한이 없습니다'); expect(await game(page)).toBeNull()
  server.world(); await page.waitForTimeout(200); expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(1)
  server.rejectGameWatch(false)
  await page.getByRole('button', { name: '경기 관전 다시 연결', exact: true }).click()
  await expect.poll(() => watchStatus(page)).toBe('watching')
  server.revokeWatch(); await expect(connection(page)).toContainText('종료됐어요'); expect(await game(page)).toBeNull()
  server.world(); await page.waitForTimeout(200); expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(2)
})

test('leaving during the initial pending watch cancels it and discards its late approval', async ({ page }) => {
  const server = await fixture(page, { publicSpectator: true, manualMovement: true, position: bench.center, anchorId: anchor.id, omok: true })
  server.holdGameWatch(true); await loaded(page); await sitAndWatch(page)
  await expect.poll(() => watchStatus(page)).toBe('starting')
  await page.locator('canvas').focus(); await page.keyboard.press('KeyW')
  await expect.poll(() => server.sent.filter(m => m.type === 'GAME_UNWATCH').length).toBe(1)
  server.lateGameWatch(); await expect.poll(() => game(page)).toBeNull()
  await expect(page.getByRole('group', { name: '벤치 관전', exact: true })).toHaveCount(0)
  expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(1)
})

test('reconnect clears the bench target and never automatically reuses the old public ID', async ({ page }) => {
  const server = await fixture(page, { publicSpectator: true, manualMovement: true, position: bench.center, anchorId: anchor.id, omok: true })
  await loaded(page); await sitAndWatch(page); await expect.poll(() => watchStatus(page)).toBe('watching')
  const id = (await game(page))!.gameId
  server.close(1013); await expect.poll(() => server.connections).toBe(2)
  server.latePublicGame(id); await expect.poll(() => game(page)).toBeNull()
  await expect(page.getByRole('group', { name: '벤치 관전', exact: true })).toHaveCount(0)
  expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(1)
})
