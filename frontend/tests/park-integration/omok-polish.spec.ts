import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot, tableId } from '../e2e/contractFixture'
import { generatedFacilityCatalog } from './fixture'
import { BENCH_PAVILIONS } from '../../src/config'
import { PARK_LAYOUT } from '../../src/map/park'

const failures = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []; failures.set(page, errors)
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
})
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
async function load(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
}
for (const own of ['101', '102'] as const) test(`${own} 좌석의 흑돌·두 면 좌표·분리 HUD·중앙 기권 확인`, async ({ page }) => {
  const server = await fixture(page, { generatedPark: true, omok: true, ownUserId: own, forfeit: true,
    manualLobby: true, tabletServer: true })
  await load(page)
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  server.host(own)
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await tablet.getByLabel('1인 참가비').fill('1')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox', { name: '참가 금액을 확인했어요' }).check()
  await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true)
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  server.omokColors(own)
  await expect(page.getByLabel('내 돌', { exact: true })).toContainText('흑돌')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).omokCameraProbe().ready)).toBe(true)
  const probe: ReturnType<typeof import('./omokPolishProbe').omokPolishProbe> = await page.evaluate(async () => (await import('/tests/park-integration/omokPolishProbe.ts' as string)).omokPolishProbe())
  expect(probe.edges.filter(n => n > 0)).toHaveLength(2)
  expect(probe.edges[0]).toBeGreaterThan(0); expect(probe.edges[2]).toBeGreaterThan(0)
  // 양쪽 좌석 모두 A1은 좌상단, O1은 우상단, A15는 좌하단이다.
  expect(probe.corners[0]!.x).toBeLessThan(probe.corners[1]!.x)
  expect(probe.corners[0]!.y).toBeLessThan(probe.corners[2]!.y)
  expect(probe.boardColor).toBe('ad7848')
  expect(probe.supplies.find(s => s.color === '101717')!.screenY).toBeLessThan(probe.supplies.find(s => s.color === 'f3eee2')!.screenY)
  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    const mine = page.getByLabel('내 돌', { exact: true }), clock = page.getByLabel('남은 착수 시간', { exact: true })
    await expect(mine).toBeInViewport(); await expect(clock).toBeInViewport()
    const a = (await mine.boundingBox())!, b = (await clock.boundingBox())!
    expect(b.x).toBeGreaterThan(a.x + a.width + 2)
    await screenshot(page, `omok-polish-${own}-${size.width}`)
    await page.getByRole('button', { name: '기권', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '기권 확인', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: '계속 플레이', exact: true })).toBeFocused()
    await dialog.getByRole('button', { name: '계속 플레이', exact: true }).press('Tab')
    await expect(dialog.getByRole('button', { name: '기권 취소', exact: true })).toBeFocused()
    await dialog.getByRole('button', { name: '기권 취소', exact: true }).press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: '계속 플레이', exact: true })).toBeFocused()
    await expect(dialog).not.toContainText('서버')
    await page.mouse.click(5, 5)
    expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND')).toHaveLength(0)
    await expect(async () => {
      const box = (await dialog.boundingBox())!
      expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThan(3)
      expect(Math.abs(box.y + box.height / 2 - size.height / 2)).toBeLessThan(3)
    }).toPass()
    await screenshot(page, `omok-polish-confirm-${size.width}`, 'disabled')
    await dialog.getByRole('button', { name: '계속 플레이', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(server.sent.filter(m => m.type === 'GAME_FORFEIT')).toHaveLength(0)
  }
  await page.getByRole('button', { name: '기권', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '기권 확인', exact: true })).toHaveCount(0)
  server.omokColors(own === '101' ? '102' : '101')
  await expect(page.getByLabel('내 돌', { exact: true })).toContainText('백돌')
  const white: ReturnType<typeof import('./omokPolishProbe').omokPolishProbe> = await page.evaluate(async () => (await import('/tests/park-integration/omokPolishProbe.ts' as string)).omokPolishProbe())
  expect(white.supplies.find(s => s.color === 'f3eee2')!.screenY).toBeLessThan(white.supplies.find(s => s.color === '101717')!.screenY)
  await page.getByRole('button', { name: '게임 설명 · F1', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '게임 설명서', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '게임 설명서', exact: true })).toBeHidden()
  await page.setViewportSize({ width: 1920, height: 1080 })
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).omokCameraProbe().ready)).toBe(true)
  server.turnTo(own)
  const origin = await page.evaluate(async () => (await import('/tests/park-integration/omokPolishProbe.ts' as string)).omokPolishProbe())
  await page.mouse.click(origin.corners[0]!.x, origin.corners[0]!.y)
  await expect.poll(() => server.sent.filter(m => m.type === 'GAME_ACTION_SEND').length).toBe(1)
  expect(server.sent.find(m => m.type === 'GAME_ACTION_SEND')!.payload.input).toEqual({ x: 0, y: 0 })
  await expect(page.locator('.omok-last-move-text')).toContainText('A1 (1행 1열)')
  await screenshot(page, `omok-origin-${own}`)
})

test('대기 중 관전 입력은 없고 진행 경기만 팝업 없이 관전한 뒤 종료 즉시 복귀한다', async ({ page }) => {
  const server = await fixture(page, { generatedPark: true, omok: true, publicSpectator: true, ownUserId: '505' })
  let active = false
  await page.route('**/api/v1/tables?**', route => route.fulfill({ json: { tables: [{ tableId, capacity: 2,
    minimumPlayers: 2, occupiedSeats: 2, availableSeats: 0, readyCount: 2, allReady: true,
    status: active ? 'PLAYING' : 'WAITING', joinable: false, gameCode: 'OMOK', targetScore: null,
    betAmountPerPlayer: 1, gameId: active ? 'fixture-game' : null }] } }))
  await load(page)
  await expect(page.getByRole('button', { name: /E 테이블/ })).toHaveCount(0)
  await page.locator('canvas').focus(); await page.keyboard.press('e')
  expect(server.sent.filter(m => ['TABLE_JOIN', 'TABLE_WATCH', 'GAME_WATCH'].includes(m.type))).toHaveLength(0)
  active = true; await page.reload()
  await expect(page.getByRole('button', { name: 'E 테이블 경기 보기', exact: true })).toBeVisible({ timeout: 90000 })
  await page.getByRole('button', { name: 'E 테이블 경기 보기', exact: true }).click()
  await expect(page.getByLabel('오목 관전 경기 정보', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '테이블 정보', exact: true })).toHaveCount(0)
  server.finishGame()
  await expect(page.getByLabel('오목 관전 경기 정보', { exact: true })).toHaveCount(0)
  await expect.poll(() => server.sent.filter(m => m.type === 'GAME_UNWATCH').length).toBe(1)
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().watchedTableId)).toBe('')
  server.publicMatch('next-public-game')
  await page.waitForTimeout(250)
  expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(1)
  await expect(page.getByRole('dialog', { name: '테이블 정보', exact: true })).toHaveCount(0)
})

test('원카드 관전도 초록 팝업을 열지 않고 공개 경기 종료와 함께 복귀한다', async ({ page }) => {
  const server = await fixture(page, { generatedPark: true, onecard: 2, publicSpectator: true, ownUserId: '505' })
  await load(page)
  await page.getByRole('button', { name: 'E 테이블 경기 보기', exact: true }).click()
  await expect.poll(() => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game?.role)).toBe('SPECTATOR')
  await expect(page.getByRole('dialog', { name: '테이블 정보', exact: true })).toHaveCount(0)
  server.publicMatch(null)
  await expect.poll(() => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game)).toBeNull()
  await expect.poll(() => server.sent.filter(m => m.type === 'GAME_UNWATCH').length).toBe(1)
  await expect(page.getByRole('dialog', { name: '테이블 정보', exact: true })).toHaveCount(0)
})

test('팔각정 관전 종료는 벤치 시점으로 돌아오며 다음 경기를 직접 다시 관전할 수 있다', async ({ page }) => {
  const benchId = 'bench-' + BENCH_PAVILIONS.indexOf('P1')
  const bench = generatedFacilityCatalog.facilities.find(f => f.facilityId === benchId)!
  const anchor = PARK_LAYOUT.DRAFT_TABLES.find(t => t.pavilionId === 'P1')!
  const server = await fixture(page, { generatedPark: true, omok: true, publicSpectator: true, ownUserId: '505',
    anchorId: anchor.id, position: bench.center, manualMovement: true })
  await load(page)
  expect(await page.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id, 0), benchId)).toBe(true)
  await page.getByRole('button', { name: '가까이 관전', exact: true }).click()
  await expect(page.getByLabel('오목 관전 경기 정보', { exact: true })).toBeVisible()
  server.finishGame(); server.publicMatch(null)
  await expect(page.getByLabel('오목 관전 경기 정보', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '가까이 관전', exact: true })).toBeDisabled()
  expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(1)
  server.publicMatch('next-bench-game')
  await expect(page.getByRole('button', { name: '가까이 관전', exact: true })).toBeEnabled()
  expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(1)
  await page.getByRole('button', { name: '가까이 관전', exact: true }).click()
  await expect(page.getByLabel('오목 관전 경기 정보', { exact: true })).toBeVisible()
  expect(server.sent.filter(m => m.type === 'GAME_WATCH')).toHaveLength(2)
  const session = await page.evaluate(async () => {
    const s = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    return { bench: s.benchId, table: s.tableId }
  })
  expect(session).toEqual({ bench: benchId, table: '' })
  await expect(page.getByRole('dialog', { name: '테이블 정보', exact: true })).toHaveCount(0)
})
