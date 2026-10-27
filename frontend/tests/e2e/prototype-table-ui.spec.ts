import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { TABLES } from '../../src/config'
import fs from 'node:fs/promises'
import path from 'node:path'

const together = (p: Page) => p.getByRole('region', { name: '테이블 함께 보기', exact: true })
const lobby = (p: Page) => p.getByRole('dialog', { name: '테이블 정보', exact: true })
const probe = (p: Page, action?: 'primary' | 'settings') => p.evaluate(async a => (await import('/tests/e2e/sceneProbe.ts' as string)).gatheringProbe(a), action)

type ContractServer = Awaited<ReturnType<typeof fixture>>
const names = { OMOK: '오목', DICE: '주사위 한 판', ONE_CARD: '원카드', LIAR_BRIDGE: '거짓말 다리 건너기' } as const
type GameCode = keyof typeof names
// Fixture의 내부 카운터를 추정하지 않고 브라우저가 실제 수신한 TABLE_STATE를 확인한다.
const confirmedTable = (p: Page) => p.evaluate(async () => {
  const session = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
  const table = session.tableStates[session.tableId]
  return table ? { tableId: table.tableId, version: table.version, gameCode: table.gameCode,
    betAmountPerPlayer: table.betAmountPerPlayer, selectorUserId: table.selectorUserId } : null
})
async function selectGame(p: Page, server: ContractServer, code: GameCode, betAmountPerPlayer = 1) {
  await lobby(p).getByLabel('1인 참가비', { exact: true }).fill(String(betAmountPerPlayer))
  const before = server.sent.filter(m => m.type === 'GAME_SELECT').length
  await lobby(p).getByRole('button', { name: names[code] + ' 선택', exact: true }).click()
  await expect.poll(() => server.sent.filter(m => m.type === 'GAME_SELECT').length).toBe(before + 1)
  expect(server.sent.filter(m => m.type === 'GAME_SELECT').at(-1)?.payload).toEqual(
    code === 'DICE' ? { gameCode: code, betAmountPerPlayer, targetScore: 2000 } : { gameCode: code, betAmountPerPlayer })
  await expect.poll(() => confirmedTable(p)).toMatchObject({ gameCode: code, betAmountPerPlayer })
  await expect(lobby(p)).toContainText('확정 참가비: ' + betAmountPerPlayer + ' 코인 / 1인')
}
async function setReady(p: Page, server: ContractServer, ready: boolean) {
  const button = lobby(p).getByRole('button', { name: ready ? '준비' : '준비 취소', exact: true })
  await expect(button).toBeEnabled()
  await button.scrollIntoViewIfNeeded()
  // 응답 후 증가한 버전이 아니라, 클릭 직전에 확인한 상태의 버전과 일치해야 한다.
  const confirmed = await confirmedTable(p)
  expect(confirmed).not.toBeNull()
  expect(Number.isSafeInteger(confirmed!.version)).toBe(true)
  expect(confirmed!.version).toBeGreaterThanOrEqual(0)
  expect(confirmed!.betAmountPerPlayer).toBeGreaterThan(0)
  const before = server.sent.filter(m => m.type === 'READY_SET').length
  await button.click()
  await expect.poll(() => server.sent.filter(m => m.type === 'READY_SET').length).toBe(before + 1)
  expect(server.sent.filter(m => m.type === 'READY_SET').at(-1)?.payload).toEqual(ready
    ? { ready: true, betAmountPerPlayer: confirmed!.betAmountPerPlayer, expectedVersion: confirmed!.version }
    : { ready: false })
  return confirmed!
}

async function load(p: Page, anchor = 'table-1') {
  await p.goto('/park'); await expect(p).toHaveTitle(/온탑|OnTop/i)
  await expect(p.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(p.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await expect.poll(() => p.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().tables.length)).toBeGreaterThan(0)
  await p.evaluate(async id => (await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.inspectTable(id), anchor)
  await p.getByRole('button', { name: '앉기', exact: true }).click()
}
for (const code of ['OMOK', 'DICE', 'ONE_CARD', 'LIAR_BRIDGE'] as const) test(`2D table preparation → ${code} original HUD → shared server result`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const server = await fixture(page, { omok: true, m09: true, dice: code === 'DICE', onecard: code === 'ONE_CARD' ? 4 : undefined, bridge: code === 'LIAR_BRIDGE' ? 4 : undefined, players: 8 })
  await load(page)
  await selectGame(page, server, code)
  await expect(lobby(page)).toBeVisible()
  await expect(together(page)).toHaveCount(0)
  await expect.poll(async () => (await probe(page)).present).toBe(false)
  await expect.poll(async () => Math.abs((await probe(page)).camera[1]! - TABLES[0]!.position[1] - 1.95)).toBeLessThan(.01)
  await screenshot(page, `prototype-${code}-waiting`)
  await setReady(page, server, true); server.confirmStart()
  await expect(together(page)).toHaveCount(0)
  await expect.poll(async () => (await probe(page)).present).toBe(false)
  const panel = page.locator('.prototype-game')
  await expect(panel).toBeVisible(); await expect(panel).toContainText('차례')
  if (code !== 'OMOK') await expect.poll(async () => Math.abs((await probe(page)).camera[1]! - TABLES[0]!.position[1] - (code === 'DICE' ? 3.15 : 1.95))).toBeLessThan(.01)
  expect(await panel.evaluate(e => getComputedStyle(e).pointerEvents)).toBe('none')
  if (code === 'OMOK') {
    await expect(panel.getByRole('group', { name: '오목판' })).toBeHidden()
    await panel.getByText('키보드로 오목판 조작', { exact: true }).click()
    await expect(panel.getByRole('group', { name: '오목판' }).getByRole('button')).toHaveCount(225)
    await panel.getByText('키보드로 오목판 조작', { exact: true }).click()
  }
  if (code === 'ONE_CARD') await expect(panel.getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(7)
  if (code === 'LIAR_BRIDGE') await expect(panel.getByRole('button', { name: '비밀 주사위 굴리기' })).toBeEnabled()
  await screenshot(page, `prototype-${code}-playing`)
  if (code === 'ONE_CARD') server.cardSnapshot({ status: 'FINISHED', stage: 'FINISHED', turnUserId: null, turnDeadline: null, winnerUserIds: ['101'], endReason: 'EMPTY_HAND', endedAt: new Date().toISOString() })
  else if (code === 'LIAR_BRIDGE') server.bridgeSnapshot({ status: 'FINISHED', stage: 'FINISHED', turnUserId: null, responderUserId: null, turnDeadline: null, winnerUserIds: ['101'], endReason: 'THREE_GOALS', endedAt: new Date().toISOString() })
  else if (code === 'DICE') server.diceSnapshot({ status: 'FINISHED', stage: 'FINISHED', turnUserId: null, turnDeadline: null, winnerUserId: '101', endReason: 'TARGET_REACHED', endedAt: new Date().toISOString() })
  else server.finishGame()
  await expect(together(page)).toContainText('경기 결과')
  await expect.poll(async () => (await probe(page)).present).toBe(true)
  expect(await probe(page)).toMatchObject({ meshes: 2, triangles: 14 })
  await expect(together(page)).toContainText('승리')
  await expect(together(page).getByRole('button', { name: '다음 판 준비', exact: true })).toHaveCount(0)
  await together(page).getByRole('button', { name: '정산 결과 확인' }).click()
  await expect(together(page)).toContainText('정산 대기 중')
  await together(page).getByRole('button', { name: '결과 자세히' }).click()
  await expect(page.getByRole('region', { name: '경기 결과 상세' })).toContainText('정산 대기 중')
  await page.getByRole('button', { name: '테이블 함께 보기', exact: true }).click()
  server.settle(); server.nextRound()
  await expect(together(page).getByRole('button', { name: '다음 판 준비' })).toBeEnabled()
  await screenshot(page, `prototype-${code}-result`)
  const before = server.sent.length
  await together(page).getByRole('button', { name: '다음 판 준비' }).click()
  await expect(lobby(page).getByRole('button', { name: '준비', exact: true })).toBeEnabled()
  await expect.poll(async () => (await probe(page)).present).toBe(false)
  expect((await probe(page)).disposed).toEqual({ geometry: 2, material: 2, texture: 1 })
  expect(server.sent.slice(before).some(m => /READY|START|LEAVE|FORFEIT/.test(m.type))).toBe(false)
  await lobby(page).getByRole('button', { name: '일어나기', exact: true }).click()
  await expect(together(page)).toHaveCount(0)
  expect(server.maxActive).toBe(1); expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

test('INVALID server result overrides a PLAYING engine; query after WAITING survives late and duplicate notifications', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const server = await fixture(page, { omok: true, m09: true })
  await load(page); await selectGame(page, server, 'OMOK', 7); await setReady(page, server, true)
  server.confirmStart()
  await expect(page.locator('.prototype-game')).toBeVisible()
  const pending = server.storeInvalidResult()
  server.notifyResult(pending)
  await expect(together(page)).toContainText('무효 경기')
  await expect(together(page)).toContainText('판정 없음')
  await expect(together(page)).toContainText('참가비 7 코인 예약금 반환 대기')
  await expect(together(page)).not.toContainText('무승부')
  await expect(together(page)).not.toContainText('승리')
  await expect.poll(async () => (await probe(page)).present).toBe(true)
  const settled = server.storeInvalidResult('SETTLED')
  server.nextRound() // DB is settled, but the SETTLED notification has not reached this browser.
  await expect.poll(() => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game)).toBeNull()
  await together(page).getByRole('button', { name: '정산 결과 확인', exact: true }).click()
  await expect(together(page)).toContainText('예약 해제 완료 · 참가비 7 코인 · 잔액 변화 0')
  expect(server.sent.filter(m => m.type === 'GAME_RESULT_CHECK').at(-1)?.payload).toEqual({ gameSessionId: settled.gameSessionId })
  server.notifyResult(pending); server.notifyResult(settled); server.notifyResult(settled)
  await expect(together(page)).toContainText('예약 해제 완료')
  await expect(together(page)).not.toContainText('예약금 반환 대기')
  await together(page).getByRole('button', { name: '다음 판 준비', exact: true }).click()
  server.notifyResult(settled)
  await expect(lobby(page)).toBeVisible(); await expect(together(page)).toHaveCount(0)
  await expect(lobby(page).getByRole('region', { name: '지난 판 결과', exact: true })).toHaveCount(0)
  await expect(lobby(page).getByLabel('1인 참가비', { exact: true })).toHaveValue('7')
  await expect.poll(async () => (await probe(page)).present).toBe(false)
  expect(errors).toEqual([])
})

test('2D preparation keeps ready/cancel and host controls on the existing server connection', async ({ page }) => {
  const server = await fixture(page, { omok: true, m09: true, startEvents: false }); await load(page)
  await selectGame(page, server, 'OMOK', 5)
  await expect(lobby(page)).toBeVisible()
  await expect.poll(async () => (await probe(page)).present).toBe(false)
  const firstConsent = await setReady(page, server, true)
  await expect.poll(() => server.sent.filter(m => m.type === 'READY_SET').length).toBe(1)
  await setReady(page, server, false)
  await expect.poll(() => server.sent.filter(m => m.type === 'READY_SET').length).toBe(2)
  expect(server.sent.filter(m => m.type === 'READY_SET').map(m => m.payload)).toEqual([
    { ready: true, betAmountPerPlayer: 5, expectedVersion: firstConsent.version }, { ready: false }])
  server.host('102')
  await expect(lobby(page).getByRole('button', { name: '주사위 한 판 선택', exact: true })).toBeDisabled()
  await expect(lobby(page).getByLabel('1인 참가비', { exact: true })).toBeDisabled()
  await expect.poll(() => confirmedTable(page)).toMatchObject({ selectorUserId: '102' })
  const nextConsent = await setReady(page, server, true)
  expect(nextConsent.version).toBeGreaterThan(firstConsent.version)
  await setReady(page, server, false)
  expect(server.maxActive).toBe(1)
  expect(server.sent.some(m => m.type === 'GAME_START')).toBe(false)
})

for (const code of ['ONE_CARD', 'DICE', 'LIAR_BRIDGE'] as const) for (const size of [{ width: 1280, height: 720 }, { width: 1000, height: 700 }]) test(`original ${code} controls remain reachable at ${size.width}×${size.height}`, async ({ page }) => {
  await page.setViewportSize(size)
  const server = await fixture(page, { omok: true, m09: true, onecard: code === 'ONE_CARD' ? 4 : undefined, dice: code === 'DICE', bridge: code === 'LIAR_BRIDGE' ? 4 : undefined, players: 4 }); await load(page)
  await selectGame(page, server, code)
  await lobby(page).getByRole('button', { name: '준비', exact: true }).scrollIntoViewIfNeeded()
  await expect(lobby(page).getByRole('button', { name: '준비', exact: true })).toBeInViewport()
  await screenshot(page, `prototype-waiting-${size.width}`)
  await setReady(page, server, true); server.confirmStart()
  const panel = page.locator('.prototype-game')
  await expect.poll(async () => Math.abs((await probe(page)).camera[1]! - TABLES[0]!.position[1] - (code === 'DICE' ? 3.15 : 1.95))).toBeLessThan(.01)
  await expect(panel.getByRole('button', { name: ({ ONE_CARD: '한 장 뽑고 넘기기', DICE: 'R 굴리기', LIAR_BRIDGE: '비밀 주사위 굴리기' })[code], exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: '채팅 입력창 열기', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
  await expect(page.locator('.park-chat input')).toBeFocused()
  await page.keyboard.press('Escape')
  await screenshot(page, `prototype-${code}-${size.width}`)
})

test('pavilion preparation uses the panel while the 3D result preserves its controls and restores roaming', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 720 })
  const anchor = TABLES.find(t => t.pavilionId === 'P1')!
  const server = await fixture(page, { omok: true, m09: true, onecard: 4, players: 12, anchorId: anchor.id })
  await load(page, anchor.id)
  await selectGame(page, server, 'ONE_CARD')
  await expect(lobby(page)).toBeVisible()
  await expect.poll(async () => (await probe(page)).present).toBe(false)
  await setReady(page, server, true); server.confirmStart()
  server.cardSnapshot({ status: 'FINISHED', stage: 'FINISHED', turnUserId: null, turnDeadline: null, winnerUserIds: ['101'], endReason: 'EMPTY_HAND', endedAt: new Date().toISOString() })
  await expect(together(page)).toBeVisible()
  await expect.poll(async () => (await probe(page)).present).toBe(true)
  await page.waitForTimeout(1500)
  const before = await probe(page); expect(before.ownVisible).toBe(true)
  const samples = []
  for (const visible of [false, true, false, true]) samples.push(await page.evaluate(async value => (await import('/tests/e2e/sceneProbe.ts' as string)).measureGathering(value), visible))
  if (process.env.QA_ARTIFACT_DIR) await fs.writeFile(path.join(process.env.QA_ARTIFACT_DIR, 'gathering-render-cost.json'), JSON.stringify({ viewport: page.viewportSize(), samples }, null, 2))
  await screenshot(page, 'prototype-pavilion-result')
  const settings = (await probe(page, 'settings')).point!; await page.mouse.click(settings.x, settings.y)
  await expect(page.getByRole('region', { name: '경기 결과 상세', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '테이블 함께 보기', exact: true }).click()
  await together(page).getByRole('button', { name: '주변 둘러보기' }).click()
  await expect.poll(async () => (await probe(page)).ownVisible).toBe(false)
  await together(page).getByRole('button', { name: '테이블 함께 보기' }).click()
  await expect.poll(async () => (await probe(page)).ownVisible).toBe(true)
  server.settle(); server.nextRound()
  await together(page).getByRole('button', { name: '자리에서 일어나기' }).click()
  await expect.poll(async () => (await probe(page)).present).toBe(false)
  expect(server.sent.some(m => /FORFEIT|RESIGN|REMATCH/.test(m.type))).toBe(false)
})
