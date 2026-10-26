import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import type { PreparationContext, PreparationSelection } from '../../src/features/tableLobby/tabletModel'
import { bungeoppangFixture } from './bungeoppangFixture'

async function openTable(page: Page, anchorId = 'table-1') {
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(async () => {
    await page.evaluate(async id => (await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.inspectTable(id), anchorId)
    await expect(page.getByRole('button', { name: '앉기', exact: true })).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 15000 })
  await page.getByRole('button', { name: '앉기', exact: true }).click()
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await expect(tablet).toBeVisible()
  await expect.poll(() => tablet.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.99)
  await page.waitForTimeout(700)
  return tablet
}
async function bindManualPort(page: Page, server: Awaited<ReturnType<typeof fixture>>) {
  const calls: { kind: string; context: unknown; selection?: unknown }[] = []
  await page.exposeFunction('tabletConfigureFixture', (context: PreparationContext, selection: PreparationSelection) => {
    calls.push({ kind: 'configure', context, selection }); server.configureTablet(selection); return true
  })
  await page.exposeFunction('tabletStartFixture', (context: PreparationContext) => { calls.push({ kind: 'start', context }); server.confirmStart(); return true })
  await page.evaluate(async () => {
    const { bindTablePreparation } = await import('/src/features/tableLobby/tabletModel.ts' as string)
    bindTablePreparation({ manualStart: true, selectedPlayers: (table: { capacity: number }) => table.capacity,
      configure: (context: unknown, selection: unknown) => (window as any).tabletConfigureFixture(context, selection),
      start: (context: unknown) => (window as any).tabletStartFixture(context) })
  })
  return calls
}

test('tablet screen powers on, selects game and safely blocks legacy automatic start', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const server = await fixture(page, { omok: true })
  const tablet = await openTable(page)
  await expect(tablet.getByText('어떤 게임을 할까요?')).toBeVisible()
  await screenshot(page, 'tablet-01-selection')
  await tablet.getByLabel('1인 참가비').fill('20')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await expect(tablet.getByText('함께 시작할까요?')).toBeVisible()
  expect(server.sent.find(m => m.type === 'GAME_SELECT')?.payload).toEqual({ gameCode: 'OMOK', betAmountPerPlayer: 20 })
  await tablet.getByRole('checkbox').check()
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeDisabled()
  await expect(tablet.getByRole('button', { name: '준비 완료', exact: true })).toBeDisabled()
  expect(server.sent.filter(m => m.type === 'READY_SET')).toHaveLength(0)
  await screenshot(page, 'tablet-02-ready-two')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

for (const variant of [
  { game: 'OMOK', name: '오목', count: 2, panel: '오목 경기', options: { omok: true } },
  { game: 'DICE', name: '주사위 한 판', count: 2, panel: '주사위 경기', options: { dice: true } },
  { game: 'ONE_CARD', name: '원카드', count: 3, panel: '원카드 경기', options: { onecard: 3 as const } },
  { game: 'LIAR_BRIDGE', name: '거짓말 다리 건너기', count: 4, panel: '거짓말 다리 경기', options: { bridge: 4 as const } },
]) test(`manual adapter: ${variant.game}, ${variant.count} seats, explicit start and existing gameplay`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  const server = await fixture(page, { omok: true, ...variant.options, manualLobby: true, players: 4,
    publicProfiles: { '101': { nickname: '나', characterGender: 'MALE' }, '102': { nickname: '솔바람', characterGender: 'FEMALE' },
      '103': { nickname: '돌담', characterGender: 'MALE' }, '104': { nickname: '나무', characterGender: 'FEMALE' } } })
  const tablet = await openTable(page), calls = await bindManualPort(page, server)
  await tablet.getByRole('button', { name: variant.name, exact: false }).first().click()
  if (variant.game === 'ONE_CARD') await screenshot(page, 'tablet-onecard-selection-v2')
  if (variant.game === 'DICE' || variant.game === 'LIAR_BRIDGE') await screenshot(page, `tablet-${variant.game.toLowerCase()}-selection-v2`)
  if (variant.count > 2) await tablet.getByRole('button', { name: `${variant.count}인`, exact: true }).click()
  if (variant.game === 'DICE') await tablet.getByLabel('주사위 목표 점수').selectOption('4000')
  await tablet.getByLabel('1인 참가비').fill('20')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await expect(page.locator('.tablet-person')).toHaveCount(variant.count)
  await expect(tablet.getByRole('button', { name: '준비 완료', exact: true })).toBeDisabled()
  await tablet.getByRole('checkbox').check()
  await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  await expect(tablet.getByRole('button', { name: '준비 취소', exact: true })).toBeEnabled()
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeDisabled()
  server.readyTabletOthers(true)
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeEnabled()
  await expect(tablet.getByRole('checkbox')).toBeChecked()
  await screenshot(page, `tablet-ready-${variant.game}-${variant.count}`)
  expect(calls[0]?.selection).toMatchObject({ gameCode: variant.game, playerCount: variant.count, betAmountPerPlayer: 20 })
  if (variant.game === 'DICE') expect(calls[0]?.selection).toMatchObject({ targetScore: 4000 })
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '게임 태블릿', exact: true })).toHaveCount(0)
  await expect.poll(() => page.evaluate(async () => {
    const { useGame } = await import('/src/game/store.ts' as string)
    return useGame.getState().game?.gameId
  })).toMatch(/fixture-confirmed/)
  expect(calls.filter(c => c.kind === 'start')).toHaveLength(1)
  await expect(page.locator('.prototype-game, .park-runtime-panel').filter({ hasText: /내 차례|본인 차례|차례|주사위/ }).first()).toBeVisible()
  await page.waitForTimeout(500)
  await screenshot(page, `tablet-playing-${variant.game}`)
  expect(errors).toEqual([])
})

test('result popup preserves pending settlement, server host and next-round permission', async ({ page }) => {
  const server = await fixture(page, { omok: true, manualLobby: true })
  const tablet = await openTable(page); await bindManualPort(page, server)
  await tablet.getByLabel('1인 참가비').fill('20')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox').check(); await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true); await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  server.finishGame('FIVE_IN_A_ROW', '101')
  const result = page.getByRole('dialog', { name: '경기 결과', exact: true })
  await expect(result).toBeVisible(); await expect(result.getByRole('heading', { name: '승리', exact: true })).toBeVisible()
  await expect(result.locator('.paper-close svg')).toBeVisible()
  await expect(result.getByText('보상 확인 중', { exact: true })).toBeVisible()
  await expect(result.getByRole('button', { name: '다음 판 준비', exact: true })).toBeDisabled()
  await page.waitForTimeout(350); await screenshot(page, 'tablet-result-pending')
  await result.getByRole('button', { name: '결과 창 닫기' }).click()
  await page.getByRole('button', { name: '경기 결과 다시 보기' }).click()
  await expect(result).toBeVisible()
  server.settle(); await expect(result).toContainText('정산 완료')
  await expect(result.getByRole('button', { name: '다음 판 준비', exact: true })).toBeDisabled()
  server.host('102'); server.nextRound()
  await expect(result.getByRole('button', { name: '다음 판 준비', exact: true })).toBeEnabled()
  await screenshot(page, 'tablet-result-settled')
  await result.getByRole('button', { name: '다음 판 준비', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '게임 태블릿' })).toBeVisible()
  await expect(page.getByRole('button', { name: '게임 시작', exact: true })).toHaveCount(0)
})

test('narrow tablet layout keeps choices and actions reachable without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await fixture(page, { omok: true })
  const tablet = await openTable(page)
  await tablet.getByLabel('1인 참가비').fill('20')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await expect(tablet.getByRole('button', { name: '일어나기', exact: true })).toBeEnabled()
  await tablet.getByRole('button', { name: '일어나기', exact: true }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  await screenshot(page, 'tablet-mobile-ready')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await tablet.getByRole('button', { name: '일어나기', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '게임 태블릿' })).toHaveCount(0)
})

test('minigame paper popup separates provisional score, pending reward and confirmed result', async ({ page }) => {
  await bungeoppangFixture(page)
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click()
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'countdown')
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
    const { createGrill } = await import('/src/features/bungeoppang/rules.ts' as string)
    const { BUNGEOPPANG } = await import('/src/features/bungeoppang/config.ts' as string)
    const grill = { ...createGrill(Array(64).fill(100), BUNGEOPPANG), score: 120, made: 12, failed: 2 }
    useBungeoppang.setState({ phase: 'result', grill, result: null, submitting: false })
  })
  const result = page.getByRole('dialog', { name: '붕어빵 결과', exact: true })
  await expect(result).toBeVisible(); await expect(result).toContainText('120점')
  await expect(result).toContainText('보상 확인 중')
  await expect(result.getByRole('button', { name: '다시 도전', exact: true })).toBeDisabled()
  await page.waitForTimeout(800); await screenshot(page, 'tablet-minigame-result-pending')
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
    useBungeoppang.setState({ result: { score: 120, made: 12, golden: 8, failed: 2, wasted: 0, maxCombo: 5,
      coinsCalculated: 12, coinsGranted: 12, todayEarned: 12, dailyCap: 100, capReached: false } })
  })
  await expect(result).toContainText('받은 엽전 12냥')
  await expect(result.getByRole('button', { name: '다시 도전', exact: true })).toBeEnabled()
  await result.getByRole('button', { name: '공원으로', exact: true }).click()
  await expect(result).toHaveCount(0)
})

test('reference-size pavilion tablet has aligned controls and clears the tabletop', async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 })
  const server = await fixture(page, { omok: true, anchorId: 'table-5', manualLobby: true })
  const tablet = await openTable(page, 'table-5'); await bindManualPort(page, server)
  await screenshot(page, 'tablet-native-pavilion-selection')
  await tablet.getByLabel('1인 참가비').fill('20')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox').check()
  await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true)
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeInViewport()
  await page.waitForTimeout(500); await screenshot(page, 'tablet-native-pavilion-ready')
  await expect(tablet.getByRole('button', { name: '일어나기', exact: true })).toBeInViewport()
})
