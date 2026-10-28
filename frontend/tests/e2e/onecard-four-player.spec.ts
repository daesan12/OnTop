import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { fixture } from './contractFixture'
import { createOneCardPrankRoom } from './onecardPrankFixture'
import { facilityCatalog } from '../fixtures/facilityCatalog'
import { benchTable } from '../../src/features/interactions/benchSpectator'
import type { Card, Hand } from '../../src/game/onecard/protocol'

const panel = (page: Page) => page.getByLabel('원카드 경기', { exact: true })
type Scene = ReturnType<typeof import('./onecardSceneProbe').oneCardSceneProbe>
const probe = (page: Page): Promise<Scene> => page.evaluate(async () => (await import('/tests/e2e/onecardSceneProbe.ts' as string)).oneCardSceneProbe())
const profiles = {
  '101': { nickname: '도윤', characterGender: 'MALE' as const },
  '102': { nickname: '민지', characterGender: 'FEMALE' as const },
  '103': { nickname: '준', characterGender: 'MALE' as const },
  '104': { nickname: '하늘', characterGender: 'FEMALE' as const },
  '505': { nickname: '구경꾼', characterGender: 'MALE' as const },
}
async function load(page: Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle(/온탑|OnTop/i)
  await expect.poll(() => page.evaluate(async () => {
    const state = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    return state.status === 'connected' && state.bindings.length > 0
  })).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(page.locator('canvas')).toBeVisible()
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.46))
}
async function shot(page: Page, name: string) {
  const dir = process.env.ONECARD_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'ontop-onecard-four-player')
  await fs.mkdir(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`), animations: 'disabled' })
}
test('four seated players and a separate observer: flip crosses windows and restores with one action', async ({ page, browser }) => {
  const room = createOneCardPrankRoom()
  const bench = facilityCatalog.facilities.find(d => d.kind === 'BENCH' && benchTable(d.facilityId)?.pavilionId === 'P1')!
  const anchor = benchTable(bench.facilityId)!
  const errors: string[] = []
  const watchErrors = (p: Page) => {
    p.on('pageerror', error => errors.push(error.message))
    p.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  }
  watchErrors(page)
  const player = await fixture(page, { omok: true, m09: true, onecard: 4, players: 4, onecardPranks: true,
    onecardPreview: { observer: false, room, interactionReview: true }, publicProfiles: profiles, anchorId: anchor.id })
  await load(page)
  await expect(async () => {
    await page.evaluate(async id => (await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.inspectTable(id), anchor.id)
    await expect(page.getByRole('button', { name: '앉기', exact: true })).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 15000 })
  await page.getByRole('button', { name: '앉기', exact: true }).click()
  await page.getByLabel('1인 참가비').fill('1')
  await page.getByRole('button', { name: '원카드 선택', exact: true }).click()
  await page.getByRole('button', { name: '준비', exact: true }).click(); player.confirmStart()
  await expect(panel(page).getByRole('timer', { name: '차례 남은 시간' })).toBeVisible()

  const observerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  try {
    const observerPage = await observerContext.newPage()
    watchErrors(observerPage)
    const observer = await fixture(observerPage, { omok: true, onecard: 4, players: 5, onecardPranks: true,
      onecardPreview: { observer: true, room, interactionReview: true }, publicSpectator: true, publicProfiles: profiles,
      manualMovement: true, position: bench.center, anchorId: anchor.id })
    await load(observerPage)
    await expect.poll(() => observerPage.evaluate(async () => (await import('/src/features/facilities/state.ts' as string)).useFacilityState.getState().ready)).toBe(true)
    expect(await observerPage.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id, 0), bench.facilityId)).toBe(true)
    await observerPage.getByRole('button', { name: '가까이 관전', exact: true }).click()
    await expect(panel(observerPage).getByRole('button', { name: '관전 종료', exact: true })).toBeVisible()

    const card = (suit: Card['suit'], rank: string): Card => ({ id: `${suit}-${rank}`, suit, rank })
    const hand: Hand = { userId: '101', hand: [card('hearts', '4'), card('spades', '7'), card('diamonds', 'K'),
      card('hearts', 'J'), card('clubs', '2'), card('hearts', 'A'), card('diamonds', 'Q')],
      playableCardIds: ['hearts-4', 'hearts-J', 'hearts-A'], canDraw: true }
    const counts = [7, 5, 4, 3]
    const snapshot = { players: player.cardState().players.map((p, i) => ({ ...p, cardCount: counts[i]! })),
      turnUserId: '101', turnCount: 1, turnDeadline: new Date(Date.now() + 30000).toISOString(), drawCount: 34 }
    player.cardSnapshot(snapshot, hand)
    observer.cardSnapshot(snapshot, hand, 'SPECTATOR')
    await expect.poll(async () => (await probe(page)).players.map(p => p.seat)).toEqual([0, 1, 2, 3])
    await expect.poll(async () => (await probe(observerPage)).players.map(p => p.seat)).toEqual([0, 1, 2, 3])
    for (const p of [page, observerPage]) {
      await expect.poll(async () => (await probe(p)).players.every(player => player.table === anchor.id
        && player.visible === (p === observerPage || player.id !== '101'))).toBe(true)
      await expect(p.locator('vite-error-overlay')).toHaveCount(0)
    }
    for (const id of ['102', '103', '104'] as const) {
      await expect(page.locator(`.avatar-overhead[data-player-id="${id}"]`)).toBeVisible()
      await expect(page.locator(`.avatar-overhead[data-player-id="${id}"] .avatar-nickname`)).toHaveText(profiles[id].nickname)
    }
    await expect.poll(async () => (await probe(page)).players.map(p => p.heldCount)).toEqual([7, 5, 4, 3])
    await expect.poll(async () => (await probe(observerPage)).players.every(p => p.heldCount > 0)).toBe(true)
    for (const remoteCount of [17, 1, 5]) {
      const next = { ...snapshot, drawCount: 39 - remoteCount, players: snapshot.players.map((p, i) => i === 1 ? { ...p, cardCount: remoteCount } : p) }
      player.cardSnapshot(next, hand); observer.cardSnapshot(next, hand, 'SPECTATOR')
      for (const p of [page, observerPage]) await expect.poll(async () => (await probe(p)).players.map(p => p.displayedCount)).toEqual([7, remoteCount, 4, 3])
      if (remoteCount === 17) await shot(page, 'onecard-4p-17-cards')
    }
    await panel(page).getByRole('button', { name: '하트 J · 다음 차례 건너뛰기', exact: true }).click()
    await expect(panel(page).getByRole('button', { name: '하트 J · 다음 차례 건너뛰기', exact: true }).locator('.onecard-effect')).toHaveText('다음 차례 건너뛰기')
    await expect(panel(page).locator('.onecard-description')).toHaveCount(0)
    await expect(panel(page).getByRole('button', { name: '하트 J 내기', exact: true })).toBeEnabled()
    await shot(page, 'onecard-4p-play')
    const prank = panel(observerPage).getByRole('button', { name: '도윤 손패 뒤집기', exact: true })
    await expect(prank).toBeEnabled()
    const spectatorBounds = await observerPage.locator('.onecard-spectator').boundingBox()
    const exitBounds = await panel(observerPage).getByRole('button', { name: '관전 종료', exact: true }).boundingBox()
    const benchBounds = await observerPage.getByRole('group', { name: '벤치 관전', exact: true }).boundingBox()
    expect(spectatorBounds!.y + spectatorBounds!.height).toBeLessThan(exitBounds!.y)
    expect(exitBounds!.y + exitBounds!.height).toBeLessThan(benchBounds!.y)
    await shot(observerPage, 'onecard-4p-observer-ready')
    if (process.env.ONECARD_INTERACTIVE_PREVIEW === 'true') {
      // Opt-in local review only: keep the actual FE and shared mock room alive for manual interaction.
      // Freeze only wall time: installing fake performance time after Three.Clock starts can invalidate camera deltas.
      const reviewTime = Date.now()
      await page.evaluate(now => { Date.now = () => now }, reviewTime)
      await observerPage.evaluate(now => { Date.now = () => now }, reviewTime)
      await page.setViewportSize({ width: 1280, height: 800 }); await observerPage.setViewportSize({ width: 1280, height: 800 })
      await page.evaluate(() => { document.title = '원카드 플레이어 · 도윤' })
      await observerPage.evaluate(() => { document.title = '원카드 관전자 · 구경꾼' })
      for (const [reviewPage, name] of [[page, 'onecard-manual-player-ready'], [observerPage, 'onecard-manual-observer-ready']] as const) {
        await reviewPage.bringToFront()
        // A background WebGL canvas resized above must paint before its review capture.
        await reviewPage.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
        await expect.poll(async () => (await probe(reviewPage)).position.every(Number.isFinite)).toBe(true)
        await shot(reviewPage, name)
      }
      console.log('ONECARD_PREVIEW_READY: 관전자에서 도윤 손패 뒤집기 → 플레이어에서 손패 정리. 두 창을 닫으면 시연이 종료됩니다.')
      await Promise.all([page.waitForEvent('close', { timeout: 0 }), observerPage.waitForEvent('close', { timeout: 0 })])
      return
    }
    await prank.click()
    await expect(panel(page).locator('[data-flipped=true]')).toHaveCount(2)
    await expect(panel(page).getByRole('button', { name: '하트 J 내기', exact: true })).toBeEnabled()
    await expect(panel(observerPage).getByText('도윤의 카드 2장이 뒤집혔어요', { exact: true })).toBeVisible()
    await expect(prank).toBeDisabled()
    await expect(panel(observerPage).getByLabel('나만 볼 수 있는 카드')).toHaveCount(0)
    expect(await observerPage.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game.hand)).toBeNull()
    await shot(observerPage, 'onecard-4p-observer-intervention')
    await shot(page, 'onecard-4p-player-flipped')
    await panel(page).getByRole('button', { name: '손패 정리 · 2장 복구', exact: true }).click()
    await expect(panel(page).locator('[data-flipped=true]')).toHaveCount(0)
    await expect.poll(() => panel(page).locator('.onecard-card-rotator').evaluateAll(cards => cards.every(card => getComputedStyle(card).transform === 'none'))).toBe(true)
    await expect(panel(observerPage).getByText('복구 완료 · 이번 차례의 장난은 사용했어요', { exact: true })).toBeVisible()
    await expect(prank).toBeDisabled()
    await shot(page, 'onecard-4p-player-restored')
    expect(observer.sent.filter(m => m.type === 'ONECARD_HAND_FLIP_SEND')).toHaveLength(1)
    expect(player.sent.filter(m => m.type === 'ONECARD_HAND_RESTORE_SEND')).toHaveLength(1)
    expect([...observer.sent, ...player.sent].filter(m => m.type === 'GAME_ACTION_SEND')).toHaveLength(0)
    // Review windows must survive ordinary game buttons without pretending to run a server game engine.
    await page.evaluate(now => { Date.now = () => now }, Date.now())
    for (let attempt = 0; attempt < 2; attempt++) {
      await panel(page).getByRole('button', { name: '하트 J 내기', exact: true }).click()
      await expect(panel(page).getByRole('alert')).toHaveText('관전자 상호작용 시연입니다. 손패 뒤집기와 손패 정리를 확인해 주세요.')
      await expect(panel(page).getByRole('button', { name: '하트 J 내기', exact: true })).toBeEnabled()
    }
    expect(await page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().uncertain)).toBe(false)
    expect(errors).toEqual([])
  } finally { await observerContext.close() }
})
