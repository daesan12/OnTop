import { test, expect, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { createOneCardPrankRoom } from './onecardPrankFixture'
import { facilityCatalog } from '../fixtures/facilityCatalog'
import { benchTable } from '../../src/features/interactions/benchSpectator'
const panel = (page: Page) => page.getByLabel('원카드 경기', { exact: true })
async function load(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle(/온탑|OnTop/i)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().status)).toBe('connected')
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.46))
}
async function seat(page: Page, server: Awaited<ReturnType<typeof fixture>>, anchorId?: string) {
  await expect(async () => {
    await page.evaluate(async id => {
      if (id) (await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.inspectTable(id)
      else (await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable()
    }, anchorId)
    await expect(page.getByRole('button', { name: '앉기', exact: true })).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 15000 })
  await page.getByRole('button', { name: '앉기', exact: true }).click(); await page.getByLabel('1인 참가비').fill('1')
  await page.getByRole('button', { name: '원카드 선택', exact: true }).click()
  await page.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  await expect(panel(page).getByRole('button', { name: '뿅망치 들기', exact: true })).toBeEnabled()
}
test('spectator clicks public backs; defender sees a ghost hand and a server-approved hit blocks only that actor', async ({ page, browser }) => {
  const errors: string[] = [], watch = (p: Page) => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()) }) }
  watch(page)
  const room = createOneCardPrankRoom(), bench = facilityCatalog.facilities.find(f => f.kind === 'BENCH' && benchTable(f.facilityId)?.pavilionId === 'P1')!, anchor = benchTable(bench.facilityId)!
  const player = await fixture(page, { omok: true, m09: true, onecard: 4, players: 4, onecardPranks: true,
    onecardPreview: { observer: false, room }, anchorId: anchor.id })
  await load(page); await seat(page, player, anchor.id)
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  try {
    const observerPage = await other.newPage(); watch(observerPage)
    const observer = await fixture(observerPage, { omok: true, onecard: 4, players: 5, onecardPranks: true, publicSpectator: true,
      onecardPreview: { observer: true, room }, manualMovement: true, position: bench.center, anchorId: anchor.id })
    await load(observerPage)
    await expect.poll(() => observerPage.evaluate(async () => (await import('/src/features/facilities/state.ts' as string)).useFacilityState.getState().ready)).toBe(true)
    expect(await observerPage.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id, 0), bench.facilityId)).toBe(true)
    await observerPage.getByRole('button', { name: '가까이 관전', exact: true }).click()
    const snapshot = { turnDeadline: new Date(Date.now() + 30000).toISOString() }
    player.cardSnapshot(snapshot); observer.cardSnapshot(snapshot, observer.cardHand(), 'SPECTATOR')
    for (const p of [page, observerPage]) await p.evaluate(now => { Date.now = () => now }, Date.now())
    await panel(page).getByRole('button', { name: '하트 K · 한 장 더 내기', exact: true }).click()
    await panel(page).getByRole('button', { name: '뿅망치 들기', exact: true }).click()
    const reach = panel(observerPage).getByRole('button', { name: /손패에 손 뻗기$/ })
    await expect(reach).toBeEnabled(); await reach.click()
    const hand = panel(page).getByRole('button', { name: /의 손 막기$/ })
    await expect(hand).toBeEnabled(); await expect(hand).toHaveAttribute('data-actor-user-id', '505')
    await screenshot(page, 'onecard-ghost-hand', 'disabled')
    await hand.click()
    await expect(panel(page).getByText(/방해 차단 [123]초/)).toBeVisible()
    await expect(panel(page).locator('[data-flipped=true]')).toHaveCount(0)
    await expect(reach).toBeDisabled()
    await screenshot(page, 'onecard-hammer-blocked', 'disabled')
    const hits = player.sent.filter(m => m.type === 'ONECARD_PRANK_HIT_SEND')
    expect(hits).toHaveLength(1); expect(Object.keys(hits[0]!.payload).sort()).toEqual(['attemptId', 'eventId', 'gameId'])
    expect(observer.sent.filter(m => m.type === 'ONECARD_PRANK_REACH_SEND')).toHaveLength(1)
    expect([...player.sent, ...observer.sent].filter(m => ['GAME_ACTION_SEND', 'ONECARD_HAND_FLIP_SEND'].includes(m.type))).toHaveLength(0)
    await expect(panel(observerPage).getByLabel('나만 볼 수 있는 카드')).toHaveCount(0)
    expect(await observerPage.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game.hand)).toBeNull()
    player.cardSnapshot({ turnCount: 2 }); observer.cardSnapshot({ turnCount: 2 }, observer.cardHand(), 'SPECTATOR')
    await panel(page).getByRole('button', { name: '하트 K · 한 장 더 내기', exact: true }).click()
    await expect(reach).toBeEnabled({ timeout: 6500 }); await reach.click(); await expect(hand).toBeVisible()
    observer.cardPranks.resolveReach()
    await expect(panel(page).locator('[data-flipped=true]')).toHaveCount(2)
    await expect(panel(page).getByRole('button', { name: '하트 K 내기', exact: true })).toBeEnabled()
    await panel(page).getByRole('button', { name: '손패 정리 · 2장 복구', exact: true }).click()
    await expect(panel(page).locator('[data-flipped=true]')).toHaveCount(0)
    expect(errors).toEqual([])
  } finally { await other.close() }
})
test('turn change removes a reaching hand without issuing a hit or a local block', async ({ page }) => {
  const server = await fixture(page, { omok: true, m09: true, onecard: 4, players: 4, onecardPranks: true })
  await load(page); await seat(page, server)
  server.cardPranks.reach()
  await expect(panel(page).getByRole('button', { name: /의 손 막기$/ })).toBeVisible()
  server.cardSnapshot({ turnUserId: '102', turnCount: 2 })
  await expect(panel(page).getByRole('button', { name: /의 손 막기$/ })).toHaveCount(0)
  expect(server.sent.filter(m => m.type === 'ONECARD_PRANK_HIT_SEND')).toHaveLength(0)
  await expect(panel(page).getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(7)
})
