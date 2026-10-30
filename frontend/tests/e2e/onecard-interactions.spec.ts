import { test, expect, type Page, type Locator } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import type { Hand, Card } from '../../src/game/onecard/protocol'

const panel = (page: Page) => page.getByLabel('원카드 경기', { exact: true })
const cards = (page: Page) => panel(page).getByLabel('나만 볼 수 있는 카드').getByRole('button')
const actions = (server: Awaited<ReturnType<typeof fixture>>) => server.sent.filter(m => m.type === 'GAME_ACTION_SEND').map(m => m.payload.input)
const deck = (page: Page) => page.evaluate(async () => (await import('/tests/e2e/onecardSceneProbe.ts' as string)).oneCardDeckTarget())
const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', e => list.push(e.message))
  page.on('console', m => { if (m.type() === 'error') list.push(m.text()) })
})
test.afterEach(async ({ page }) => {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors.get(page)).toEqual([])
})
async function start(page: Page) {
  const server = await fixture(page, { omok: true, m09: true, onecard: 4, players: 4, onecardPranks: true })
  await page.goto('/park'); await expect(page).toHaveTitle(/온탑|OnTop/i)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => {
    const s = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    return s.status === 'connected' && s.bindings.length > 0
  })).toBe(true)
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  await page.getByRole('button', { name: '테이블 로비 열기', exact: true }).click()
  await page.getByLabel('1인 참가비').fill('1')
  await page.getByRole('button', { name: '원카드 선택', exact: true }).click()
  await page.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  await expect(cards(page)).toHaveCount(page.viewportSize()!.width <= 800 ? 3 : 7)
  server.cardSnapshot({ turnDeadline: new Date(Date.now() + 30000).toISOString() })
  await page.evaluate(now => { Date.now = () => now }, Date.now())
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.46))
  await expect(panel(page).getByRole('button', { name: '하트 4', exact: true })).toBeEnabled()
  return server
}
async function beginDrag(page: Page, card: Locator, dx: number, dy: number) {
  const b = (await card.boundingBox())!, x = b.x + b.width / 2, y = b.y + b.height * .45
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 9 })
}
function afterPlay(server: Awaited<ReturnType<typeof fixture>>, rank = '4'): Hand {
  const hand = server.cardHand()
  return { ...hand, hand: hand.hand.filter(c => c.id !== `hearts-${rank}`), playableCardIds: [], canDraw: false }
}

test('clicking the visible deck draws once, advances the turn and animates approved backs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const server = await start(page), hand = server.cardHand()
  await expect.poll(async () => (await deck(page)).exposed).toBe(true)
  const next = { ...hand, hand: [...hand.hand, { id: 'spades-8', suit: 'spades', rank: '8' } as Card], playableCardIds: [], canDraw: false }
  server.cardReply({ kind: 'draw' }, { drawCount: server.cardState().drawCount - 1, turnUserId: '102', turnCount: 2,
    players: server.cardState().players.map(p => p.userId === '101' ? { ...p, cardCount: 8 } : p) }, next)
  const target = await deck(page); await page.mouse.click(target.x, target.y)
  await expect(cards(page)).toHaveCount(8)
  await expect.poll(async () => (await deck(page)).flight).toBe(true)
  await expect.poll(async () => (await deck(page)).allowed).toBe(false)
  await page.mouse.click(target.x, target.y)
  expect(actions(server)).toEqual([{ kind: 'draw' }])
  await expect.poll(async () => (await deck(page)).flight).toBe(false)
  await screenshot(page, 'onecard-deck-draw')
})

test('dragging up plays one card; a short pull, sideways pull, Escape and cancellation send nothing', async ({ page }) => {
  const server = await start(page), king = panel(page).getByRole('button', { name: '하트 K · 한 장 더 내기', exact: true })
  await beginDrag(page, king, 0, -25); await page.mouse.up()
  await expect(king).toHaveAttribute('aria-pressed', 'true')
  await beginDrag(page, king, 270, -120); await page.mouse.up()
  await beginDrag(page, king, 0, -120); await page.keyboard.press('Escape'); await page.mouse.up()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await beginDrag(page, king, 0, -120); await king.dispatchEvent('pointercancel'); await page.mouse.up()
  expect(actions(server)).toEqual([])
  const next = afterPlay(server)
  server.cardReply({ kind: 'play', cardId: 'hearts-4' }, { topCard: { id: 'hearts-4', suit: 'hearts', rank: '4' }, turnUserId: '102', turnCount: 2,
    players: server.cardState().players.map(p => p.userId === '101' ? { ...p, cardCount: 6 } : p) }, next)
  const four = panel(page).getByRole('button', { name: '하트 4', exact: true })
  await beginDrag(page, four, 10, -130)
  await expect(panel(page).getByText('놓으면 카드를 내요', { exact: true })).toBeVisible()
  expect(await four.evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42)).toBeLessThan(-100)
  await screenshot(page, 'onecard-drag-ready')
  await page.mouse.up()
  await expect(cards(page)).toHaveCount(6)
  await expect.poll(async () => (await deck(page)).publicCard).toBe('hearts-4')
  expect(actions(server)).toEqual([{ kind: 'play', cardId: 'hearts-4' }])
  await screenshot(page, 'onecard-drag-played')
})

test('an empty deck remains a server-approved draw target without inventing a local reshuffle', async ({ page }) => {
  const server = await start(page), hand = server.cardHand()
  server.cardSnapshot({ drawCount: 0 })
  await expect.poll(async () => (await deck(page)).exposed && (await deck(page)).allowed).toBe(true)
  const next = { ...hand, hand: [...hand.hand, { id: 'clubs-8', suit: 'clubs', rank: '8' } as Card], playableCardIds: [], canDraw: false }
  server.cardReply({ kind: 'draw' }, { drawCount: 12, turnUserId: '102', turnCount: 2,
    players: server.cardState().players.map(p => p.userId === '101' ? { ...p, cardCount: 8 } : p) }, next)
  const target = await deck(page); await page.mouse.click(target.x, target.y)
  await expect(cards(page)).toHaveCount(8)
  expect(actions(server)).toEqual([{ kind: 'draw' }])
})

test('a changed turn cancels an in-flight drag and a rejected play retains the real hand', async ({ page }) => {
  const server = await start(page), four = panel(page).getByRole('button', { name: '하트 4', exact: true })
  await beginDrag(page, four, 0, -130)
  server.cardSnapshot({ turnUserId: '102', turnCount: 2 })
  await expect(four).toBeDisabled(); await page.mouse.up()
  expect(actions(server)).toEqual([])
  server.cardSnapshot({ turnUserId: '101', turnCount: 3 }); await expect(four).toBeEnabled()
  server.rejectNextAction('GAME_ACTION_INVALID_ACTION', '이 카드는 지금 낼 수 없어요.')
  await beginDrag(page, four, 0, -130); await page.mouse.up()
  await expect(panel(page).getByRole('alert')).toHaveText('이 카드는 지금 낼 수 없어요.')
  await expect(cards(page)).toHaveCount(7)
  expect((await deck(page)).publicCard).toBe('hearts-5')
  expect(actions(server)).toEqual([{ kind: 'play', cardId: 'hearts-4' }])
})

test('the deck accepts an attack and stale ACKs/recovery/expiry never allow extra draws', async ({ page }) => {
  const server = await start(page), hand = server.cardHand()
  server.cardSnapshot({ attackTotal: 2, lastAttack: { id: 'clubs-2', suit: 'clubs', rank: '2' } })
  const next = { ...hand, hand: [...hand.hand, ...['3', '8'].map(rank => ({ id: `spades-${rank}`, suit: 'spades' as const, rank }))], playableCardIds: [], canDraw: false }
  server.holdState(true)
  server.cardReply({ kind: 'accept-attack' }, { attackTotal: 0, lastAttack: null, turnUserId: '102', turnCount: 2,
    players: server.cardState().players.map(p => p.userId === '101' ? { ...p, cardCount: 9 } : p) }, next)
  await expect.poll(async () => (await deck(page)).exposed).toBe(true)
  let target = await deck(page); await page.mouse.click(target.x, target.y)
  await expect(panel(page)).toContainText('최신 판과 손패를 기다리고 있습니다.')
  await expect(cards(page)).toHaveCount(0)
  await page.mouse.click(target.x, target.y)
  server.holdState(false); server.flushGame()
  await expect(cards(page)).toHaveCount(8)
  server.cardSnapshot({ turnUserId: '101', turnCount: 3 }, { ...next, canDraw: true })
  server.recoveryPending(); await expect(cards(page)).toHaveCount(0)
  target = await deck(page); await page.mouse.click(target.x, target.y)
  server.restoreGame(); await expect(cards(page)).toHaveCount(8)
  server.cardSnapshot({ turnDeadline: new Date(Date.now() - 60000).toISOString() })
  await expect(panel(page).getByRole('button', { name: '한 장 뽑고 넘기기', exact: true })).toBeDisabled()
  target = await deck(page); await page.mouse.click(target.x, target.y)
  expect(actions(server)).toEqual([{ kind: 'accept-attack' }])
})

test.describe('touch hand', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test('a touch drag plays without scrolling; reduced motion keeps the same controls', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const server = await start(page), next = afterPlay(server)
    server.cardReply({ kind: 'play', cardId: 'hearts-4' }, { topCard: { id: 'hearts-4', suit: 'hearts', rank: '4' }, turnUserId: '102', turnCount: 2,
      players: server.cardState().players.map(p => p.userId === '101' ? { ...p, cardCount: 6 } : p) }, next)
    const card = panel(page).getByRole('button', { name: '하트 4', exact: true }), b = (await card.boundingBox())!
    const x = b.x + b.width / 2, y = b.y + b.height * .45, session = await page.context().newCDPSession(page)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 5, y: y - 115 }] })
    await expect(panel(page).getByText('놓으면 카드를 내요', { exact: true })).toBeVisible()
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(async () => (await deck(page)).publicCard).toBe('hearts-4')
    expect(actions(server)).toEqual([{ kind: 'play', cardId: 'hearts-4' }])
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY, overflow: document.documentElement.scrollWidth > innerWidth }))).toEqual({ x: 0, y: 0, overflow: false })
    const action = await panel(page).getByRole('group', { name: '원카드 행동', exact: true }).boundingBox()
    expect(action!.x).toBeGreaterThanOrEqual(0); expect(action!.x + action!.width).toBeLessThanOrEqual(390)
    await screenshot(page, 'onecard-touch')
  })
})
