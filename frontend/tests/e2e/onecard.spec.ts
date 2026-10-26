import { test, expect, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import type { Card, Hand, OneCard } from '../../src/game/onecard/protocol'
const panel = (p: Page) => p.locator('[aria-label="원카드 경기"], .gathering-hud[data-phase="finished"], [aria-label="경기 결과 상세"]')
const card = (rank: string, suit: Card['suit'] = 'hearts'): Card => ({ id: suit ? `${suit}-${rank}` : rank, rank, suit })
async function start(page: Page, count: 2 | 3 | 4 = 2) {
  const server = await fixture(page, { omok: true, m09: true, onecard: count, players: count })
  await page.goto('/park'); await expect(page).toHaveTitle(/온탑|OnTop/i)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
  await page.getByRole('button', { name: '앉기', exact: true }).click()
  await page.getByLabel('1인 참가비').fill('1'); await page.getByRole('button', { name: '원카드 선택', exact: true }).click()
  await page.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  await expect(panel(page)).toContainText('내 차례'); await expect(panel(page).getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(7)
  return server
}
const handButtons = (page: Page) => panel(page).getByLabel('나만 볼 수 있는 카드').getByRole('button')
const state = (page: Page) => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game)
test('M12 2-player atomic hands, card/suit/K/draw/attack commands, result and next round', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const server = await start(page), p = panel(page), originalDeadline = server.cardState().turnDeadline
  const after7: Hand = { ...server.cardHand(), hand: server.cardHand().hand.filter(c => c.rank !== '7'), playableCardIds: [], canDraw: false }
  server.holdState(true)
  server.cardReply({ kind: 'play', cardId: 'hearts-7' }, { topCard: card('7'), stage: 'CHOOSE_SUIT', players: server.cardState().players.map(p => p.userId === '101' ? { ...p, cardCount: 6 } : p) }, after7)
  await handButtons(page).filter({ hasText: '7' }).click(); await p.getByRole('button', { name: '하트 7 내기', exact: true }).click()
  await expect(p).toContainText('처리 확인 수신'); await expect(handButtons(page)).toHaveCount(0)
  server.holdState(false); server.flushGame()
  await expect(p.getByRole('group', { name: '무늬 선택' })).toBeVisible()
  server.cardReply({ kind: 'select-suit', suit: 'spades' }, { stage: 'PLAYING', activeSuit: 'spades', turnUserId: '102' }, after7)
  await p.getByRole('button', { name: '스페이드 선택 ♠', exact: true }).click()
  await expect(p).toContainText('현재 무늬: ♠ 스페이드'); expect((await state(page))!.onecard!.turnDeadline).toBe(originalDeadline)
  expect(await handButtons(page).evaluateAll(buttons => buttons.every(b => (b as HTMLButtonElement).disabled))).toBe(true)
  server.cardSnapshot({ turnUserId: '101', activeSuit: 'hearts' }, { ...after7, playableCardIds: ['hearts-K'], canDraw: true })
  const afterK: Hand = { ...after7, hand: after7.hand.filter(c => c.rank !== 'K'), playableCardIds: ['hearts-4'], canDraw: true }
  server.cardReply({ kind: 'play', cardId: 'hearts-K' }, { topCard: card('K'), extraAction: true, players: server.cardState().players.map(p => p.userId === '101' ? { ...p, cardCount: 5 } : p) }, afterK)
  await p.getByRole('button', { name: '하트 K · 한 장 더 내기', exact: true }).click(); await p.getByRole('button', { name: '하트 K 내기', exact: true }).click()
  await expect(p).toContainText('K 추가 행동'); expect((await state(page))!.onecard!.turnDeadline).toBe(originalDeadline)
  const drawn = { ...afterK, hand: [...afterK.hand, card('8', 'clubs')], playableCardIds: [], canDraw: false }
  server.cardReply({ kind: 'draw' }, { extraAction: false, turnUserId: '102', players: server.cardState().players.map(p => p.userId === '101' ? { ...p, cardCount: 6 } : p) }, drawn)
  await p.getByRole('button', { name: '한 장 뽑고 넘기기', exact: true }).click(); await expect(handButtons(page)).toHaveCount(6)
  await expect(p.getByRole('button', { name: '클로버 8 · 일반 카드', exact: true })).toBeDisabled()
  server.cardSnapshot({ turnUserId: '101', attackTotal: 7, topCard: card('joker-color', null), lastAttack: card('joker-color', null) }, drawn)
  const accepted = { ...drawn, hand: [...drawn.hand, ...['2', '3', '4', '5', '6', '7', '8'].map(rank => card(rank, 'spades'))] }
  server.cardReply({ kind: 'accept-attack' }, { attackTotal: 0, lastAttack: null, turnUserId: '102', players: server.cardState().players.map(p => p.userId === '101' ? { ...p, cardCount: 13 } : p) }, accepted)
  await p.getByRole('button', { name: '공격 받기 · +7장', exact: true }).click(); await expect(handButtons(page)).toHaveCount(13)
  await p.getByRole('button', { name: '원카드 규칙', exact: true }).click(); await expect(p).toContainText('3초 만료만으로 벌칙을 받지 않습니다.')
  await screenshot(page, 'm12-player')
  const end = { status: 'FINISHED' as const, stage: 'FINISHED' as const, turnUserId: null, turnDeadline: null, winnerUserIds: ['102'], endReason: 'EMPTY_HAND', endedAt: new Date().toISOString() }
  server.cardSnapshot(end, accepted); await expect(p).toContainText('손패를 모두 비웠습니다.')
  await p.getByRole('button', { name: '정산 결과 확인' }).click(); await expect(p).toContainText('정산 대기 중')
  server.settle(); await expect(p).toContainText('정산 완료 · 내 엽전 증감 1')
  server.nextRound(); await page.getByRole('button', { name: '다음 판 준비', exact: true }).click(); await expect(p).toHaveCount(0); await expect(page.getByRole('button', { name: '준비', exact: true })).toBeEnabled()
  for (const m of server.sent.filter(m => m.type === 'GAME_ACTION_SEND')) expect(Object.keys(m.payload).sort()).toEqual(['actionId', 'expectedVersion', 'gameId', 'input'])
  expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND')).toHaveLength(5); expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
for (const count of [3, 4] as const) test(`M12 ${count}-player declaration/report race windows, recovery and deadline`, async ({ page }) => {
  const server = await start(page, count), p = panel(page)
  await expect(p.getByLabel('원카드 참가자').locator(':scope > div')).toHaveCount(count)
  const one: Hand = { userId: '101', hand: [card('4')], playableCardIds: [], canDraw: false }
  let players: OneCard['players'] = server.cardState().players.map(p => ({ ...p, cardCount: p.userId === '101' || p.userId === '102' ? 1 : 7,
    oneCardStatus: p.userId === '101' || p.userId === '102' ? 'pending' as const : 'none' as const,
    oneCardUntil: p.userId === '101' || p.userId === '102' ? new Date(Date.now() + 3000).toISOString() : null }))
  server.cardSnapshot({ players, turnUserId: '103' }, one)
  server.cardReply({ kind: 'catch-one', targetUserId: '102' }, { players: players.map(p => p.userId === '102' ? { ...p, cardCount: 3, oneCardStatus: 'caught', oneCardUntil: null } : p) }, one)
  await p.getByRole('button', { name: '참가자 2 미선언 신고', exact: true }).click(); await expect(p).toContainText('미선언 벌칙')
  players = server.cardState().players
  server.cardReply({ kind: 'declare-one' }, { players: players.map(p => p.userId === '101' ? { ...p, oneCardStatus: 'declared', oneCardUntil: null } : p) }, one)
  await p.getByRole('button', { name: /^원카드!/ }).click(); await expect(p).toContainText('원카드 선언!')
  server.cardSnapshot({ players: server.cardState().players.map(p => p.userId === '101' ? { ...p, oneCardStatus: 'pending', oneCardUntil: new Date(Date.now() + 400).toISOString() } : p) }, one)
  await expect(p.getByRole('button', { name: /^원카드!/ })).toBeDisabled()
  expect((await state(page))!.onecard!.players[0]!.cardCount).toBe(1)
  server.cardSnapshot({ turnUserId: '101', turnDeadline: new Date(Date.now() + 30000).toISOString() }, { ...one, playableCardIds: ['hearts-4'], canDraw: true })
  server.recoveryPending(); await expect(handButtons(page)).toHaveCount(0)
  server.restoreGame(); await expect(handButtons(page)).toHaveCount(1)
  server.cardSnapshot({ turnDeadline: new Date(Date.now() - 100).toISOString() })
  await expect(p).toContainText('시간 만료'); await expect(handButtons(page).first()).toBeDisabled()
  await expect(p.getByRole('button', { name: '한 장 뽑고 넘기기' })).toBeDisabled()
  if (count === 4) { await page.setViewportSize({ width: 1000, height: 700 }); await screenshot(page, 'm12-narrow') }
  expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND').map(m => m.payload.input)).toEqual([{ kind: 'catch-one', targetUserId: '102' }, { kind: 'declare-one' }])
})
test('M12 stale rejection freezes inputs, latest refresh recovers, malformed foreign hand is never rendered', async ({ page }) => {
  const server = await start(page), p = panel(page)
  server.rejectNextAction('GAME_ACTION_STALE_VERSION', '최신 버전을 확인해주세요.')
  await p.getByRole('button', { name: '한 장 뽑고 넘기기' }).click(); await expect(p).toContainText('자동으로 재전송하지 않습니다.')
  await expect(handButtons(page)).toHaveCount(0)
  await p.getByRole('button', { name: '최신 원카드 확인' }).click(); await expect(handButtons(page)).toHaveCount(7)
  server.cardSnapshot({}, { ...server.cardHand(), userId: '102' })
  await expect(p).toContainText('경기 응답 형식을 확인하지 못해 입력을 중지했습니다.')
  await expect(handButtons(page)).toHaveCount(0)
  expect((await state(page))!.hand!.userId).toBe('101')
  expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND')).toHaveLength(1)
})
