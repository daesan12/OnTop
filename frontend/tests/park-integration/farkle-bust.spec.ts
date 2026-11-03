import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'

const hud = (page: Page) => page.getByRole('region', { name: '주사위 경기', exact: true })
const probe = (page: Page) => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).farkleProbe())
const presentation = (page: Page) => page.evaluate(async () => {
  const { useDiceUI } = await import('/src/game/farkle/controls.ts' as string)
  const { useGame } = await import('/src/game/store.ts' as string)
  return { bust: useDiceUI.getState().bust, until: useDiceUI.getState().animationUntil, game: useGame.getState().game?.dice }
})
async function start(page: Page, own: '101' | '102' = '101') {
  const server = await fixture(page, { generatedPark: true, omok: true, dice: true, manualLobby: true, tabletServer: true, ownUserId: own,
    publicProfiles: { '102': { nickname: '솔바람', characterGender: 'FEMALE' } } })
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '게임 태블릿', exact: true })).toBeVisible()
  server.configureTablet({ gameCode: 'DICE', playerCount: 2, betAmountPerPlayer: 1, targetScore: 4000 })
  server.confirmStart(); await expect(hud(page)).toBeVisible()
  if (own === '102') {
    await hud(page).getByLabel('게임 설정', { exact: true }).click()
    await hud(page).getByRole('button', { name: '판 시점 고정', exact: true }).click()
    await hud(page).getByLabel('게임 설정', { exact: true }).click()
  }
  await expect.poll(async () => (await probe(page)).cameraReady).toBe(true)
  await page.evaluate(async () => import('/tests/park-integration/farkleMotionProbe.ts' as string))
  return server
}

test('empty BUST plays the first roll and own reroll before the result and camera handoff', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const server = await start(page)
  const roll = hud(page).getByRole('button', { name: /^R / })
  const beforeCamera = (await probe(page)).camera
  server.diceReply({ kind: 'roll', selectedIds: [] }, { dice: [], stage: 'AWAITING_ROLL', rollId: 1, round: 2,
    lastEvent: 'BUST', turnUserId: '102', turnScore: 0, turnDeadline: new Date(Date.now() + 30000).toISOString() })
  await roll.click()
  await expect(hud(page)).toHaveAttribute('data-presentation', 'bust-rolling')
  await expect(hud(page).getByRole('status')).not.toContainText('허탕!')
  const state = await presentation(page), deadline = state.game!.turnDeadline
  expect(state.game!.turnUserId).toBe('102'); expect(state.game!.dice).toEqual([])
  expect(state.bust!.rollingIds).toHaveLength(6)
  const elapsed = await page.evaluate(() => performance.now()) - state.bust!.at
  await page.waitForTimeout(Math.max(0, 450 - elapsed))
  const motion = await page.evaluate(async () => (await import('/tests/park-integration/farkleMotionProbe.ts' as string)).farkleMotionProbe())
  expect(motion.rolling.filter((die: { visible: boolean }) => die.visible)).toHaveLength(6)
  expect((await probe(page)).camera.every((value: number, i: number) => Math.abs(value - beforeCamera[i]!) < .01)).toBe(true)
  expect((await probe(page)).dice).toHaveLength(0)
  await screenshot(page, 'farkle-bust-rolling')
  const count = server.sent.filter(message => message.type === 'GAME_ACTION_SEND').length
  await page.keyboard.press('KeyR'); await page.keyboard.press('KeyQ')
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND')).toHaveLength(count)
  await expect(hud(page)).toHaveAttribute('data-presentation', 'bust-result')
  await expect(hud(page).getByRole('status')).toContainText('허탕!')
  await screenshot(page, 'farkle-bust-result')
  server.diceSnapshot({ lastEvent: 'BUST' })
  expect((await presentation(page)).until).toBe(state.until)
  await expect(hud(page)).toHaveAttribute('data-presentation', 'live')
  await expect(hud(page)).toContainText('솔바람 차례')
  expect((await presentation(page)).game!.turnDeadline).toBe(deadline)
  // Four held + one selected => only the last die should move in the reroll.
  server.diceSnapshot({ turnUserId: '101', round: 3, rollId: 3, stage: 'SELECTING', lastEvent: 'ROLL',
    turnDeadline: new Date(Date.now() + 30000).toISOString(),
    dice: [1, 1, 1, 1, 1, 2].map((value, id) => ({ id, value, held: id < 4 })) })
  await expect.poll(async () => (await probe(page)).cameraReady).toBe(true)
  await hud(page).getByRole('button', { name: '주사위 5: 1', exact: true }).click()
  server.diceReply({ kind: 'roll', selectedIds: [4] }, { dice: [], stage: 'AWAITING_ROLL', rollId: 4, round: 4, lastEvent: 'BUST', turnUserId: '102' })
  await roll.click()
  await expect(hud(page)).toHaveAttribute('data-presentation', 'bust-rolling')
  expect((await presentation(page)).bust!.rollingIds).toEqual([5])
  await expect(hud(page)).toHaveAttribute('data-presentation', 'live')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('next player cannot act during the cutscene and recovery cancels it without replay', async ({ page }) => {
  const server = await start(page, '102')
  const roll = hud(page).getByRole('button', { name: /^R / })
  server.diceSnapshot({ dice: [], stage: 'AWAITING_ROLL', rollId: 1, round: 2, lastEvent: 'BUST', turnUserId: '102',
    turnDeadline: new Date(Date.now() + 30000).toISOString() })
  await expect(hud(page)).toHaveAttribute('data-presentation', 'bust-rolling')
  await expect(roll).toBeDisabled()
  await expect(hud(page)).toHaveAttribute('data-presentation', 'bust-result')
  await expect(roll).toBeDisabled()
  await expect(roll).toBeEnabled()
  server.diceSnapshot({ turnUserId: '101', round: 3, rollId: 2, lastEvent: 'BUST' })
  await expect(hud(page)).toHaveAttribute('data-presentation', 'bust-rolling')
  server.recoveryPending()
  await expect(hud(page)).toHaveAttribute('data-presentation', 'live')
  server.restoreGame()
  expect((await presentation(page)).bust).toBeNull()
  await expect(hud(page)).toHaveAttribute('data-presentation', 'live')
})
