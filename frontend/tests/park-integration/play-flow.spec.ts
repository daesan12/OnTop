import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'
import { PARK_MAP_VERSION } from '../../src/map/park/generated/mapVersion'

const runtimeErrors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []; runtimeErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
})
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

async function start(page: Page, code: 'OMOK' | 'ONE_CARD', count: 2 | 4 = 4) {
  const server = await fixture(page, { generatedPark: true, omok: true, manualLobby: true, tabletServer: true,
    spectatorEvents: true,
    ...(code === 'ONE_CARD' ? { onecard: count, players: count } : {}),
    publicProfiles: { '101': { nickname: '나' }, '102': { nickname: '솔바람' } } })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page).toHaveURL(/\/park$/)
  await expect.poll(() => page.evaluate(async () => {
    const { GENERATED_PARK_ENABLED } = await import('/src/park/mapSelection.ts' as string)
    const { sceneReady, probe } = await import('/tests/park-integration/probe.ts' as string)
    return sceneReady() ? { enabled: GENERATED_PARK_ENABLED, identity: probe().identity } : null
  }), { timeout: 90000 }).toEqual({ enabled: true, identity: { mapId: 'park', schemaVersion: 2, mapVersion: PARK_MAP_VERSION } })
  expect(server.sent.find(message => message.type === 'WORLD_MAP_CONFIRM')?.payload)
    .toEqual({ mapId: 'park', schemaVersion: 2, mapVersion: PARK_MAP_VERSION })
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await expect(tablet).toBeVisible({ timeout: 20000 })
  await tablet.locator(`.tablet-game-card:has([data-game="${code}"])`).click()
  if (code === 'ONE_CARD' && count > 2) await tablet.getByRole('button', { name: `${count}인`, exact: true }).click()
  await tablet.getByLabel('1인 참가비').fill('1')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox').check()
  await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true)
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  const panel = page.getByRole('region', { name: code === 'OMOK' ? '오목 경기' : '원카드 경기', exact: true })
  await expect(panel).toBeVisible()
  return { server, panel }
}

for (const code of ['OMOK', 'ONE_CARD'] as const) test(`play flow ${code}: responsive review`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const { panel } = await start(page, code)
  await page.waitForTimeout(700)
  await screenshot(page, `play-flow-${code.toLowerCase()}-desktop`)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(700)
  await expect(panel).toBeVisible()
  await screenshot(page, `play-flow-${code.toLowerCase()}-mobile`)
  expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

test('new-map card drag, visible deck and forfeit cancellation preserve server authority', async ({ page }) => {
  const { server, panel } = await start(page, 'ONE_CARD')
  const king = panel.getByRole('button', { name: '하트 K · 한 장 더 내기', exact: true })
  const bounds = (await king.boundingBox())!, x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height * .45
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 120, { steps: 8 })
  await page.keyboard.press('Escape'); await page.mouse.up()
  expect(server.sent.some(message => message.type === 'GAME_ACTION_SEND')).toBe(false)
  await expect(page.getByRole('dialog', { name: '기권하시겠습니까?', exact: true })).toBeHidden()
  const hand = server.cardHand(), card = hand.hand.find(item => item.id === 'hearts-K')!
  const after = { ...hand, hand: hand.hand.filter(item => item.id !== card.id), playableCardIds: hand.playableCardIds.filter(id => id !== card.id) }
  server.cardReply({ kind: 'play', cardId: card.id }, { topCard: card, extraAction: true,
    players: server.cardState().players.map(player => player.userId === '101' ? { ...player, cardCount: 6 } : player) }, after)
  const nextBounds = (await king.boundingBox())!, nextX = nextBounds.x + nextBounds.width / 2, nextY = nextBounds.y + nextBounds.height * .45
  await page.mouse.move(nextX, nextY); await page.mouse.down(); await page.mouse.move(nextX, nextY - 220, { steps: 10 }); await page.mouse.up()
  await expect(panel.getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(6)
  const deck = () => page.evaluate(async () => (await import('/tests/e2e/onecardSceneProbe.ts' as string)).oneCardDeckTarget())
  await expect.poll(async () => (await deck()).exposed).toBe(true)
  const drawn = { ...after, hand: [...after.hand, { id: 'spades-8', suit: 'spades' as const, rank: '8' }], playableCardIds: [], canDraw: false }
  server.cardReply({ kind: 'draw' }, { extraAction: false, turnUserId: '102', turnCount: 2,
    players: server.cardState().players.map(player => player.userId === '101' ? { ...player, cardCount: 7 } : player) }, drawn)
  const target = await deck(); await page.mouse.click(target.x, target.y)
  await expect(panel.getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(7)
  await page.mouse.click(target.x, target.y)
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND').map(message => message.payload.input))
    .toEqual([{ kind: 'play', cardId: card.id }, { kind: 'draw' }])
  await page.getByLabel('3D 공원', { exact: true }).locator('canvas').focus(); await page.keyboard.press('Escape')
  const dialog = page.getByRole('dialog', { name: '기권하시겠습니까?', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '계속 플레이', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(server.sent.some(message => message.type === 'GAME_FORFEIT')).toBe(false)
  server.cardSnapshot({ turnUserId: '101', turnDeadline: new Date(Date.now() - 100).toISOString() }, { ...drawn, canDraw: true })
  await expect(panel.getByLabel('선택 카드 안내')).toContainText('시간이 끝났어요')
  await expect(panel.getByRole('button', { name: '한 장 뽑고 넘기기', exact: true })).toBeDisabled()
  expect((await deck()).allowed).toBe(false)
})

for (const code of ['OMOK', 'ONE_CARD'] as const) test(`new-map ${code}: settlement, next game and approved exit`, async ({ page }) => {
  const { server } = await start(page, code, 2)
  server.finishGame()
  if (code === 'ONE_CARD') server.cardSnapshot({ status: 'FINISHED', stage: 'FINISHED', turnUserId: null,
    turnDeadline: null, endedAt: new Date().toISOString(), winnerUserIds: ['101'], endReason: 'EMPTY_HAND' })
  server.settle(); server.nextRound(); server.restoreGame()
  const result = page.getByRole('dialog', { name: '경기 결과', exact: true })
  await expect(result.getByRole('button', { name: '다음 판 준비', exact: true })).toBeEnabled()
  await result.getByRole('button', { name: '다음 판 준비', exact: true }).click()
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await expect(tablet).toBeVisible(); await expect(result).toHaveCount(0)
  await tablet.getByRole('button', { name: '게임·판돈 변경', exact: true }).click()
  const next = code === 'OMOK' ? 'ONE_CARD' : 'OMOK'
  await tablet.locator(`.tablet-game-card:has([data-game="${next}"])`).click()
  await tablet.getByRole('button', { name: '선택하고 준비하기', exact: true }).click()
  await expect(tablet).toHaveAttribute('data-stage', 'ready')
  expect(server.sent.filter(message => message.type === 'TABLE_CONFIGURE').at(-1)?.payload.gameCode).toBe(next)
  await screenshot(page, `new-map-${code.toLowerCase()}-next-round`)
  await tablet.getByRole('button', { name: '일어나기', exact: true }).click()
  await expect(tablet).toBeHidden()
  expect(server.sent.filter(message => message.type === 'TABLE_LEAVE')).toHaveLength(1)
})

test('omok keyboard navigation has one tab stop, submits once and protects occupied/opponent cells', async ({ page }) => {
  const { server, panel } = await start(page, 'OMOK')
  await panel.getByText('키보드로 오목판 조작', { exact: true }).click()
  const board = panel.getByRole('group', { name: '오목판', exact: true })
  await expect(board.locator('button[tabindex="0"]')).toHaveCount(1)
  await board.getByRole('button', { name: '8행 8열 빈칸', exact: true }).focus()
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown')
  const cell = board.getByRole('button', { name: '9행 9열 빈칸', exact: true })
  await expect(cell).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(board.getByRole('button', { name: '9행 9열 흑돌', exact: true })).toHaveAttribute('aria-current', 'true')
  await page.keyboard.press('Enter')
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND')).toHaveLength(1)
  await page.keyboard.press('Home')
  await expect(board.getByRole('button', { name: '9행 1열 빈칸', exact: true })).toBeFocused()
  await page.keyboard.press('End')
  await expect(board.getByRole('button', { name: '9행 15열 빈칸', exact: true })).toBeFocused()
  await page.keyboard.press('Control+Home'); await page.keyboard.press('ArrowLeft')
  await expect(board.getByRole('button', { name: '1행 1열 빈칸', exact: true })).toBeFocused()
  server.turnTo('102')
  await expect(panel).toContainText('상대 차례')
  await page.keyboard.press('Space')
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND')).toHaveLength(1)
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('button', { name: '게임 설명 · F1', exact: true })).toBeFocused()
  await screenshot(page, 'omok-keyboard-navigation')
})

test('mobile omok chat no longer covers game controls and Enter/Escape open and close the composer', async ({ page }) => {
  const { server, panel } = await start(page, 'OMOK')
  await page.setViewportSize({ width: 390, height: 844 })
  const chat = page.getByRole('form', { name: '오목 경기 채팅', exact: true })
  const input = chat.getByRole('textbox')
  await expect(input).toBeHidden()
  await expect(chat.getByRole('button', { name: '경기 채팅 열기' })).toHaveAttribute('aria-expanded', 'false')
  const before = server.sent.filter(message => message.type === 'GAME_STATE_CHECK').length
  await panel.getByRole('button', { name: '최신 판 확인', exact: true }).click()
  await expect.poll(() => server.sent.filter(message => message.type === 'GAME_STATE_CHECK').length).toBe(before + 1)
  await chat.getByRole('button', { name: '경기 채팅 열기' }).click()
  await expect(input).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(input).toBeHidden()
  await page.getByLabel('3D 공원', { exact: true }).locator('canvas').focus(); await page.keyboard.press('Enter')
  await expect(input).toBeFocused()
  await chat.getByRole('button', { name: '채팅 닫기', exact: true }).click()
  await expect(input).toBeHidden()
  await screenshot(page, 'omok-mobile-clear-controls')
})

test('one-card clears offscreen selections and guides suit choice, opponent turns and attack response', async ({ page }) => {
  const { server, panel } = await start(page, 'ONE_CARD')
  await page.setViewportSize({ width: 390, height: 844 })
  await panel.getByRole('button', { name: '하트 4', exact: true }).click()
  await expect(panel.getByRole('button', { name: '하트 4 내기', exact: true })).toBeEnabled()
  await panel.getByRole('button', { name: '다음 손패', exact: true }).click()
  await expect(panel.getByRole('button', { name: '카드를 선택하세요', exact: true })).toBeDisabled()
  await panel.getByRole('button', { name: '이전 손패', exact: true }).click()
  await panel.getByRole('button', { name: '하트 4', exact: true }).click()
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(panel.getByRole('button', { name: '카드를 선택하세요', exact: true })).toBeDisabled()
  await page.setViewportSize({ width: 390, height: 844 })
  const hand = server.cardHand(), seven = hand.hand.find(card => card.id === 'hearts-7')!
  const after = { ...hand, hand: hand.hand.filter(card => card.id !== seven.id), playableCardIds: [], canDraw: false }
  server.cardReply({ kind: 'play', cardId: seven.id }, { stage: 'CHOOSE_SUIT', topCard: seven,
    players: server.cardState().players.map(player => player.userId === '101' ? { ...player, cardCount: 6 } : player) }, after)
  await panel.getByRole('button', { name: '하트 7 · 무늬 선택', exact: true }).click()
  await panel.getByRole('button', { name: '하트 7 내기', exact: true }).click()
  await expect(panel.getByLabel('선택 카드 안내')).toContainText('무늬를 선택해주세요')
  const suits = panel.getByRole('group', { name: '무늬 선택', exact: true })
  for (const button of await suits.getByRole('button').all()) await expect(button).toBeInViewport()
  await expect(panel.getByRole('button', { name: '한 장 뽑고 넘기기', exact: true })).toHaveCount(0)
  await screenshot(page, 'onecard-mobile-suit-choice')
  server.cardReply({ kind: 'select-suit', suit: 'spades' }, { stage: 'PLAYING', activeSuit: 'spades', turnUserId: '102', turnCount: 2 }, after)
  await suits.getByRole('button', { name: '스페이드 선택', exact: true }).click()
  await expect(panel.getByLabel('선택 카드 안내')).toContainText('솔바람의 차례')
  await expect(panel.getByRole('timer')).toContainText('솔바람의 차례')
  await expect(panel.getByRole('button', { name: '한 장 뽑고 넘기기', exact: true })).toBeDisabled()
  server.cardSnapshot({ turnUserId: '101', attackTotal: 5, lastAttack: { id: 'spades-A', rank: 'A', suit: 'spades' }, turnDeadline: new Date(Date.now() + 30000).toISOString() }, after)
  await expect(panel.getByLabel('선택 카드 안내')).toContainText('공격 +5장')
  await expect(panel.getByRole('button', { name: '공격 받기 · +5장', exact: true })).toBeEnabled()
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND').map(message => message.payload.input))
    .toEqual([{ kind: 'play', cardId: seven.id }, { kind: 'select-suit', suit: 'spades' }])
})

test('one-card promotes the declaration window, explains draw-only turns and recovers a rejected action', async ({ page }) => {
  const { server, panel } = await start(page, 'ONE_CARD')
  await page.setViewportSize({ width: 390, height: 844 })
  const hand = server.cardHand(), until = new Date(Date.now() + 30000).toISOString()
  const single = { ...hand, hand: [hand.hand[0]!], playableCardIds: [], canDraw: false }
  const players = server.cardState().players.map(player => player.userId === '101'
    ? { ...player, cardCount: 1, oneCardStatus: 'pending' as const, oneCardUntil: until } : player)
  server.cardSnapshot({ turnUserId: '102', players }, single)
  const declare = panel.getByRole('button', { name: /^원카드!/ })
  await expect(declare).toBeEnabled(); await expect(declare).toBeInViewport()
  await screenshot(page, 'onecard-mobile-declare')
  server.cardReply({ kind: 'declare-one' }, { players: players.map(player => player.userId === '101'
    ? { ...player, oneCardStatus: 'declared', oneCardUntil: null } : player) }, single)
  await declare.click(); await expect(declare).toHaveCount(0)
  server.cardSnapshot({ turnUserId: '101', turnDeadline: until }, { ...single, canDraw: true })
  await expect(panel.getByLabel('선택 카드 안내')).toContainText('낼 수 있는 카드가 없어요')
  server.rejectNextAction('GAME_ACTION_STALE_VERSION', '최신 버전을 확인해주세요.')
  await panel.getByRole('button', { name: '한 장 뽑고 넘기기', exact: true }).click()
  await expect(panel.getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(0)
  await panel.getByRole('button', { name: '최신 원카드 확인', exact: true }).click()
  await expect(panel.getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(1)
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND')).toHaveLength(2)
})
