import { test, expect, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import type { Resolution, SecretDie } from '../../src/game/bridge/protocol'
const panel = (p: Page) => p.getByRole('region', { name: '다리 경기', exact: true })
const secret: SecretDie = { userId: '101', turnId: 1, die: 'X' }
const state = (p: Page) => p.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game)
const probe = (p: Page) => p.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).bridgeProbe())
async function start(page: Page, count: 2 | 3 | 4 = 2) {
  const server = await fixture(page, { omok: true, m09: true, bridge: count, players: count })
  await page.goto('/park'); await expect(page).toHaveTitle(/온탑|OnTop/i)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
  await page.getByRole('button', { name: '앉기', exact: true }).click(); await page.getByRole('button', { name: '거짓말 다리 건너기 선택', exact: true }).click()
  await page.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  await expect(panel(page).getByRole('button', { name: '비밀 주사위 굴리기', exact: true })).toBeEnabled()
  await expect.poll(async () => (await probe(page)).count).toBe(count * 7)
  return server
}
test('M13 private roll/declare uses latest atomic version, public all-trusted result never discloses the die', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const server = await start(page), p = panel(page)
  server.holdState(true); server.bridgeReply({ kind: 'roll' }, { stage: 'DECLARING', lastEvent: 'ROLL' }, secret)
  await p.getByRole('button', { name: '비밀 주사위 굴리기', exact: true }).click()
  await expect(p).toContainText('처리 확인 수신'); await expect(p.getByLabel('나만 보는 주사위')).toHaveCount(0)
  server.holdState(false); server.flushGame(); await expect(p.getByLabel('나만 보는 주사위')).toContainText('X')
  server.bridgeReply({ kind: 'declare', value: 4 }, { stage: 'RESPONDING', declaration: 4, responderUserId: '102', responseOrder: ['102'], lastEvent: 'DECLARE' }, secret)
  await p.getByRole('button', { name: '4 선언', exact: true }).click(); await expect(p).toContainText('참가자 2 판단 차례')
  await expect(p.getByRole('button', { name: '믿기', exact: true })).toHaveCount(0)
  const players = server.bridgeState().players; players[0]!.pawns[0]!.position = 4
  const r: Resolution = { turnId: 1, declarerUserId: '101', declaredNumber: 4, challenged: false, startedAt: new Date().toISOString(),
    operations: [{ type: 'MOVE_PAWN', userId: '101', pawnId: 1, fromPosition: 0, toPosition: 4, slotNumber: null, reason: null }] }
  server.bridgeSnapshot({ stage: 'RESOLVING', turnDeadline: new Date(Date.now() + 1500).toISOString(), responderUserId: null, players, resolution: r, operations: r.operations, lastEvent: 'ALL_TRUSTED' })
  await expect(p.getByLabel('나만 보는 주사위')).toHaveCount(0); await expect(p.getByLabel('최근 다리 판정')).not.toContainText('실제 눈 X')
  expect((await state(page))!.secret).toBeNull(); expect(JSON.stringify((await state(page))!.bridge!.resolution)).not.toContain('actualFace')
  await expect.poll(async () => (await probe(page)).pawns.find((p: { id: number; position: number[] }) => p.id === 1)?.position[0]).toBeCloseTo(-.2, 3)
  expect((await probe(page)).publicData).not.toContain('"die"')
  await screenshot(page, 'm13-private-result')
  server.bridgeSnapshot({ stage: 'AWAITING_ROLL', turnId: 2, turnUserId: '102', declaration: null, responseOrder: [], acceptedBy: [], operations: [] })
  await expect(p).toContainText('참가자 2 차례'); expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND')).toHaveLength(2)
  expect(errors).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
for (const count of [3, 4] as const) test(`M13 ${count}-player sequential judge, doubt penalty, vacated slot, joint result and next round`, async ({ page }) => {
  const server = await start(page, count), p = panel(page)
  await expect(p.getByLabel('다리 참가자').locator(':scope > div')).toHaveCount(count)
  server.bridgeSnapshot({ stage: 'RESPONDING', turnUserId: '102', responderUserId: '103', declaration: 3, responseOrder: ['103', '101'], acceptedBy: [] })
  await expect(p.getByRole('button', { name: '믿기', exact: true })).toHaveCount(0)
  server.bridgeSnapshot({ responderUserId: '101', acceptedBy: ['103'] })
  server.bridgeReply({ kind: 'trust' }, { stage: 'RESOLVING', turnDeadline: new Date(Date.now() + 1500).toISOString(), responderUserId: null, lastEvent: 'ALL_TRUSTED', acceptedBy: ['103', '101'], resolution: { turnId: 1, declarerUserId: '102', declaredNumber: 3, challenged: false, startedAt: new Date().toISOString(), operations: [] } })
  await p.getByRole('button', { name: '믿기', exact: true }).click(); await expect(p).toContainText('판정 연출 중에는 입력할 수 없습니다.')
  // Explicit server-approved goal-only judge state: a failed doubt vacates the lowest issued slot.
  const b = server.bridgeState(); b.players[0]!.pawns.forEach((pawn, i) => { pawn.status = i === 0 ? 'SCORED' : 'FALLEN'; pawn.position = i === 0 ? 9 : 0; pawn.goalSlot = i === 0 ? 1 : null })
  b.players[0]!.score = b.players[0]!.goals = 1; b.goalSlots[0] = { slot: 1, status: 'OCCUPIED', userId: '101', pawnId: 1, removedReason: null, firstAssignedTurnId: 1 }
  server.bridgeSnapshot({ stage: 'RESPONDING', turnId: 2, turnUserId: '102', responderUserId: '101', responseOrder: ['101'], acceptedBy: [], players: b.players, goalSlots: b.goalSlots, nextGoalSlot: 2 })
  await expect(p).toContainText('골인 말만 보유 중'); b.players[0]!.pawns[0]!.status = 'REMOVED_SCORED'; b.players[0]!.score = b.players[0]!.goals = 0
  b.goalSlots[0] = { slot: 1, status: 'VACATED', userId: null, pawnId: null, removedReason: 'FAILED_DOUBT', firstAssignedTurnId: 1 }
  const r: Resolution = { turnId: 2, declarerUserId: '102', declaredNumber: 3, challenged: true, actualFace: 3, challengerUserId: '101', wasBluff: false, startedAt: new Date().toISOString(),
    operations: [{ type: 'VACATE_GOAL_SLOT', userId: '101', pawnId: 1, fromPosition: null, toPosition: null, slotNumber: 1, reason: 'FAILED_DOUBT' }] }
  server.bridgeReply({ kind: 'doubt' }, { stage: 'RESOLVING', turnDeadline: new Date(Date.now() + 1500).toISOString(), responderUserId: null, resolution: r, players: b.players, goalSlots: b.goalSlots, operations: r.operations, lastEvent: 'DOUBT_FAILED' })
  await p.getByRole('button', { name: '다우트!', exact: true }).click(); await expect(p.getByLabel('최근 다리 판정')).toContainText('실제 눈 3')
  await expect(p.getByLabel('골인 점수 위치').locator('[data-status=VACATED]')).toHaveText('1 ×'); await expect(p).toContainText('다음 골인 번호 2')
  await expect.poll(async () => (await probe(page)).crosses).toBe(2)
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).watchBridgeResources())
  const winners = b.players.map(p => p.userId)
  b.players.forEach(p => p.pawns.forEach(pawn => { if (pawn.status !== 'REMOVED_SCORED') { pawn.status = 'FALLEN'; pawn.position = 0; pawn.goalSlot = null } }))
  server.bridgeSnapshot({ players: b.players, status: 'FINISHED', stage: 'FINISHED', turnUserId: null, responderUserId: null, turnDeadline: null, winnerUserIds: winners, endReason: 'NO_RUNNABLE_PAWNS', endedAt: new Date().toISOString() })
  await expect(p).toContainText('공동 승리'); await p.getByRole('button', { name: '정산 결과 확인' }).click(); await expect(p).toContainText('정산 대기 중')
  server.settle(); await expect(p).toContainText('정산 완료 · 내 엽전 증감 1')
  if (count === 4) { await page.setViewportSize({ width: 390, height: 844 }); await expect(p).toBeInViewport(); await screenshot(page, 'm13-narrow') }
  server.nextRound(); await expect(p).toHaveCount(0)
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).bridgeResourceProbe())).toEqual({ instances: 4, shared: 0 })
  expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND').map(m => m.payload.input)).toEqual([{ kind: 'trust' }, { kind: 'doubt' }])
})
test('M13 stale/timeout/recovery/pending forfeits freeze input; only fresh own secret recovers declarations', async ({ page }) => {
  const server = await start(page), p = panel(page)
  server.rejectNextAction('GAME_ACTION_STALE_VERSION', '최신 단계를 확인해주세요.')
  await p.getByRole('button', { name: '비밀 주사위 굴리기', exact: true }).click(); await expect(p).toContainText('자동 재전송하지 않습니다.')
  await expect(p.getByRole('button', { name: '비밀 주사위 굴리기', exact: true })).toBeDisabled()
  await p.getByRole('button', { name: '최신 다리 확인' }).click()
  server.bridgeSnapshot({ stage: 'DECLARING' }, secret); await expect(p.getByLabel('나만 보는 주사위')).toContainText('X')
  server.recoveryPending(); await expect(p.getByLabel('나만 보는 주사위')).toHaveCount(0)
  await expect(p.getByRole('button', { name: '1 선언', exact: true })).toBeDisabled(); server.restoreGame(); await expect(p.getByLabel('나만 보는 주사위')).toContainText('X')
  server.bridgeSnapshot({ turnDeadline: new Date(Date.now() - 100).toISOString() }, secret)
  await expect(p).toContainText('시간 만료'); await expect(p.getByRole('button', { name: '1 선언', exact: true })).toBeDisabled()
  const players = server.bridgeState().players; players[0]!.pendingForfeit = true
  server.bridgeSnapshot({ players, turnDeadline: new Date(Date.now() + 30000).toISOString(), lastEvent: 'PLAYER_LEFT' })
  await expect(p).toContainText('기권 예정'); await expect(p.getByLabel('나만 보는 주사위')).toHaveCount(0)
  await expect(p.getByRole('button', { name: '1 선언', exact: true })).toBeDisabled()
  expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND')).toHaveLength(1)
})
