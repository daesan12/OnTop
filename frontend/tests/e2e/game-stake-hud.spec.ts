import { expect, test, type Page } from '@playwright/test'
import { TABLES } from '../../src/config'
import { benchTable } from '../../src/features/interactions/benchSpectator'
import { facilityCatalog } from '../fixtures/facilityCatalog'
import { generatedFacilityCatalog } from '../park-integration/fixture'
import { bridgeState } from '../fixtures/bridge'
import { halliState } from '../fixtures/halligalli'
import { ledgerState } from '../fixtures/ledger'
import { fixture } from './contractFixture'

// S15P31B105-336: the common turn card shows "게임명 · 총 판돈" without changing the card or any other game HUD box.
const names = { '101': { nickname: '사과' }, '102': { nickname: '바나나왕' }, '103': { nickname: '라임' }, '104': { nickname: '자두할매' }, '505': { nickname: '구경꾼' } }
const future = () => new Date(Date.now() + 600_000).toISOString()
const hand = ['4', '7', 'K', 'Q', 'J', '2', 'A'].map(rank => ({ id: `hearts-${rank}`, suit: 'hearts', rank }))
const omokState = (status = 'PLAYING') => ({ gameCode: 'OMOK', status, boardSize: 15, board: Array.from({ length: 15 }, () => Array(15).fill(0)),
  blackUserId: '101', whiteUserId: '102', turnUserId: status === 'PLAYING' ? '101' : null, turnDeadline: status === 'PLAYING' ? future() : null, moveCount: 0, lastMove: null,
  winnerUserId: status === 'PLAYING' ? null : '101', endReason: status === 'PLAYING' ? null : 'FORFEIT', endedAt: status === 'PLAYING' ? null : new Date().toISOString() })
const GAMES = {
  omok: { name: '오목', code: 'OMOK', players: 2, state: () => omokState() },
  dice: { name: '주사위 한 판', code: 'DICE', players: 4, state: () => ({ gameCode: 'DICE', status: 'PLAYING', players: ['101', '102', '103', '104'], scores: [0, 350, 1200, 0],
    targetScore: 4000, turnTimeLimitMs: 30000, turnUserId: '101', turnDeadline: future(), turnScore: 0, dice: [], stage: 'AWAITING_ROLL', rollId: 0, round: 1,
    hotDice: false, lastEvent: 'START', winnerUserId: null, endReason: null, endedAt: null }) },
  onecard: { name: '원카드', code: 'ONE_CARD', players: 4, state: () => ({ gameCode: 'ONE_CARD', status: 'PLAYING', players: ['101', '102', '103', '104'].map(userId =>
    ({ userId, cardCount: 7, active: true, oneCardUntil: null, oneCardStatus: 'none' })), turnUserId: '101', turnDeadline: future(), turnTimeLimitMs: 30000, direction: 1,
    stage: 'PLAYING', extraAction: false, topCard: { id: 'hearts-5', suit: 'hearts', rank: '5' }, activeSuit: 'hearts', drawCount: 25, attackTotal: 0, lastAttack: null,
    turnCount: 1, winnerUserIds: [], endReason: null, endedAt: null }), secret: () => ({ userId: '101', hand, playableCardIds: hand.map(c => c.id), canDraw: true }) },
  bridge: { name: '거짓말 다리', code: 'LIAR_BRIDGE', players: 4, state: () => bridgeState(4) },
  ledger: { name: '주사위 장부', code: 'DICE_LEDGER', players: 4, state: () => ({ ...ledgerState(4), turnDeadline: future() }) },
  halli: { name: '과일 땡', code: 'HALLI_GALLI', players: 4, state: () => halliState(4, { flipDeadline: future() }) },
} as const satisfies Record<string, { name: string; code: string; players: number; state: () => object; secret?: () => object }>

const normalOperations = (page: Page) => page.route('**/api/v1/operations/status', route => route.fulfill({ json: { mode: 'NORMAL', notice: '',
  maintenanceStartedAt: null, expectedOpenAt: null, version: 1, updatedAt: new Date().toISOString(), serverTime: new Date().toISOString() } }))
async function openPark(page: Page) {
  await normalOperations(page)
  await page.route('**/api/v1/notifications?*', route => route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } }))
  await page.route('**/api/v1/events/winnings/me?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: [] }))
  await page.route('**/api/v1/skins/assets', route => route.fulfill({ json: [] }))
  await page.goto('/park'); await expect(page).toHaveTitle(/온탑|OnTop/i)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().tables.length), { timeout: 90000 }).toBeGreaterThan(0)
  await expect(page.locator('canvas')).toBeVisible({ timeout: 90000 })
  await expect(page.getByText('공원을 준비하고 있어요…', { exact: true })).toBeHidden({ timeout: 90000 })
}

for (const key of ['omok', 'onecard'] as const) test(`${key} 관전자 판돈 카드는 작은 화면에서도 총액과 1인 판돈을 표시한다`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`) })
  const g = GAMES[key]
  await fixture(page, { players: 4, publicProfiles: names, ownUserId: '505' }); await openPark(page)
  await sendTable(page, 'TABLE_WATCH_STATE', g.code, g.players, 1250)
  await sendGame(page, 'SPECTATOR', g.state(), {}, 5)
  const stake = page.getByRole('status', { name: '관전 경기 판돈', exact: true })
  const amount = stake.locator('strong')
  await expect(amount).toHaveText(`${(1250 * g.players).toLocaleString('ko-KR')}냥`)
  await expect(stake).toContainText(`1인 1,250냥 × ${g.players}명`)
  for (const viewport of [{ width: 1280, height: 720 }, { width: 960, height: 540 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await expect(stake).toBeVisible()
    expect(await stake.evaluate(element => {
      const r = element.getBoundingClientRect()
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
        && element.scrollWidth <= element.clientWidth + 1
    })).toBe(true)
    expect(await stake.evaluate(element => {
      const r = element.getBoundingClientRect(), html = element as HTMLElement
      const previous = html.style.pointerEvents
      html.style.pointerEvents = 'auto'
      const exposed = [0.25, 0.75].every(y => [0.25, 0.75].every(x =>
        element.contains(document.elementFromPoint(r.left + r.width * x, r.top + r.height * y))))
      html.style.pointerEvents = previous
      return exposed
    })).toBe(true)
    const directory = process.env.QA_ARTIFACT_DIR
    if (directory) {
      const { mkdir } = await import('node:fs/promises')
      await mkdir(directory, { recursive: true })
      await page.screenshot({ path: `${directory}/spectator-stakes-${key}-${viewport.width}.png` })
    }
  }
  await sendTable(page, 'TABLE_WATCH_STATE', g.code, g.players, Math.floor(Number.MAX_SAFE_INTEGER / 4))
  await expect(amount).toContainText(',')
  expect(await stake.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await sendTable(page, 'TABLE_WATCH_STATE', g.code, g.players, 0)
  await expect(amount).toHaveText('0냥')
  await sendTable(page, 'TABLE_WATCH_STATE', g.code, g.players, 9999, 'another-game')
  await expect(amount).toHaveText('확인 중')
  await expect(stake).not.toContainText('9,999')
  await expect(page.getByRole('button', { name: '기권', exact: true })).toHaveCount(0)
  await page.evaluate(async () => {
    const { resetGame } = await import('/src/game/store.ts' as string)
    resetGame()
  })
  await expect(stake).toHaveCount(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
let tableVersion = 300
/** TABLE_STATE (participant) or TABLE_WATCH_STATE (spectator) through the real client parser. */
const sendTable = (page: Page, type: 'TABLE_STATE' | 'TABLE_WATCH_STATE', code: string, players: number, bet: number, gameId = 'stake-e2e') =>
  page.evaluate(async ([type, code, players, bet, gameId, version, anchorId]) => {
    const w = await import('/src/network/worldClient.ts' as string), s = w.useSession.getState()
    const tableId = s.bindings.find((b: { anchorId: string; channelId: string }) => b.anchorId === anchorId && b.channelId === s.roomId)?.tableId
    const seats = [1, 2, 3, 4].map(n => ({ seatNumber: n, userId: n <= players ? String(100 + n) : null, ready: n <= players }))
    w.receive({ type, requestId: null, payload: { tableId, version, capacity: 4, minimumPlayers: 2, seats, allReady: true, selectedPlayers: null, startMode: 'AUTO',
      selectorUserId: '101', gameCode: code, targetScore: code === 'DICE' ? 4000 : null, betAmountPerPlayer: bet, gameId } })
  }, [type, code, players, bet, gameId, ++tableVersion, TABLES[0]!.id] as const)
const sendGame = (page: Page, role: 'PLAYER' | 'SPECTATOR', publicState: object, privateState: object, version: number) =>
  page.evaluate(async ([role, publicState, privateState, version]) => {
    const store = await import('/src/game/store.ts' as string), s = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    const code = (publicState as { gameCode: string }).gameCode
    if (role === 'PLAYER') store.receiveGame({ type: 'GAME_CONNECTION_STATE', requestId: null, payload: { status: 'RESTORED', gameId: 'stake-e2e', version,
      state: ['OMOK', 'DICE'].includes(code) ? publicState : { publicState, privateState } } }, s.sessionId, s.tableId)
    else {
      store.useGame.setState({ watchedGameId: 'stake-e2e' })
      store.receiveGame({ type: 'GAME_STATE', requestId: null, payload: { gameId: 'stake-e2e', version, role, publicState, privateState: {} } }, '505', '')
    }
  }, [role, publicState, privateState, version] as const)
/** The turn card, its eyebrow line, the game-name text width, and every other fixed/absolute HUD box. */
const layout = (page: Page) => page.evaluate(async () => {
  await document.fonts.ready
  const box = (el: Element) => { const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] }
  const clock = document.querySelector('.game-hud-clock')!, eyebrow = clock.querySelector('.game-hud-eyebrow')!, stake = clock.querySelector<HTMLElement>('.game-hud-stake')
  const nameNode = [...(eyebrow.querySelector('.game-hud-title') ?? eyebrow).childNodes].find(n => n.nodeType === 3 && n.textContent!.trim())!
  const range = document.createRange(); range.selectNodeContents(nameNode)
  const others: string[] = []
  for (const el of document.querySelectorAll<HTMLElement>('.park-page *')) {
    // Avatar name tags follow the 3D scene and the park scene notice comes and goes on its own; neither is game HUD layout.
    if (el.closest('canvas,.game-hud-clock,.avatar-overlays,.park-scene-message')) continue
    const st = getComputedStyle(el); if (!['fixed', 'absolute'].includes(st.position) || st.display === 'none') continue
    const b = el.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue
    others.push(`${el.tagName}.${typeof el.className === 'string' ? el.className : ''}@${box(el).join(',')}`)
  }
  const inner = eyebrow.getBoundingClientRect(), card = clock.getBoundingClientRect(), pad = parseFloat(getComputedStyle(clock).paddingRight)
  return { clock: box(clock), eyebrowHeight: Math.round(inner.height), nameWidth: Math.round(range.getBoundingClientRect().width), nameLines: range.getClientRects().length,
    insideCard: inner.right <= card.right - pad + 0.5, stakeTruncated: !!stake && stake.scrollWidth > stake.clientWidth, others: others.sort() }
})
/** Opening deals and intros move seats for a moment; compare only a layout that holds still across two samples. */
async function settled(page: Page) {
  let previous = await layout(page)
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(400)
    const next = await layout(page)
    if (JSON.stringify(next) === JSON.stringify(previous)) return next
    previous = next
  }
  return previous
}

for (const role of ['PLAYER', 'SPECTATOR'] as const) for (const [key, g] of Object.entries(GAMES)) {
  test(`${key} ${role}: 게임 이름 옆 총 판돈 표시, 카드와 기존 HUD 유지`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width: 1920, height: 1080 })
    await fixture(page, { players: 4, publicProfiles: names, ...(role === 'SPECTATOR' ? { ownUserId: '505' as const } : {}) }); await openPark(page)
    const tableType = role === 'PLAYER' ? 'TABLE_STATE' : 'TABLE_WATCH_STATE'
    await sendTable(page, tableType, g.code, g.players, 0)
    await sendGame(page, role, g.state(), role === 'PLAYER' && 'secret' in g ? g.secret() : {}, 5)
    const eyebrow = page.locator('.game-hud-clock .game-hud-eyebrow'), stake = eyebrow.locator('.game-hud-stake')
    await expect(eyebrow).toHaveText(g.name, { timeout: 60000 })
    await page.waitForTimeout(2500)
    for (const [width, height] of [[1920, 1080], [1366, 768]] as const) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(800)
      await sendTable(page, tableType, g.code, g.players, 0); await expect(stake).toHaveCount(0)
      const before = await settled(page)
      await sendTable(page, tableType, g.code, g.players, 100)
      await expect(eyebrow).toHaveText(`${g.name}\u00a0· ${(100 * g.players).toLocaleString('ko-KR')}냥`)
      expect(await stake.evaluate(el => { const a = getComputedStyle(el), b = getComputedStyle(el.closest('.game-hud-eyebrow')!)
        return [a.fontFamily, a.fontSize, a.fontWeight, a.color, a.letterSpacing].join('|') === [b.fontFamily, b.fontSize, b.fontWeight, b.color, b.letterSpacing].join('|') })).toBe(true)
      const shown = await settled(page)
      expect(shown.clock).toEqual(before.clock); expect(shown.eyebrowHeight).toBe(before.eyebrowHeight)
      expect(shown.nameWidth).toBe(before.nameWidth); expect(shown.others).toEqual(before.others); expect(shown.insideCard).toBe(true)
      // An extreme (still safe-integer) pot shortens only the stake text; the card, line and game name stay as they were.
      await sendTable(page, tableType, g.code, g.players, Math.floor(Number.MAX_SAFE_INTEGER / 4))
      await expect(stake).toContainText(',')
      const huge = await settled(page)
      expect(huge.clock).toEqual(before.clock); expect(huge.eyebrowHeight).toBe(before.eyebrowHeight)
      expect(huge.nameWidth).toBe(before.nameWidth); expect(huge.nameLines).toBe(1); expect(huge.insideCard).toBe(true)
    }
    // At 999px and below only the stake text disappears; the narrow card keeps its name and size.
    await page.setViewportSize({ width: 999, height: 700 }); await page.waitForTimeout(800)
    await sendTable(page, tableType, g.code, g.players, 0); await expect(stake).toHaveCount(0)
    const narrow = await settled(page)
    await sendTable(page, tableType, g.code, g.players, 100)
    await expect(stake).toBeHidden(); await expect(eyebrow).toContainText(g.name)
    const narrowShown = await settled(page)
    expect(narrowShown.clock).toEqual(narrow.clock); expect(narrowShown.nameWidth).toBe(narrow.nameWidth); expect(narrowShown.others).toEqual(narrow.others)
    // Another game's table state never lends its bet to this match.
    await page.setViewportSize({ width: 1920, height: 1080 })
    await sendTable(page, tableType, g.code, g.players, 100, 'other-game'); await expect(stake).toHaveCount(0); await expect(eyebrow).toHaveText(g.name)
    expect(errors).toEqual([])
  })
}

test('오목 경기가 끝나면 판돈 표시를 숨긴다', async ({ page }) => {
  await fixture(page, { players: 4, publicProfiles: names, ownUserId: '505' }); await openPark(page)
  await sendTable(page, 'TABLE_WATCH_STATE', 'OMOK', 2, 300)
  await sendGame(page, 'SPECTATOR', omokState(), {}, 5)
  await expect(page.locator('.game-hud-clock .game-hud-eyebrow')).toHaveText('오목\u00a0· 600냥', { timeout: 60000 })
  // The table state still names this match here, so the hide comes from the finished game state itself.
  await sendGame(page, 'SPECTATOR', omokState('FINISHED'), {}, 6)
  await expect(page.locator('.game-hud-stake')).toHaveCount(0)
})

test('공개 관전 입장 경로의 TABLE_WATCH_STATE 판돈으로 같은 총액을 표시한다', async ({ page }) => {
  const catalog = test.info().project.metadata.generatedPark ? generatedFacilityCatalog : facilityCatalog
  const bench = catalog.facilities.find(f => f.kind === 'BENCH' && benchTable(f.facilityId)?.pavilionId === 'P1')!
  const anchor = benchTable(bench.facilityId)!
  await fixture(page, { omok: true, ownUserId: '505', players: 4, publicSpectator: true, onecard: 4, manualMovement: true, position: bench.center, anchorId: anchor.id })
  await openPark(page)
  await expect.poll(() => page.evaluate(async () => {
    const session = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    return session.status === 'connected' && session.bindings.length > 0
  }), { timeout: 20000 }).toBe(true)
  await expect.poll(() => page.evaluate(async () => (await import('/src/features/facilities/state.ts' as string)).useFacilityState.getState().ready)).toBe(true)
  expect(await page.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id, 0), bench.facilityId)).toBe(true)
  await page.getByRole('button', { name: '가까이 관전', exact: true }).click()
  await expect.poll(() => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game?.role)).toBe('SPECTATOR')
  // The fixture's public table carries a 1냥 per-player bet and four one-card participants.
  await expect(page.locator('.game-hud-clock .game-hud-eyebrow')).toHaveText('원카드\u00a0· 4냥', { timeout: 30000 })
  const stake = page.getByRole('status', { name: '관전 경기 판돈', exact: true })
  await expect(stake.locator('strong')).toHaveText('4냥')
  await expect(stake).toContainText('1인 1냥 × 4명')
  await page.locator('.game-hud-menu summary').click()
  await page.getByRole('button', { name: '관전 종료', exact: true }).click()
  await expect(stake).toHaveCount(0)
})
