import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { bungeoppangFixture } from './bungeoppangFixture'
import type { Result } from '../../src/game/protocol'

const flights = (page: Page) => page.locator('.reward-coin-flight')
const tablet = process.env.REWARD_TABLET !== 'false'
const kinds = ['OMOK', 'DICE', 'ONE_CARD', 'LIAR_BRIDGE'] as const
async function loaded(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().status)).toBe('connected')
  await expect(page.getByLabel('보유 엽전', { exact: true })).toHaveText('100냥')
}
async function board(page: Page, kind: typeof kinds[number]) {
  const server = await fixture(page, { omok: true, manualMovement: true,
    ...(kind === 'DICE' ? { dice: true } : kind === 'ONE_CARD' ? { m09: true, onecard: 2 } : kind === 'LIAR_BRIDGE' ? { m09: true, bridge: 2 } : {}) })
  await loaded(page)
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
  await page.getByRole('button', { name: '앉기', exact: true }).click(); server.confirmStart()
  await expect.poll(() => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game?.gameId)).toBeTruthy()
  const gameId = await page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game!.gameId)
  const result: Result = { version: 1, gameSessionId: gameId, gameCode: kind, status: 'FINISHED', endReason: 'NORMAL',
    settlementStatus: 'PENDING', betAmountPerPlayer: 12, myCoinDelta: null,
    participants: [{ userId: '101', result: 'WIN' }, { userId: '102', result: 'LOSE' }], endedAt: new Date().toISOString() }
  return { server, result }
}
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', error => list.push(error.message))
  page.on('console', message => { if (message.type() === 'error') list.push(message.text()) })
})
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0) })

for (const kind of kinds) test(`${kind}: confirmed result flies to the real wallet once; pending, repeated and reopened receipts do not replay`, async ({ page }) => {
  const { server, result } = await board(page, kind)
  server.finishGame(); server.notifyResult(result)
  const resultUI = tablet ? page.getByRole('dialog', { name: '경기 결과', exact: true }) : page.getByRole('region', { name: '테이블 함께 보기', exact: true })
  await expect(resultUI).toBeVisible(); await expect(flights(page)).toHaveCount(0)
  server.setWalletBalance(347)
  const settled: Result = { ...result, version: 2, settlementStatus: 'SETTLED', myCoinDelta: 12 }
  server.notifyResult(settled)
  await expect(flights(page)).toHaveCount(1); await expect(flights(page).locator('img')).toHaveCount(8)
  await expect(flights(page)).toHaveCSS('pointer-events', 'none')
  await expect(page.getByLabel('보유 엽전', { exact: true })).toHaveText('347냥') // server value, never 100+12
  await page.waitForTimeout(500)
  if (kind === 'OMOK') await screenshot(page, `reward-board-flight-${tablet ? 'tablet' : 'legacy'}`)
  await expect(flights(page)).toHaveAttribute('data-arrived', 'true')
  await expect(flights(page).locator('b')).toHaveText('+12냥')
  const target = await page.locator('[data-wallet-coin-target]').boundingBox()
  const landed = await flights(page).locator('.reward-coin-flight__arrival').evaluate(node => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y }))
  expect(landed.x).toBeCloseTo(target!.x + target!.width / 2, 0); expect(landed.y).toBeCloseTo(target!.y + target!.height / 2, 0)
  await expect(flights(page)).toHaveCount(0)
  server.notifyResult({ ...settled, version: 3 })
  if (tablet) {
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: '경기 결과 다시 보기', exact: true }).click()
    await expect(resultUI).toBeVisible()
  }
  await page.waitForTimeout(300); await expect(flights(page)).toHaveCount(0)
  await expect(page.getByLabel('보유 엽전', { exact: true })).toHaveText('347냥')
})

test('zero, lost, invalid and foreign board awards never launch; disconnect clears a live flight', async ({ page }) => {
  const { server, result } = await board(page, 'OMOK')
  server.finishGame()
  for (const [i, patch] of [
    { myCoinDelta: 0, participants: result.participants.map(p => ({ ...p, result: 'DRAW' })) },
    { myCoinDelta: -12, participants: [{ userId: '101', result: 'LOSE' }, { userId: '102', result: 'WIN' }] },
    { myCoinDelta: 0, status: 'INVALID' as const, participants: result.participants.map(p => ({ ...p, result: null })) },
  ].entries()) {
    server.notifyResult({ ...result, version: i + 2, settlementStatus: 'SETTLED', ...patch })
    await page.waitForTimeout(150); await expect(flights(page)).toHaveCount(0)
  }
  server.notifyResult({ ...result, gameSessionId: 'foreign-game', version: 6, settlementStatus: 'SETTLED', myCoinDelta: 12 })
  await page.waitForTimeout(150); await expect(flights(page)).toHaveCount(0)
  server.notifyResult({ ...result, version: 7, settlementStatus: 'SETTLED', myCoinDelta: 12 })
  await expect(flights(page)).toHaveCount(1)
  server.endSession(); await expect(flights(page)).toHaveCount(0)
})

async function miniResult(page: Page, amount: number | null, id = 'reward-minigame') {
  await page.evaluate(async ({ amount, id }) => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
    const { createGrill } = await import('/src/features/bungeoppang/rulesV4.ts' as string)
    const { BUNGEOPPANG_V4 } = await import('/src/features/bungeoppang/config.ts' as string)
    useBungeoppang.setState({ phase: 'result', gameId: id,
      grill: { ...createGrill(Array(400).fill(100), { orderId: '1', orderIndex: 0, items: { bean: 2, custard: 0, pizza: 0, chocolate: 0 } }, BUNGEOPPANG_V4), made: 8, failed: 2, score: 120 },
      result: amount === null ? null : { score: 120, made: 8, golden: 6, failed: 2, wasted: 0, maxCombo: 4, coinsCalculated: 8, coinsGranted: amount, todayEarned: amount, dailyCap: 500, capReached: false },
      submitting: false, starting: false, confirmExit: false, walletError: null, startError: null, submitError: null })
  }, { amount, id })
}
async function mini(page: Page) {
  await bungeoppangFixture(page); await loaded(page)
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click()
  await expect(page.getByRole('button', { name: '시작', exact: true })).toBeEnabled()
}
test('minigame payout bursts from the result amount, arrives in the upper-right wallet, and stays cosmetic', async ({ page }) => {
  await mini(page); await miniResult(page, null)
  await expect(page.getByRole('dialog', { name: '붕어빵 결과', exact: true })).toContainText('보상 확인 중')
  await expect(flights(page)).toHaveCount(0)
  await miniResult(page, 8)
  await expect(flights(page)).toHaveCount(1)
  await page.waitForTimeout(500); await screenshot(page, 'reward-minigame-flight')
  await expect(flights(page)).toHaveAttribute('data-arrived', 'true')
  await expect(flights(page).locator('b')).toHaveText('+8냥')
  await screenshot(page, 'reward-minigame-arrived')
  await expect(page.getByLabel('보유 엽전', { exact: true })).toHaveText('100냥') // fixture did not publish a wallet change
  await expect(flights(page)).toHaveCount(0)
  await page.getByRole('button', { name: '랭킹 보기', exact: true }).click()
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); await expect(flights(page)).toHaveCount(0)
  await miniResult(page, 0, 'no-reward'); await page.waitForTimeout(150); await expect(flights(page)).toHaveCount(0)
})
test('mobile reduced motion shows only the wallet arrival, never flying coins, and cancels on leaving', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' })
  await mini(page); await miniResult(page, 8, 'mobile-reward')
  await page.locator('[data-reward-coin-source]').scrollIntoViewIfNeeded()
  await expect(flights(page)).toHaveAttribute('data-motion', 'reduced')
  await expect(flights(page).locator('img').first()).toBeHidden()
  await expect(flights(page)).toHaveAttribute('data-arrived', 'true')
  await screenshot(page, 'reward-mobile-reduced')
  await expect(flights(page)).toHaveCount(0)
  await miniResult(page, 8, 'mobile-reward-2'); await expect(flights(page)).toHaveCount(1)
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))) // a visible page does not cancel
  await expect(flights(page)).toHaveCount(1)
  await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.setState({ roomId: 'another-channel' }))
  await expect(flights(page)).toHaveCount(0)
})
