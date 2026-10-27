import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { fixture } from './contractFixture'

const panel = (page: Page) => page.getByLabel('원카드 경기', { exact: true })
async function start(page: Page) {
  const server = await fixture(page, { omok: true, m09: true, onecard: 4, players: 4, onecardPranks: true })
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => {
    const s = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    return s.status === 'connected' && s.bindings.length > 0
  })).toBe(true)
  await expect(async () => {
    await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
    await expect(page.getByRole('button', { name: '앉기', exact: true })).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 15000 })
  await page.getByRole('button', { name: '앉기', exact: true }).click()
  await page.getByLabel('1인 참가비').fill('1')
  await page.getByRole('button', { name: '원카드 선택', exact: true }).click()
  await page.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  await expect(panel(page)).toContainText('내 차례')
  return server
}
async function shot(page: Page, name: string) {
  const directory = process.env.ONECARD_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'ontop-onecard-ux-screenshots')
  await fs.mkdir(directory, { recursive: true })
  await page.screenshot({ path: path.join(directory, `${name}.png`), animations: 'disabled' })
}
test('first-person scene, legal cards, protected selection, one-click restore and strategic draw', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const server = await start(page), p = panel(page)
  await expect(page).toHaveTitle(/온탑|OnTop/i)
  await expect(p.locator('[data-playable=true]')).toHaveCount(7)
  await expect(p.getByText('낼 수 있어요', { exact: true })).toHaveCount(0)
  await expect(p.getByRole('button', { name: '하트 4', exact: true }).locator('.onecard-effect')).toHaveCount(0)
  await expect(p.getByRole('button', { name: '하트 K · 한 장 더 내기', exact: true }).locator('.onecard-effect')).toHaveText('한 장 더 내기')
  await p.getByRole('button', { name: '하트 K · 한 장 더 내기', exact: true }).click()
  await expect(p.getByRole('button', { name: '하트 K 내기', exact: true })).toBeEnabled()
  server.cardPranks.flip()
  await expect(p.locator('[data-flipped=true]')).toHaveCount(2)
  await expect(p.locator('[aria-pressed=true][data-flipped=false]')).toHaveCount(1)
  for (const card of await p.locator('[data-flipped=true]').all()) {
    await expect(card).toHaveAccessibleName('뒤집힌 카드 · 모든 손패 복구')
    await expect(card.locator('.onecard-card-front')).toBeEmpty()
  }
  await shot(page, 'onecard-flipped')
  await p.getByRole('button', { name: '손패 정리 · 2장 복구', exact: true }).click()
  await expect(p.locator('[data-flipped=true]')).toHaveCount(0)
  await expect(p.getByRole('button', { name: '하트 K 내기', exact: true })).toBeEnabled()
  const hand = server.cardHand()
  server.cardReply({ kind: 'draw' }, { turnUserId: '102', turnCount: 2,
    players: server.cardState().players.map(player => player.userId === '101' ? { ...player, cardCount: 8 } : player) },
    { ...hand, hand: [...hand.hand, { id: 'spades-8', rank: '8', suit: 'spades' }], playableCardIds: [], canDraw: false })
  await p.getByRole('button', { name: '한 장 뽑고 넘기기', exact: true }).click()
  await expect(p.getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(8)
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND').map(message => message.payload.input)).toEqual([{ kind: 'draw' }])
  const scene = await page.evaluate(async () => (await import('/tests/e2e/onecardSceneProbe.ts' as string)).oneCardSceneProbe())
  expect(scene.ownVisible).toBe(false); expect(scene.fov).toBe(68); expect(scene.topCard).toBe(true)
  await shot(page, 'onecard-desktop')
  await page.setViewportSize({ width: 1536, height: 1024 }); await shot(page, 'onecard-concept-size')
  await page.setViewportSize({ width: 1280, height: 720 }); await shot(page, 'onecard-1280')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(p.getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(3)
  await p.getByRole('button', { name: '다음 손패', exact: true }).click()
  await expect(p.getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(3)
  await p.getByRole('button', { name: '다음 손패', exact: true }).click()
  await expect(p.getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(2)
  await shot(page, 'onecard-mobile')
  const bounds = await p.getByRole('button', { name: '한 장 뽑고 넘기기', exact: true }).boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
  expect(errors).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

test('an approved spectator sends only a prank event and never receives a private hand', async ({ page }) => {
  const { facilityCatalog } = await import('../fixtures/facilityCatalog')
  const { benchTable } = await import('../../src/features/interactions/benchSpectator')
  const bench = facilityCatalog.facilities.find(d => d.kind === 'BENCH' && benchTable(d.facilityId)?.pavilionId === 'P1')!
  const anchor = benchTable(bench.facilityId)!
  const server = await fixture(page, { omok: true, onecard: 2, onecardPranks: true, publicSpectator: true,
    manualMovement: true, position: bench.center, anchorId: anchor.id })
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/src/features/facilities/state.ts' as string)).useFacilityState.getState().ready)).toBe(true)
  expect(await page.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id, 0), bench.facilityId)).toBe(true)
  await page.getByRole('button', { name: '가까이 관전', exact: true }).click()
  const p = panel(page)
  await expect(p).toContainText('원카드 관전')
  const prank = p.getByRole('button', { name: /손패 뒤집기$/ })
  await expect(prank).toBeEnabled(); await prank.click(); await expect(prank).toBeDisabled()
  expect(server.sent.filter(m => m.type === 'ONECARD_HAND_FLIP_SEND')).toHaveLength(1)
  expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND')).toHaveLength(0)
  await expect(p.getByLabel('나만 볼 수 있는 카드')).toHaveCount(0)
  expect(await page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game.hand)).toBeNull()
  await shot(page, 'onecard-spectator')
  await p.getByRole('button', { name: '관전 종료', exact: true }).click()
  await expect(p).toHaveCount(0)
})
