import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

type Kind = 'OMOK' | 'DICE' | 'ONE_CARD' | 'LIAR_BRIDGE'
const labels = { OMOK: '오목 경기', DICE: '주사위 경기', ONE_CARD: '원카드 경기', LIAR_BRIDGE: '다리 경기' }
const game = (page: Page) => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game)
const forfeit = (page: Page) => page.evaluate(async () => (await import('/src/game/forfeit.ts' as string)).useForfeit.getState().attempt)
const result = (page: Page) => page.getByRole('region', { name: '테이블 함께 보기', exact: true })
async function nextRound(page: Page) {
  await result(page).getByRole('button', { name: '다음 판 준비', exact: true }).click()
  await page.getByRole('button', { name: '준비', exact: true }).click()
}
async function start(page: Page, kind: Kind = 'OMOK', count: 2 | 3 | 4 = 2) {
  const server = await fixture(page, { omok: true, forfeit: true, manualMovement: true, players: count,
    ...(kind === 'DICE' ? { dice: true } : kind === 'ONE_CARD' ? { m09: true, onecard: count } : kind === 'LIAR_BRIDGE' ? { m09: true, bridge: count } : {}) })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
  await page.getByRole('button', { name: '앉기', exact: true }).click()
  const selection = { OMOK: '오목 선택', DICE: '주사위 한 판 선택', ONE_CARD: '원카드 선택', LIAR_BRIDGE: '거짓말 다리 건너기 선택' }
  await page.getByLabel('1인 참가비', { exact: true }).fill('1')
  await page.getByRole('button', { name: selection[kind], exact: true }).click()
  await page.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  const panel = page.getByRole('region', { name: labels[kind], exact: true })
  await expect(panel).toBeVisible(); await expect(panel.getByRole('button', { name: '기권', exact: true })).toBeEnabled()
  if (kind === 'OMOK') await panel.getByText('키보드로 오목판 조작', { exact: true }).click()
  return { server, panel }
}
async function confirm(page: Page) {
  await page.getByRole('button', { name: '기권', exact: true }).click()
  await expect(page.getByRole('group', { name: '기권 확인', exact: true })).toContainText('되돌릴 수 없으며')
  await page.getByRole('button', { name: '기권 확정', exact: true }).click({ clickCount: 2 })
}
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', e => list.push(e.message)); page.on('console', m => { if (m.type() === 'error') list.push(m.text()) })
})
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0) })

for (const kind of ['OMOK', 'DICE', 'ONE_CARD', 'LIAR_BRIDGE'] as const) {
  test(`${kind}: cancel/off-turn/one request, server result and settlement, then a fresh next game`, async ({ page }) => {
    const { server, panel } = await start(page, kind)
    if (kind === 'OMOK') server.turnTo('102')
    if (kind === 'DICE') server.diceSnapshot({ turnUserId: '102' })
    if (kind === 'ONE_CARD') server.cardSnapshot({ turnUserId: '102' })
    if (kind === 'LIAR_BRIDGE') server.bridgeSnapshot({ turnUserId: '102' })
    await expect(panel.getByRole('button', { name: '기권', exact: true })).toBeEnabled()
    await panel.getByRole('button', { name: '기권', exact: true }).click()
    await panel.getByRole('button', { name: '계속 플레이', exact: true }).click()
    await page.locator('canvas').focus(); await page.keyboard.press('KeyW')
    expect(server.sent.some(m => ['GAME_FORFEIT', 'TABLE_LEAVE'].includes(m.type))).toBe(false)
    server.forfeitMode('hold'); server.forfeitOrder(kind === 'DICE' ? 'receipt-first' : 'state-first')
    await confirm(page); await expect(panel).toContainText('기권 요청 확인 중')
    const requests = server.sent.filter(m => m.type === 'GAME_FORFEIT'); expect(requests).toHaveLength(1)
    expect(Object.keys(requests[0]!.payload).sort()).toEqual(['actionId', 'gameId'])
    expect(requests[0]!.payload.actionId).toMatch(/^[\w-]{1,64}$/)
    server.completeForfeit(); await expect(result(page)).toContainText('기권 요청이 확인됐어요')
    await expect.poll(async () => { const g = (await game(page))!; return (g.omok ?? g.dice ?? g.onecard ?? g.bridge)!.status }).toBe('FINISHED')
    expect(server.forfeitApplications).toBe(1)
    expect(server.sent.some(m => m.type === 'TABLE_LEAVE')).toBe(false)
    await result(page).getByRole('button', { name: '정산 결과 확인', exact: true }).click()
    await expect(result(page)).toContainText('정산 대기 중')
    server.settle(); await expect(result(page)).toContainText('정산 완료 · 내 엽전 증감 -1')
    await expect(page.getByLabel('보유 엽전', { exact: true })).toHaveText('100냥')
    await screenshot(page, `forfeit-${kind.toLowerCase()}-approved`)
    const oldId = (await game(page))!.gameId
    server.nextRound(); await expect(panel).toHaveCount(0)
    await nextRound(page); server.confirmStart()
    await expect(panel.getByRole('button', { name: '기권', exact: true })).toBeEnabled()
    expect((await game(page))!.gameId).not.toBe(oldId)
    server.lateForfeitError(requests[0]!.requestId); server.lateForfeitReceipt(oldId, String(requests[0]!.payload.actionId))
    await expect(panel.getByRole('button', { name: '기권', exact: true })).toBeEnabled()
    expect(server.sent.filter(m => m.type === 'GAME_FORFEIT')).toHaveLength(1)
  })
}

for (const kind of ['ONE_CARD', 'LIAR_BRIDGE'] as const) for (const count of [3, 4] as const) {
  test(`${kind} ${count} players: own elimination keeps the remaining match and seats intact`, async ({ page }) => {
    const { server, panel } = await start(page, kind, count)
    await confirm(page); await expect(panel).toContainText('기권 요청이 확인됐어요')
    const g = (await game(page))!
    expect((g.onecard ?? g.bridge)!.status).toBe('PLAYING')
    expect(await page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().recovery)).toBe('ELIMINATED')
    if (kind === 'ONE_CARD') { expect(g.hand?.hand).toEqual([]); expect(g.onecard!.players[0]!.active).toBe(false) }
    else { expect(g.secret).toBeNull(); expect(g.bridge!.players[0]!.forfeited).toBe(true) }
    await expect(panel.getByRole('button', { name: '정산 결과 확인', exact: true })).toHaveCount(0)
    expect(server.sent.some(m => ['TABLE_LEAVE', 'GAME_ACTION_SEND', 'GAME_RESULT_CHECK'].includes(m.type))).toBe(false)
    expect(server.forfeitApplications).toBe(1)
  })
}

test('bridge pending forfeit immediately hides the private die and blocks declaration until the server resolves it', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 })
  const { server, panel } = await start(page, 'LIAR_BRIDGE', 3)
  server.bridgeSnapshot({ stage: 'DECLARING' }, { userId: '101', turnId: 1, die: 'X' })
  await expect(panel.getByLabel('나만 보는 주사위')).toContainText('X')
  server.forfeitPendingBridge(); await confirm(page)
  await expect(panel).toContainText('기권 예정 · 판정 후 정리')
  expect((await game(page))!.secret).toBeNull()
  await expect(panel.getByLabel('나만 보는 주사위')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: '기권', exact: true })).toHaveCount(0)
  await screenshot(page, 'forfeit-bridge-pending-small-pc')
})

test('a definite rejection preserves the game and requires another confirmation', async ({ page }) => {
  const { server, panel } = await start(page)
  server.forfeitMode('reject'); await confirm(page)
  await expect(panel.locator('.game-forfeit')).toContainText('기권 서버 연결이 아직 준비되지')
  await expect(panel.getByRole('button', { name: '8행 8열 빈칸', exact: true })).toBeEnabled()
  expect(server.forfeitApplications).toBe(0)
  server.forfeitMode('approve'); await confirm(page)
  await expect(result(page)).toContainText('기권 요청이 확인됐어요')
  const requests = server.sent.filter(m => m.type === 'GAME_FORFEIT')
  expect(requests[0]!.payload).toEqual(requests[1]!.payload)
})

test('lost receipt after server finish times out without replay, then explicitly confirms the same action', async ({ page }) => {
  const { server } = await start(page)
  server.forfeitMode('lost-after-apply'); await confirm(page)
  await expect.poll(async () => (await forfeit(page))?.status, { timeout: 12000 }).toBe('uncertain')
  expect(server.sent.filter(m => m.type === 'GAME_FORFEIT')).toHaveLength(1)
  await screenshot(page, 'forfeit-receipt-unconfirmed')
  // The latest dev result UI must keep recovery accessible in both result views.
  await result(page).getByRole('button', { name: '결과 자세히', exact: true }).click()
  const details = page.getByRole('region', { name: '경기 결과 상세', exact: true })
  await expect(details.getByRole('button', { name: '같은 기권 요청 확인', exact: true })).toBeEnabled()
  server.forfeitMode('approve')
  await details.getByRole('button', { name: '같은 기권 요청 확인', exact: true }).click()
  await expect(details).toContainText('기권 요청이 확인됐어요')
  const requests = server.sent.filter(m => m.type === 'GAME_FORFEIT')
  expect(requests).toHaveLength(2); expect(requests[0]!.payload).toEqual(requests[1]!.payload)
  expect(server.forfeitApplications).toBe(1)
})

test('reconnect recovers the terminal game but never resends the pending forfeit automatically', async ({ page }) => {
  const { server } = await start(page)
  server.forfeitMode('lost-after-apply'); await confirm(page)
  await expect.poll(() => server.forfeitApplications).toBe(1)
  server.close(1013); await expect.poll(() => server.connections).toBe(2)
  // A recovered game can precede an accepted own-seat snapshot; do not fabricate a seat to show gathering.
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().roomId)).toBe('fixture-channel')
  await expect.poll(() => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().recovery)).toBe('FINISHED')
  const retry = page.getByRole('button', { name: '같은 기권 요청 확인', exact: true })
  await expect(retry).toBeEnabled()
  expect(server.sent.filter(m => m.type === 'GAME_FORFEIT')).toHaveLength(1)
  server.forfeitMode('approve'); await retry.click()
  await expect(page.locator('.game-forfeit')).toContainText('기권 요청이 확인됐어요')
  const requests = server.sent.filter(m => m.type === 'GAME_FORFEIT')
  expect(requests[0]!.payload).toEqual(requests[1]!.payload); expect(server.forfeitApplications).toBe(1)
})

test('a malformed receipt cannot approve a forfeit and a receipt alone never fabricates a finished game', async ({ page }) => {
  const { server, panel } = await start(page)
  server.forfeitMode('receipt-only'); await confirm(page)
  await expect(panel).toContainText('기권 요청이 확인됐어요')
  expect((await game(page))!.omok!.status).toBe('PLAYING')
  await expect(panel.getByRole('button', { name: '8행 8열 빈칸', exact: true })).toBeDisabled()
  server.restoreGame(); await expect.poll(async () => (await game(page))!.omok!.status).toBe('FINISHED')
  server.settle(); server.nextRound(); await nextRound(page); server.confirmStart()
  server.forfeitMode('malformed'); await confirm(page)
  await expect.poll(async () => (await forfeit(page))?.status).toBe('uncertain')
  await expect(result(page)).not.toContainText('기권 요청이 확인됐어요')
})

test('forfeiting and leaving retains roaming follow and server emote cancellation from latest dev', async ({ page }) => {
  const { server } = await start(page)
  await confirm(page)
  await expect(result(page)).toContainText('기권 요청이 확인됐어요')
  server.settle(); server.nextRound()
  await result(page).getByRole('button', { name: '다음 판 준비', exact: true }).click()
  await page.getByRole('dialog', { name: '테이블 정보', exact: true }).getByRole('button', { name: '일어나기', exact: true }).click()
  await expect(result(page)).toHaveCount(0)
  await page.getByRole('button', { name: '테이블 정보 닫기', exact: true }).click()
  // The 이웃 메뉴 launcher is gone; open the menu the way an avatar right-click does.
  await page.evaluate(async () => {
    const { openAvatarMenu } = await import('/src/features/follow/FollowMenu.tsx' as string)
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    const state = useSession.getState()
    openAvatarMenu({ id: state.ids.find((id: string) => id !== state.sessionId), x: 600, y: 300 })
  })
  await page.getByRole('menuitem', { name: '따라가기', exact: true }).click()
  await expect(page.getByRole('complementary', { name: '따라가기 상태', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '따라가기 종료', exact: true }).click()
  await expect(page.getByRole('complementary', { name: '따라가기 상태', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '감정표현 열기', exact: true }).click()
  await page.getByRole('dialog', { name: '감정표현 선택' }).getByRole('button', { name: '손 인사', exact: true }).click()
  const emote = () => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).avatars.get('101')!.emote)
  await expect.poll(emote).toBe('EMOTE_WAVE')
  const approved = server.lastEmote()!
  server.cancelEmote({ eventId: 'after-forfeit-cancel', emoteEventId: approved.eventId, userId: '101', channelId: 'fixture-channel', reason: 'MOVEMENT', sentAt: new Date().toISOString() })
  await expect.poll(emote).toBe('')
  await screenshot(page, 'forfeit-return-roaming-follow-emote')
})

test('account exit clears the pending identity and ignores a late receipt', async ({ page }) => {
  const { server } = await start(page)
  server.forfeitMode('hold'); await confirm(page)
  const request = server.sent.find(m => m.type === 'GAME_FORFEIT')!
  server.endSession(); await expect(page.locator('.login-page')).toBeVisible()
  expect(await forfeit(page)).toBeNull()
  server.lateForfeitReceipt(String(request.payload.gameId), String(request.payload.actionId))
  expect(await forfeit(page)).toBeNull()
})
