import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'

const marksVisible = (page: Page) => page.evaluate(async () => {
  return (await import('/tests/park-integration/omokPolishProbe.ts' as string)).omokForbiddenMarksVisible()
})

async function preview(page: Page, legacy: boolean) {
  await page.evaluate(async legacy => {
    const { useGame, receiveGame } = await import('/src/game/store.ts' as string)
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    const session = useSession.getState(), game = useGame.getState().game!
    const board = Array.from({ length: 15 }, () => Array<number>(15).fill(0))
    for (const [x, y] of [[6, 7], [8, 7], [7, 6], [7, 8]]) board[y!]![x!] = 1
    for (const x of [0, 2, 4, 6]) board[0]![x] = 2
    const points = [{ x: 7, y: 7, kind: '33' }]
    const publicState = { ...game.omok, board, moveCount: 8, lastMove: { x: 6, y: 0, stone: 'WHITE' },
      ...(legacy ? { forbiddenMoves: points } : {}) }
    receiveGame({ type: 'GAME_STATE', requestId: null, payload: {
      gameId: game.gameId, version: game.version + 1, role: game.role, publicState,
      privateState: !legacy && session.sessionId === game.omok!.blackUserId
        ? { userId: session.sessionId, forbiddenMoves: points } : {},
    } }, session.sessionId, session.tableId)
  }, legacy)
}

for (const own of ['101', '102', '505'] as const) test(`${own}: only black sees forbidden marks; white and spectators keep them hidden`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const spectator = own === '505'
  const server = await fixture(page, { generatedPark: true, omok: true, ownUserId: own,
    ...(spectator ? { publicSpectator: true, spectatorEvents: true } : { manualLobby: true, tabletServer: true }) })
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
    mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
    version: 1, updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(),
  } }))
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  if (spectator) await page.getByRole('button', { name: 'E 관전하기', exact: true }).click()
  else {
    await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click(); server.host(own)
    const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
    await tablet.getByLabel('1인 참가비').fill('1')
    await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
    await tablet.getByRole('checkbox', { name: '참가 금액을 확인했어요' }).check()
    await tablet.getByRole('button', { name: '준비 완료', exact: true }).click(); server.readyTabletOthers(true)
    await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
    server.omokColors('101')
  }
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/e2e/sceneProbe.ts' as string)).omokCameraReady())).toBe(true)
  await preview(page, own !== '101')
  await expect.poll(() => marksVisible(page)).toBe(own === '101')
  expect(await page.evaluate(async () =>
    (await import('/src/game/store.ts' as string)).useGame.getState().game?.omok?.forbiddenMoves)).toEqual(
    own === '101' ? [{ x: 7, y: 7, kind: '33' }] : undefined)
  if (own !== '101') {
    // Even a stale in-memory preview must not bypass the board's recipient check.
    await page.evaluate(async () => {
      const { useGame } = await import('/src/game/store.ts' as string), game = useGame.getState().game!
      useGame.setState({ game: { ...game, omok: { ...game.omok!, forbiddenMoves: [{ x: 7, y: 7, kind: '33' }] } } })
    })
    await expect.poll(() => marksVisible(page)).toBe(false)
  }
  await screenshot(page, `omok-forbidden-recipient-${own}`)
  if (own === '102') server.turnTo('102')
  const point = await page.evaluate(async () =>
    (await import('/tests/e2e/sceneProbe.ts' as string)).pointForOmok(7, 7))
  await page.mouse.click(point.x, point.y)
  if (own === '102') await expect.poll(() => server.sent.filter(m => m.type === 'GAME_ACTION_SEND').length).toBe(1)
  else expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND')).toHaveLength(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
