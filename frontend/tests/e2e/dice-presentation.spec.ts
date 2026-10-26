import { expect, test, type Page } from '@playwright/test'
import { TABLES, tableScale, tableSeats } from '../../src/config'
import { fixture, screenshot } from './contractFixture'
import { facilityCatalog } from '../fixtures/facilityCatalog'
import { benchTable } from '../../src/features/interactions/benchSpectator'

const panel = (p: Page) => p.getByRole('region', { name: '주사위 경기', exact: true })
const probe = (p: Page): Promise<ReturnType<typeof import('./sceneProbe').farkleProbe>> => p.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).farkleProbe())
const values = (faces: number[], held: number[] = []) => faces.map((value, id) => ({ id, value, held: held.includes(id) }))
async function loaded(p: Page) {
  await p.goto('/park'); await expect(p).toHaveTitle('OnTop')
  await expect(p.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(p.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => p.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().tables.length)).toBeGreaterThan(0)
}
async function start(p: Page, own: '101' | '102' = '101', anchor = TABLES[0]!) {
  const server = await fixture(p, { omok: true, dice: true, m09: true, ownUserId: own, anchorId: anchor.id })
  await loaded(p)
  await p.evaluate(async id => (await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.inspectTable(id), anchor.id)
  await p.getByRole('button', { name: '앉기', exact: true }).click()
  if (own !== '101') server.host(own)
  await p.getByRole('button', { name: '주사위 한 판 선택', exact: true }).click()
  await p.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  if (own !== '101') server.diceSnapshot({ turnUserId: own })
  await expect(panel(p)).toContainText('내 차례')
  return server
}
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', e => list.push(e.message)); page.on('console', m => { if (m.type() === 'error') list.push(m.text()) })
})
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0) })

for (const own of ['101', '102'] as const) for (const main of [false, true]) test(`original dice camera auto turn, seat ${own}, ${main ? 'main pavilion' : 'outdoor'}`, async ({ page }) => {
  const anchor = main ? TABLES.find(t => t.pavilionId === 'P0')! : TABLES[0]!
  const server = await start(page, own, anchor), scale = tableScale(anchor), seat = tableSeats(anchor)[own === '101' ? 0 : 1]!
  const expected = [anchor.position[0], anchor.position[1] + 1.06 + 2.09 * scale, anchor.position[2] + Math.sign(seat.z) * 1.15 * scale]
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1000, height: 700 }]) {
    await page.setViewportSize(viewport)
    await expect.poll(async () => (await probe(page)).cameraReady).toBe(true)
    const current = await probe(page)
    expect(current.fov).toBeCloseTo(48, 1)
    current.camera.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 2))
    expect(Math.sign(current.direction[2]!)).toBe(-Math.sign(seat.z))
  }
  await screenshot(page, `dice-camera-${own}-${main ? 'main' : 'outdoor'}`)
  await panel(page).getByRole('button', { name: '주변 둘러보기', exact: true }).click()
  await expect.poll(async () => (await probe(page)).fov).toBeCloseTo(76, 1)
  await expect.poll(async () => (await probe(page)).cameraReady).toBe(false)
  await panel(page).getByRole('button', { name: '판으로 돌아가기', exact: true }).click()
  await expect.poll(async () => (await probe(page)).cameraReady).toBe(true)
  server.diceSnapshot({ turnUserId: own === '101' ? '102' : '101' })
  await expect.poll(async () => (await probe(page)).fov).toBeCloseTo(76, 1)
  await expect.poll(async () => (await probe(page)).camera[1]).toBeCloseTo(anchor.position[1] + 1.95, 2)
  await panel(page).getByRole('button', { name: '판 시점 고정', exact: true }).click()
  await expect.poll(async () => (await probe(page)).cameraReady).toBe(true)
  expect((await probe(page)).fov).toBeCloseTo(48, 1)
  await expect(panel(page).getByRole('button', { name: 'R 굴리기', exact: true })).toBeDisabled()
  await panel(page).getByRole('button', { name: '판 시점 고정', exact: true }).click()
  await expect.poll(async () => (await probe(page)).fov).toBeCloseTo(76, 1)
  server.diceSnapshot({ turnUserId: own })
  await expect.poll(async () => (await probe(page)).cameraReady).toBe(true)
  expect(server.sent.some(m => m.type === 'GAME_ACTION_SEND')).toBe(false)
})

test('real Web Audio starts on a gesture, mute preserves rolls, and result cleanup closes the context', async ({ page }) => {
  await page.addInitScript(() => {
    const contexts: AudioContext[] = [], audit = { tones: 0, closed: 0, states: () => contexts.map(c => c.state) }
    const NativeAudio = window.AudioContext
    window.AudioContext = class extends NativeAudio {
      constructor() { super(); contexts.push(this) }
      override createOscillator() {
        const oscillator = super.createOscillator(), start = oscillator.start.bind(oscillator)
        oscillator.start = (...args) => { audit.tones++; start(...args) }
        return oscillator
      }
      override close() { audit.closed++; return super.close() }
    }
    Object.defineProperty(window, '__diceAudio', { value: audit })
  })
  const audit = () => page.evaluate(() => {
    const a = (window as unknown as { __diceAudio: { tones: number; closed: number; states(): string[] } }).__diceAudio
    return { tones: a.tones, closed: a.closed, states: a.states() }
  })
  const server = await start(page)
  expect((await audit()).states).toEqual([])
  await panel(page).getByRole('button', { name: '소리 켜짐', exact: true }).click()
  server.diceReply({ kind: 'roll', selectedIds: [] }, { dice: values([1, 2, 3, 4, 5, 6]), stage: 'SELECTING', rollId: 1, lastEvent: 'ROLL' })
  await panel(page).getByRole('button', { name: 'R 굴리기', exact: true }).click()
  const first = panel(page).getByRole('button', { name: '주사위 1: 1', exact: true })
  await expect(first).toBeEnabled(); expect((await audit()).tones).toBe(0); expect((await audit()).states).toEqual([])
  await panel(page).getByRole('button', { name: '소리 꺼짐', exact: true }).click()
  await expect.poll(async () => (await audit()).states).toEqual(['running'])
  await first.click()
  server.diceReply({ kind: 'roll', selectedIds: [0] }, { dice: values([1, 1, 3, 4, 5, 6], [0]), rollId: 2 })
  await panel(page).getByRole('button', { name: 'R 선택 보관 후 재굴림', exact: true }).click()
  await expect.poll(async () => (await audit()).tones).toBeGreaterThan(0)
  await panel(page).getByRole('button', { name: '소리 켜짐', exact: true }).click()
  const muted = (await audit()).tones
  await expect.poll(() => page.evaluate(async () => performance.now() >= (await import('/src/game/farkle/controls.ts' as string)).useDiceUI.getState().animationUntil)).toBe(true)
  expect((await audit()).tones).toBe(muted)
  server.diceSnapshot({ status: 'FINISHED', stage: 'FINISHED', turnUserId: null, turnDeadline: null, winnerUserId: '101', endReason: 'TARGET_REACHED', endedAt: new Date().toISOString() })
  await expect(page.getByRole('region', { name: '테이블 함께 보기', exact: true })).toContainText('경기 결과')
  await expect.poll(async () => (await audit()).closed).toBe(1)
  expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND')).toHaveLength(2)
  expect(server.maxActive).toBe(1)
})

async function watch(p: Page) {
  const bench = facilityCatalog.facilities.find(d => d.kind === 'BENCH' && benchTable(d.facilityId)?.pavilionId === 'P1')!, anchor = benchTable(bench.facilityId)!
  const server = await fixture(p, { publicSpectator: true, dice: true, manualMovement: true, position: bench.center, anchorId: anchor.id })
  await loaded(p)
  await expect.poll(() => p.evaluate(async () => (await import('/src/features/facilities/state.ts' as string)).useFacilityState.getState().ready)).toBe(true)
  expect(await p.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id, 0), bench.facilityId)).toBe(true)
  await p.getByRole('button', { name: '가까이 관전', exact: true }).click()
  await expect(panel(p)).toContainText('관전 전용')
  return server
}
test('original spectator HUD shows confirmed public rolls, BUST/Bank and the final score without player controls', async ({ page }) => {
  const server = await watch(page)
  await expect(panel(page)).toHaveAttribute('data-rolling', 'false')
  await page.locator('canvas').focus(); await page.keyboard.press('KeyR'); await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyT')
  await expect(page.getByRole('dialog', { name: '주사위 점수표', exact: true })).toHaveCount(0)
  server.diceSnapshot({ dice: values([1, 2, 3, 4, 5, 6]), stage: 'SELECTING', rollId: 1, hotDice: true, lastEvent: 'HOT_DICE', turnScore: 750 }, 'SPECTATOR')
  await expect(panel(page)).toHaveAttribute('data-rolling', 'true')
  await expect(panel(page).getByLabel('이번 굴림').getByLabel('굴리는 중')).toHaveCount(6)
  await expect(panel(page)).toHaveAttribute('data-rolling', 'false')
  await expect(panel(page).getByLabel('이번 굴림').getByLabel('주사위 1: 1', { exact: true })).toBeVisible()
  expect((await panel(page).boundingBox())!.height).toBeLessThan(600)
  await screenshot(page, 'dice-spectator-public-roll')
  server.diceSnapshot({ dice: [], stage: 'AWAITING_ROLL', turnUserId: '102', round: 2, turnScore: 0, hotDice: false, lastEvent: 'BUST' }, 'SPECTATOR')
  await expect(panel(page).getByRole('status')).toContainText('BUST · 이번 턴 점수 소멸')
  await expect(panel(page).getByLabel('이번 굴림').locator('span')).toHaveCount(0)
  server.diceSnapshot({ scores: [0, 500], turnUserId: '101', round: 3, lastEvent: 'BANK' }, 'SPECTATOR')
  await expect(panel(page).getByRole('status')).toContainText('BANK · 점수 저장')
  await expect(panel(page).getByLabel('주사위 점수판')).toContainText('500점')
  server.diceSnapshot({ status: 'FINISHED', stage: 'FINISHED', turnUserId: null, turnDeadline: null, winnerUserId: '102', endReason: 'TARGET_REACHED', endedAt: new Date().toISOString() }, 'SPECTATOR')
  await expect(panel(page).getByRole('status')).toContainText('승리 · 경기 종료')
  await expect(panel(page).getByRole('button', { name: /기권|정산|준비|굴리기|Bank/ })).toHaveCount(0)
  await screenshot(page, 'dice-spectator-finished')
  await panel(page).getByRole('button', { name: '관전 종료', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
  expect(server.sent.some(m => ['TABLE_JOIN', 'GAME_ACTION_SEND', 'GAME_FORFEIT', 'GAME_RESULT_CHECK'].includes(m.type))).toBe(false)
})
test('spectator HUD keeps its views, manual and exit reachable above bench controls on a small PC', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 })
  const server = await watch(page)
  await panel(page).getByRole('button', { name: '테이블 둘러보기', exact: true }).click()
  await expect(panel(page).getByRole('button', { name: '테이블 둘러보기', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await panel(page).getByRole('button', { name: '공개 판 보기', exact: true }).click()
  const box = await panel(page).boundingBox(), dock = await page.getByRole('complementary', { name: '가까운 상호작용', exact: true }).boundingBox()
  expect(box!.y + box!.height).toBeLessThanOrEqual(dock!.y)
  await expect(panel(page).getByRole('button', { name: '관전 종료', exact: true })).toBeInViewport({ ratio: 1 })
  await panel(page).getByRole('button', { name: '게임 설명', exact: true }).click()
  await expect(page.getByRole('dialog', { name: /설명서/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /설명서/ })).toHaveCount(0)
  await screenshot(page, 'dice-spectator-small-pc')
  await panel(page).getByRole('button', { name: '관전 종료', exact: true }).click()
  expect(server.sent.some(m => ['TABLE_JOIN', 'GAME_ACTION_SEND', 'GAME_FORFEIT', 'GAME_RESULT_CHECK'].includes(m.type))).toBe(false)
})
