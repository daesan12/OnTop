import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import type { Bridge } from '../../src/game/bridge/protocol'
import { TABLES } from '../../src/config'

const probe = (p: Page, id = '101'): Promise<ReturnType<typeof import('./defeatProbe').defeatProbe>> =>
  p.evaluate(async value => (await import('/tests/e2e/defeatProbe.ts' as string)).defeatProbe(value), id)
type Kind = 'OMOK' | 'DICE' | 'ONE_CARD' | 'LIAR_BRIDGE'
async function start(p: Page, count: 2 | 3 | 4 = 4, girl = false, kind: Kind = 'LIAR_BRIDGE') {
  const server = await fixture(p, { omok: true, m09: true, forfeit: true, manualMovement: true,
    ...(kind === 'ONE_CARD' ? { onecard: count } : kind === 'LIAR_BRIDGE' ? { bridge: count } : kind === 'DICE' ? { dice: true } : {}),
    publicProfiles: { '101': { nickname: '패배 모션 검수', characterGender: girl ? 'FEMALE' : 'MALE' } } })
  await p.goto('/park'); await expect(p).toHaveTitle('OnTop')
  await expect(p.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(p.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await p.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
  await p.getByRole('button', { name: '앉기', exact: true }).click()
  await p.getByRole('spinbutton', { name: '1인 참가비', exact: true }).fill('1')
  await p.getByRole('button', { name: ({ OMOK: '오목 선택', DICE: '주사위 한 판 선택', ONE_CARD: '원카드 선택', LIAR_BRIDGE: '거짓말 다리 건너기 선택' })[kind], exact: true }).click()
  await p.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  await expect(p.getByRole('region', { name: ({ OMOK: '오목 경기', DICE: '주사위 경기', ONE_CARD: '원카드 경기', LIAR_BRIDGE: '다리 경기' })[kind], exact: true })).toBeVisible()
  return server
}
const finished = (winner = '102'): Partial<Bridge> => ({ status: 'FINISHED', stage: 'FINISHED',
  turnUserId: null, responderUserId: null, turnDeadline: null, winnerUserIds: [winner], endReason: 'THREE_GOALS', endedAt: new Date().toISOString() })
async function confirm(p: Page) {
  await p.getByRole('button', { name: '기권', exact: true }).click()
  await p.getByRole('button', { name: '기권 확정', exact: true }).click()
}
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', e => list.push(e.message)); page.on('console', m => { if (m.type() === 'error') list.push(m.text()) })
})
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0) })

for (const girl of [false, true]) test(`confirmed multiplayer loss reaches both sides of the ${girl ? 'girl' : 'man'} head and recovers`, async ({ page }) => {
  const server = await start(page, 4, girl)
  const sent = server.sent.length
  server.bridgeSnapshot(finished())
  expect((await probe(page)).reaction).toBeNull()
  const notification = server.reaction()
  await expect.poll(async () => (await probe(page)).reaction?.kind).toBe('head-clutch')
  await expect.poll(async () => (await probe(page)).headPitch).toBeGreaterThan(.15)
  // Seating and the upper-body overlay settle independently in the real rig.
  await expect.poll(async () => (await probe(page)).leg).toBeCloseTo(-Math.PI / 2, 2)
  const pose = await probe(page)
  expect(pose.visible).toBe(true); expect(pose.character).toBe(girl ? 'girl' : 'man')
  expect(pose.leg).toBeCloseTo(-Math.PI / 2, 2)
  for (const hand of [pose.left!, pose.right!]) expect(Math.hypot(...hand.map((n, i) => n - pose.head![i]!))).toBeLessThan(.45)
  await screenshot(page, `defeat-${girl ? 'girl' : 'man'}-head-clutch`)
  const first = pose.reaction!.at; server.resendGame()
  server.reaction(notification)
  expect((await probe(page)).reaction!.at).toBe(first)
  await expect.poll(async () => (await probe(page)).reaction).toBeNull()
  await expect.poll(async () => Math.abs((await probe(page)).headPitch!)).toBeLessThan(.02)
  expect(server.sent.slice(sent).some(m => ['WORLD_EMOTE_SEND', 'GAME_ACTION_SEND', 'GAME_FORFEIT'].includes(m.type))).toBe(false)
  expect(server.maxActive).toBe(1)
})

test('a forfeit confirmation alone does not pose; confirmed four-player elimination poses once and is cancelled on leaving', async ({ page }) => {
  const server = await start(page)
  server.forfeitMode('receipt-only'); await confirm(page)
  await expect.poll(async () => page.evaluate(async () => (await import('/src/game/forfeit.ts' as string)).useForfeit.getState().attempt?.status)).toBe('approved')
  expect((await probe(page)).reaction).toBeNull()
  server.resendGame()
  await expect.poll(async () => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game?.version)).toBe(1)
  const state = server.bridgeState()
  server.bridgeSnapshot({ players: state.players.map(p => p.userId === '102' ? { ...p, forfeited: true } : p) })
  expect((await probe(page, '102')).reaction).toBeNull()
  const notification = server.reaction({ userId: '102', kind: 'FORFEIT' })
  await expect.poll(async () => (await probe(page, '102')).reaction?.kind).toBe('head-clutch')
  await expect.poll(async () => (await probe(page, '102')).headPitch).toBeGreaterThan(.15)
  const at = (await probe(page, '102')).reaction!.at
  server.resendGame(); server.reaction(notification); expect((await probe(page, '102')).reaction!.at).toBe(at)
  server.endSession()
  await expect(page.locator('.login-page')).toBeVisible()
  await expect.poll(async () => page.evaluate(async () => (await import('/src/world/gameReactions.ts' as string)).reactionFor('102'))).toBeNull()
  expect(server.sent.filter(m => m.type === 'GAME_FORFEIT')).toHaveLength(1)
  expect(server.sent.some(m => m.type === 'WORLD_EMOTE_SEND')).toBe(false)
})

for (const loss of ['forfeit', 'normal'] as const) test(`four-player game narrowed to 1v1 keeps head-clutch for ${loss}`, async ({ page }) => {
  const server = await start(page)
  const state = server.bridgeState()
  server.bridgeSnapshot({ players: state.players.map(p => ['103', '104'].includes(p.userId) ? { ...p, forfeited: true } : p) })
  await expect.poll(async () => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game?.version)).toBeGreaterThan(0)
  if (loss === 'forfeit') {
    const current = server.bridgeState()
    server.bridgeSnapshot({ players: current.players.map(p => p.userId === '101' ? { ...p, forfeited: true } : p), ...finished() })
  } else server.bridgeSnapshot(finished())
  server.reaction({ remainingBefore: 2, kind: loss === 'forfeit' ? 'FORFEIT' : 'DEFEAT' })
  await expect.poll(async () => (await probe(page)).reaction?.kind).toBe('head-clutch')
  expect((await probe(page, '102')).reaction).toBeNull()
  expect(server.sent.some(m => m.type === 'WORLD_EMOTE_SEND')).toBe(false)
})

test('one-card confirmed multiplayer forfeit uses head-clutch without a local win, movement or settlement', async ({ page }) => {
  const server = await start(page, 3, false, 'ONE_CARD')
  await confirm(page)
  server.reaction({ kind: 'FORFEIT' })
  await expect.poll(async () => (await probe(page)).reaction?.kind).toBe('head-clutch')
  await expect(page.getByRole('region', { name: '원카드 경기', exact: true })).toContainText('기권 처리되어')
  expect(server.sent.some(m => ['WORLD_EMOTE_SEND', 'TABLE_LEAVE', 'GAME_RESULT_CHECK'].includes(m.type))).toBe(false)
})

for (const kind of ['OMOK', 'DICE'] as const) test(`${kind} confirmed two-player defeat uses the flip without publishing a new emote`, async ({ page }) => {
  const server = await start(page, 2, false, kind)
  await confirm(page)
  server.reaction({ kind: 'FORFEIT' })
  await expect.poll(async () => (await probe(page)).reaction?.kind).toBe('table-flip')
  expect((await probe(page, '102')).reaction).toBeNull()
  expect(server.sent.filter(m => m.type === 'GAME_FORFEIT')).toHaveLength(1)
  expect(server.sent.some(m => m.type === 'WORLD_EMOTE_SEND')).toBe(false)
})

test('an authorized public observer sees the confirmed loss and unwatch clears it', async ({ page }) => {
  const anchor = TABLES[0]!
  const server = await fixture(page, { omok: true, publicSpectator: true, bridge: 3, manualMovement: true, anchorId: anchor.id })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(page.getByLabel('3D 공원').locator('canvas')).toBeVisible({ timeout: 90000 })
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.getByRole('button', { name: 'E 테이블 정보 보기', exact: true }).click()
  await page.getByRole('button', { name: '경기 관전', exact: true }).click()
  await expect(page.getByRole('region', { name: '다리 경기', exact: true })).toBeVisible()
  server.bridgeSnapshot(finished('101'), null, 'SPECTATOR')
  server.reaction({ userId: '102' })
  await expect.poll(async () => (await probe(page, '102')).reaction?.kind).toBe('head-clutch')
  await expect.poll(async () => (await probe(page, '102')).headPitch).toBeGreaterThan(.15)
  await screenshot(page, 'defeat-spectator-head-clutch')
  await page.getByRole('button', { name: '관전 종료', exact: true }).click()
  await expect.poll(async () => page.evaluate(async () => (await import('/src/world/gameReactions.ts' as string)).reactionFor('102'))).toBeNull()
  expect(server.sent.some(m => ['WORLD_EMOTE_SEND', 'GAME_ACTION_SEND', 'GAME_FORFEIT', 'GAME_RESULT_CHECK'].includes(m.type))).toBe(false)
})

for (const distance of [6, 20, 20.01]) test(`public non-subscriber at ${distance}m receives only the current server reaction without GAME_WATCH or seat`, async ({ page }) => {
  if (distance === 6) await page.setViewportSize({ width: 1280, height: 720 })
  const anchor = distance === 6 ? TABLES.find(t => t.pavilionId === 'P1')! : TABLES[0]!
  const server = await fixture(page, { bridge: 3, manualMovement: true, serverTimeOffsetMs: 600000, anchorId: anchor.id,
    position: { x: anchor.position[0], y: anchor.position[1] + .8, z: anchor.position[2] + distance, yaw: Math.PI } })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(async () => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().mapCompatible)).toBe(true)
  await expect.poll(async () => (await probe(page, '102')).visible, { timeout: 90000 }).toBe(true)
  if (distance === 6) {
    await page.evaluate(async () => (await import('/tests/e2e/defeatProbe.ts' as string)).lookTowardReaction('102'))
    await page.locator('canvas').focus(); await page.keyboard.press('v')
    await expect.poll(async () => (await probe(page)).visible).toBe(false)
  }
  const notification = server.reaction({ userId: '102' })
  if (distance > 20) {
    await page.waitForTimeout(150)
    expect((await probe(page, '102')).reaction).toBeNull()
  } else {
    await expect.poll(async () => (await probe(page, '102')).headPitch).toBeGreaterThan(.15)
    const pose = await probe(page, '102')
    expect(pose.reaction?.at).toBe(Date.parse(notification.occurredAt))
    expect(pose.age).toBeGreaterThanOrEqual(0); expect(pose.age).toBeLessThan(3600)
    expect(pose.avatar?.seatIndex).toBe(-1); expect(pose.avatar?.tableId).toBe('')
    server.reaction(notification)
    expect((await probe(page, '102')).reaction?.at).toBe(pose.reaction?.at)
    if (distance === 6) await screenshot(page, 'reaction-nearby-without-watch')
    await expect.poll(async () => (await probe(page, '102')).reaction).toBeNull()
    server.reaction(notification)
    expect((await probe(page, '102')).reaction).toBeNull()
  }
  const scope = await page.evaluate(async () => {
    const session = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    const game = (await import('/src/game/store.ts' as string)).useGame.getState()
    return { seated: session.tableId, watched: session.watchedTableId, game: game.game, watchedGame: game.watchedGameId }
  })
  expect(scope).toEqual({ seated: '', watched: '', game: null, watchedGame: '' })
  expect(server.sent.some(m => ['TABLE_WATCH', 'TABLE_JOIN', 'GAME_WATCH', 'WORLD_EMOTE_SEND', 'GAME_FORFEIT', 'GAME_RESULT_CHECK'].includes(m.type))).toBe(false)
  expect(server.maxActive).toBe(1)
})

test('event before the final snapshot keeps the same server start; snapshots alone never replay it', async ({ page }) => {
  const server = await start(page)
  const notification = server.reaction()
  await expect.poll(async () => (await probe(page)).reaction?.key).toBe(notification.eventId)
  server.bridgeSnapshot(finished())
  await expect.poll(async () => (await probe(page)).headPitch).toBeGreaterThan(.15)
  server.reaction(notification); server.resendGame()
  expect((await probe(page)).reaction?.at).toBe(Date.parse(notification.occurredAt))
})

test('old/future events and restored finished states do not invent a fresh defeat', async ({ page }) => {
  const server = await start(page)
  server.bridgeSnapshot(finished())
  await page.waitForTimeout(100)
  expect((await probe(page)).reaction).toBeNull()
  server.reaction({ occurredAt: new Date(Date.now() - 10000).toISOString() })
  server.reaction({ occurredAt: new Date(Date.now() + 60000).toISOString() })
  await page.waitForTimeout(100)
  expect((await probe(page)).reaction).toBeNull()
  expect(server.sent.some(m => m.type === 'WORLD_EMOTE_SEND')).toBe(false)
})

test('movement and reconnect cancel the pose; the same event is not revived, a fresh game still works', async ({ page }) => {
  const server = await fixture(page, { omok: true, bridge: 3, manualMovement: true })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(async () => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().mapCompatible)).toBe(true)
  await expect.poll(async () => (await probe(page, '102')).visible, { timeout: 90000 }).toBe(true)
  const notification = server.reaction({ userId: '102' })
  await expect.poll(async () => (await probe(page, '102')).headPitch).toBeGreaterThan(.15)
  server.remotePose({ moving: true })
  await expect.poll(async () => (await probe(page, '102')).reaction).toBeNull()
  server.remotePose({ moving: false }); server.reaction(notification)
  expect((await probe(page, '102')).reaction).toBeNull()
  server.close(1012)
  await expect.poll(() => server.connections).toBeGreaterThan(1)
  await expect.poll(async () => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().mapCompatible)).toBe(true)
  server.reaction(notification)
  expect((await probe(page, '102')).reaction).toBeNull()
  server.reaction({ userId: '102', gameId: notification.gameId + '-new' })
  await expect.poll(async () => (await probe(page, '102')).reaction?.gameId).toBe(notification.gameId + '-new')
  expect(server.maxActive).toBe(1)
  expect(server.sent.some(m => ['TABLE_WATCH', 'GAME_WATCH', 'WORLD_EMOTE_SEND'].includes(m.type))).toBe(false)
})
