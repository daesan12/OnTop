import { expect, test, type Page } from '@playwright/test'
import { TABLES } from '../../src/config'
import { fixture, screenshot } from './contractFixture'
import { facilityCatalog } from '../fixtures/facilityCatalog'
import { benchTable } from '../../src/features/interactions/benchSpectator'
import { ledgerCard, ledgerDice } from '../fixtures/ledger'

const panel = (p: Page) => p.getByRole('region', { name: '주사위 장부', exact: true })
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', e => list.push(e.message)); page.on('console', m => { if (m.type() === 'error') list.push(m.text()) })
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
async function loaded(p: Page) {
  await p.goto('/park'); await expect(p).toHaveTitle(/온탑|OnTop/i)
  await expect(p.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => p.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().tables.length)).toBeGreaterThan(0)
}
const settle = (p: Page) => p.waitForTimeout(1200) // 900ms 굴림 연출과 카메라 이동이 끝난 뒤 장면을 찍는다.
/** 장부가 오른쪽 세로 메뉴(옷장~설정)와 겹치지 않는다. */
async function clearOfDock(p: Page) {
  const ledger = await panel(p).boundingBox(), dock = await p.locator('.park-dock-wardrobe').boundingBox()
  expect(ledger && dock && ledger.x + ledger.width <= dock.x + 1).toBe(true)
}

test('주사위 장부 참가자: 굴림·예상 점수·보관·관전자 훈수·기록·자동 기록·공동 승리', async ({ page }) => {
  const server = await fixture(page, { omok: true, m09: true, ledger: 3, players: 3 }), p = panel(page)
  await loaded(page)
  await page.evaluate(async id => (await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.inspectTable(id), TABLES[0]!.id)
  await page.getByRole('button', { name: '앉기', exact: true }).click(); await page.getByLabel('1인 참가비').fill('1')
  await page.getByRole('button', { name: '주사위 장부 선택', exact: true }).click()
  await expect(page.getByRole('button', { name: '주사위 장부 선택', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('2~4인 · 주사위 5개 · 세 번 굴려 12칸 기록 · 차례 30초')).toBeVisible()
  await screenshot(page, 'ledger-01-lobby')

  await page.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  await expect(p.getByRole('status').first()).toContainText('내 차례 · 굴려 주세요')
  await expect(p.getByLabel('주사위 장부 점수판').locator('thead th')).toHaveCount(4)
  await settle(page); await screenshot(page, 'ledger-02-turn-start')

  server.ledgerReply({ kind: 'roll', keepIds: [] }, { rollCount: 1, rollId: 1, dice: ledgerDice([6, 6, 6, 6, 5]), lastEvent: 'ROLL' })
  await p.getByRole('button', { name: /굴리기/ }).click()
  await expect(p.getByRole('button', { name: '포카드 기록 · 예상 24점', exact: true })).toBeVisible()
  await expect(p.getByRole('button', { name: '풀하우스 기록 · 예상 0점', exact: true })).toBeVisible()
  await expect(p.getByRole('button', { name: '자유 기록 · 예상 29점', exact: true })).toBeVisible()
  await settle(page); await clearOfDock(page); await screenshot(page, 'ledger-03-rolled-preview')
  await page.setViewportSize({ width: 1280, height: 720 }); await expect(p).toBeInViewport(); await clearOfDock(page)
  await page.waitForTimeout(800); await screenshot(page, 'ledger-07-narrow')
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(500)

  for (const key of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) await page.keyboard.press(key)
  await expect(p.getByRole('group', { name: /주사위 보관 선택/ }).locator('button[aria-pressed="true"]')).toHaveCount(4)
  server.ledgerPing({ category: 'FIVE_OF_A_KIND' }); server.ledgerPing({ dieId: 4 }, '506')
  await expect(p.getByLabel('관전자 훈수')).toContainText('‘장원’ 칸 추천')
  await expect(p.getByLabel('관전자 훈수')).toContainText('5번 주사위 주목')
  await expect(p.locator('tr[data-hinted] th')).toContainText('장원')
  await page.waitForTimeout(400); await screenshot(page, 'ledger-04-keep-and-hint')

  server.ledgerReply({ kind: 'roll', keepIds: [0, 1, 2, 3] }, { rollCount: 2, rollId: 2, dice: ledgerDice([6, 6, 6, 6, 6], [0, 1, 2, 3]) })
  await p.getByRole('button', { name: /다시 굴리기/ }).click()
  await expect(p.getByRole('button', { name: '장원 기록 · 예상 50점', exact: true })).toBeVisible()
  await settle(page)
  const after = server.ledgerState().players; after[0] = ledgerCard('101', { FIVE_OF_A_KIND: 50 })
  server.ledgerReply({ kind: 'score', category: 'FIVE_OF_A_KIND' }, { players: after, turnUserId: '102', turnId: 2, rollCount: 0, dice: [],
    lastScored: { userId: '101', category: 'FIVE_OF_A_KIND', points: 50, auto: false, turnId: 1 }, lastEvent: 'SCORE',
    turnDeadline: new Date(Date.now() + 30000).toISOString() })
  await p.getByRole('button', { name: '장원 기록 · 예상 50점', exact: true }).click()
  await expect(p.getByRole('status').first()).toContainText('참가자 2 차례')
  await expect(p.locator('td[data-fresh]')).toHaveText('50')
  await expect(p.getByRole('button', { name: /굴리기/ })).toBeDisabled()
  await screenshot(page, 'ledger-05-scored-next-turn')

  const auto = server.ledgerState().players; auto[1] = ledgerCard('102', { CHOICE: 21 })
  server.ledgerSnapshot({ players: auto, turnUserId: '103', turnId: 3, lastEvent: 'TURN_TIMEOUT',
    lastScored: { userId: '102', category: 'CHOICE', points: 21, auto: true, turnId: 2 } })
  await expect(p).toContainText('(시간 초과 자동 기록)')
  await expect(p.locator('td[data-auto]')).toHaveText('21')

  // 12칸 완성: 101은 보너스 포함 258점, 102도 258점(공동 승리), 103은 220점.
  const perfect = { ONES: 3, TWOS: 6, THREES: 9, FOURS: 12, FIVES: 15, SIXES: 18, CHOICE: 26, FOUR_OF_A_KIND: 24, FULL_HOUSE: 15,
    SMALL_STRAIGHT: 15, LARGE_STRAIGHT: 30, FIVE_OF_A_KIND: 50 }
  server.ledgerSnapshot({ status: 'FINISHED', players: [ledgerCard('101', perfect), ledgerCard('102', perfect), ledgerCard('103', { ...perfect, ONES: 0 })],
    turnUserId: null, turnDeadline: null, round: null, rollCount: 0, dice: [], lastEvent: 'SCORE', winnerUserIds: ['101', '102'],
    endReason: 'ALL_CATEGORIES_FILLED', endedAt: new Date().toISOString(),
    lastScored: { userId: '103', category: 'ONES', points: 0, auto: false, turnId: 36 } })
  // 참가자의 종료 화면은 다른 게임과 같은 공용 결과 HUD다.
  const result = page.getByRole('region', { name: '테이블 함께 보기' })
  await expect(result.getByRole('status')).toContainText('공동 승리')
  await expect(result).toContainText('승리 · 258점'); await expect(result).toContainText('경기 종료 · 220점')
  await settle(page); await screenshot(page, 'ledger-06-finished-joint')
  expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND').map(m => m.payload.input)).toEqual([
    { kind: 'roll', keepIds: [] }, { kind: 'roll', keepIds: [0, 1, 2, 3] }, { kind: 'score', category: 'FIVE_OF_A_KIND' }])
  expect(server.sent.some(m => m.type === 'DICE_LEDGER_SPECTATOR_PING_SEND')).toBe(false)
})

test('주사위 장부 4인: 장부 4열이 메뉴와 겹치지 않고, 기권자는 흐리게 표시된 채 차례가 이어진다', async ({ page }) => {
  const server = await fixture(page, { omok: true, m09: true, ledger: 4, players: 4 }), p = panel(page)
  await loaded(page)
  await page.evaluate(async id => (await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.inspectTable(id), TABLES[0]!.id)
  await page.getByRole('button', { name: '앉기', exact: true }).click(); await page.getByLabel('1인 참가비').fill('1')
  await page.getByRole('button', { name: '주사위 장부 선택', exact: true }).click()
  await expect(page.getByText('참가자 · 4/4석')).toBeVisible()
  await page.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  const board = p.getByLabel('주사위 장부 점수판')
  await expect(board.locator('thead th')).toHaveCount(5)

  server.ledgerReply({ kind: 'roll', keepIds: [] }, { rollCount: 1, rollId: 1, dice: ledgerDice([1, 2, 3, 4, 5]), lastEvent: 'ROLL' })
  await p.getByRole('button', { name: /굴리기/ }).click()
  await expect(p.getByRole('button', { name: '라지 스트레이트 기록 · 예상 30점', exact: true })).toBeVisible()
  await expect(p.getByRole('button', { name: '스몰 스트레이트 기록 · 예상 15점', exact: true })).toBeVisible()
  await settle(page); await clearOfDock(page)
  const cells = await board.locator('tbody tr').first().locator('td').evaluateAll(tds => tds.map(td => td.getBoundingClientRect().width))
  expect(cells).toHaveLength(4); expect(Math.min(...cells)).toBeGreaterThan(40)
  await screenshot(page, 'ledger-10-four-players')

  const players = server.ledgerState().players
  players[0] = ledgerCard('101', { LARGE_STRAIGHT: 30 }); players[1] = ledgerCard('102', { CHOICE: 22 })
  players[2] = { ...ledgerCard('103'), forfeited: true }
  server.ledgerSnapshot({ players, turnUserId: '104', turnId: 3, round: 1, rollCount: 0, rollId: 2, dice: [], lastEvent: 'PLAYER_LEFT',
    lastScored: { userId: '102', category: 'CHOICE', points: 22, auto: false, turnId: 2 } })
  await expect(p.getByRole('status').first()).toContainText('참가자 4 차례')
  await expect(board.locator('thead th[data-out]')).toContainText('기권')
  await expect(board.locator('thead th[data-turn]')).toContainText('참가자 4')
  await expect(board.locator('.ledger-total td')).toHaveText(['30', '22', '0', '0'])
  await clearOfDock(page); await page.waitForTimeout(400); await screenshot(page, 'ledger-11-four-players-forfeit')
  expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND').map(m => m.payload.input)).toEqual([{ kind: 'roll', keepIds: [] }])
})

test('게임 설명서에 주사위 장부 카드·요약·상세 규칙(점수표)이 있다', async ({ page }) => {
  await fixture(page, { omok: true }); await loaded(page)
  const manual = page.getByRole('dialog', { name: '게임 설명서', exact: true })
  await page.getByRole('button', { name: '게임 설명서 F1', exact: true }).click()
  await expect(manual).toHaveAttribute('data-phase', 'open')
  await expect(manual.getByRole('button', { name: '주사위 장부 설명 읽기', exact: true })).toBeVisible()
  await page.waitForTimeout(400); await screenshot(page, 'ledger-12-manual-catalog')
  await manual.getByRole('searchbox', { name: '게임 설명 검색' }).fill('장원')
  await expect(manual.getByRole('button', { name: /설명 읽기$/ })).toHaveCount(1)
  await manual.getByRole('button', { name: '주사위 장부 설명 읽기', exact: true }).click()
  await expect(manual).toContainText('세 번 굴려 열두 칸을 채워요')
  await expect(manual).toContainText('포카드는 같은 눈 4개의 합만 더해요.')
  await page.waitForTimeout(400); await screenshot(page, 'ledger-13-manual-summary')
  await expect(manual.getByRole('navigation', { name: '설명 목차' }).getByRole('button')).toHaveCount(6)
  await manual.getByRole('navigation', { name: '설명 목차' }).getByRole('button', { name: /장부 칸과 점수/ }).click()
  await expect(manual).toContainText('같은 눈 3개 + 2개 (같은 눈 5개도 인정)')
  await page.waitForTimeout(400); await screenshot(page, 'ledger-14-manual-scores')
  const download = await page.request.get('/rulebooks/ledger/v1.md')
  expect(download.ok()).toBe(true); expect(await download.text()).toContain('# 주사위 장부')
})

test('주사위 장부 관전자: 같은 장부를 보고 칸·주사위 훈수만 보낸다', async ({ page }) => {
  const bench = facilityCatalog.facilities.find(d => d.kind === 'BENCH' && benchTable(d.facilityId)?.pavilionId === 'P1')!, anchor = benchTable(bench.facilityId)!
  const server = await fixture(page, { publicSpectator: true, spectatorEvents: true, ledger: 3, ownUserId: '505', manualMovement: true,
    position: bench.center, anchorId: anchor.id }), p = panel(page)
  await loaded(page)
  await expect.poll(() => page.evaluate(async () => (await import('/src/features/facilities/state.ts' as string)).useFacilityState.getState().ready)).toBe(true)
  expect(await page.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id, 0), bench.facilityId)).toBe(true)
  await page.getByRole('button', { name: '가까이 관전', exact: true }).click()
  await expect(p).toHaveAttribute('data-role', 'SPECTATOR')
  const players = server.ledgerState().players; players[0] = ledgerCard('101', { SIXES: 18, CHOICE: 24 })
  server.ledgerSnapshot({ players, rollCount: 2, rollId: 2, dice: ledgerDice([4, 4, 4, 2, 2], [0, 1, 2]), lastEvent: 'ROLL' }, 'SPECTATOR')
  await expect(p.getByRole('button', { name: '풀하우스 훈수 · 예상 16점', exact: true })).toBeVisible()
  await expect(p.getByRole('button', { name: /굴리기/ })).toHaveCount(0)
  await expect(p).toContainText('장부 칸이나 주사위를 눌러 훈수할 수 있어요')
  await settle(page); await clearOfDock(page); await screenshot(page, 'ledger-08-spectator')
  await page.getByRole('button', { name: '판 자세히 보기', exact: true }).click()
  await page.waitForTimeout(1500); await screenshot(page, 'ledger-08b-spectator-board')

  await p.getByRole('button', { name: '풀하우스 훈수 · 예상 16점', exact: true }).click()
  await expect(p).toContainText('‘풀하우스’ 칸 훈수를 보냈어요.')
  // 승인 직후 두 번째 훈수는 1초 간격 안이라 보내지 않는다(화면 대기 전에 확인해야 시간에 흔들리지 않는다).
  await p.getByRole('button', { name: /주사위 4: 2/ }).click()
  await expect(p).toContainText('1초 간격')
  await expect(p.locator('tr[data-hinted] th')).toContainText('풀하우스')
  const sent = server.sent.filter(m => m.type === 'DICE_LEDGER_SPECTATOR_PING_SEND')
  expect(sent.map(m => ({ category: m.payload.category, basedOnVersion: m.payload.basedOnVersion }))).toEqual([{ category: 'FULL_HOUSE', basedOnVersion: 1 }])
  await page.waitForTimeout(300); await screenshot(page, 'ledger-09-spectator-hint-sent')
  expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND')).toHaveLength(0)
})
