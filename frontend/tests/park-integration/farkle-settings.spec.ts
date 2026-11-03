import { expect, test } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'

test('six settings keep equal sizes and demonstrate view, manual, pin, sound, refresh and forfeit confirmation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const server = await fixture(page, { generatedPark: true, omok: true, dice: true, manualLobby: true, tabletServer: true,
    publicProfiles: { '102': { nickname: '솔바람', characterGender: 'FEMALE' } } })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  server.configureTablet({ gameCode: 'DICE', playerCount: 2, betAmountPerPlayer: 1, targetScore: 4000 }); server.confirmStart()
  const hud = page.getByRole('region', { name: '주사위 경기', exact: true })
  const probe = () => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).farkleProbe())
  await expect(hud).toBeVisible(); await expect.poll(async () => (await probe()).cameraReady).toBe(true)
  const dice = [1, 1, 1, 5, 3, 2].map((value, id) => ({ id, value, held: false }))
  server.diceReply({ kind: 'roll', selectedIds: [] }, { dice, stage: 'SELECTING', rollId: 1, lastEvent: 'ROLL', scores: [2200, 2750],
    turnDeadline: new Date(Date.now() + 30000).toISOString() })
  await hud.getByRole('button', { name: /^R / }).click()
  for (const id of [1, 2, 3, 4]) await hud.getByRole('button', { name: new RegExp(`^주사위 ${id}:`) }).click()
  const menu = hud.locator('.farkle-settings'), tools = menu.locator('.farkle-tools')
  await menu.locator('summary').click(); await expect(tools).toBeVisible()
  for (const size of [{ width: 1920, height: 1080 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size)
    const boxes = await tools.getByRole('button').evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect(); return { width: r.width, height: r.height }
    }))
    expect(boxes).toHaveLength(6)
    for (const box of boxes) { expect(box.width).toBeCloseTo(boxes[0]!.width, 1); expect(box.height).toBe(44) }
    await expect(tools.getByRole('button', { name: '기권', exact: true })).toBeInViewport({ ratio: 1 })
  }
  await page.setViewportSize({ width: 1920, height: 1080 }); await screenshot(page, 'settings-00-equal-buttons')
  await tools.getByRole('button', { name: '주변 둘러보기', exact: true }).click()
  await expect(tools.getByRole('button', { name: '판으로 돌아가기', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await probe()).fov).toBeCloseTo(76, 1)
  await screenshot(page, 'settings-01-look-around')
  await tools.getByRole('button', { name: '판으로 돌아가기', exact: true }).click()
  await expect.poll(async () => (await probe()).cameraReady).toBe(true)

  await tools.getByRole('button', { name: '게임 설명', exact: true }).click()
  const manual = page.getByRole('dialog', { name: '게임 설명서', exact: true })
  await expect(manual).toHaveAttribute('data-phase', 'open'); await expect(manual).toContainText('주사위 한 판')
  await screenshot(page, 'settings-02-manual')
  await page.keyboard.press('Escape'); await expect(manual).toBeHidden()

  server.diceSnapshot({ turnUserId: '102', round: 2, rollId: 2, lastEvent: 'ROLL', turnDeadline: new Date(Date.now() + 30000).toISOString() })
  await expect.poll(async () => (await probe()).cameraReady).toBe(false)
  await tools.getByRole('button', { name: '판 시점 고정', exact: true }).click()
  await expect(tools.getByRole('button', { name: '판 시점 고정', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await probe()).cameraReady).toBe(true)
  await expect(hud).toContainText('솔바람 차례'); await screenshot(page, 'settings-03-board-pinned')
  await tools.getByRole('button', { name: '판 시점 고정', exact: true }).click()
  server.diceSnapshot({ turnUserId: '101', round: 3, turnDeadline: new Date(Date.now() + 30000).toISOString() })
  await expect.poll(async () => (await probe()).cameraReady).toBe(true)

  await tools.getByRole('button', { name: '소리 켜짐', exact: true }).click()
  await expect(tools.getByRole('button', { name: '소리 꺼짐', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await screenshot(page, 'settings-04-sound-off')
  await tools.getByRole('button', { name: '소리 꺼짐', exact: true }).click()
  await expect(tools.getByRole('button', { name: '소리 켜짐', exact: true })).toHaveAttribute('aria-pressed', 'true')

  const checks = server.sent.filter(message => message.type === 'GAME_STATE_CHECK').length
  await tools.getByRole('button', { name: '최신 주사위 확인', exact: true }).click()
  await expect.poll(() => server.sent.filter(message => message.type === 'GAME_STATE_CHECK').length).toBe(checks + 1)
  await expect(tools.getByRole('button', { name: '최신 주사위 확인', exact: true })).toBeEnabled()
  await screenshot(page, 'settings-05-state-refreshed')

  await tools.getByRole('button', { name: '기권', exact: true }).click()
  const confirmation = tools.getByRole('group', { name: '기권 확인', exact: true })
  await expect(confirmation).toContainText('기권은 되돌릴 수 없어요.')
  await expect(confirmation.getByRole('button', { name: '기권 확정', exact: true })).toBeVisible()
  await screenshot(page, 'settings-06-forfeit-confirmation')
  for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size)
    await confirmation.getByRole('button', { name: '계속 플레이', exact: true }).scrollIntoViewIfNeeded()
    await expect(confirmation.getByRole('button', { name: '계속 플레이', exact: true })).toBeInViewport({ ratio: 1 })
    await confirmation.getByRole('button', { name: '계속 플레이', exact: true }).click({ timeout: 15000 })
    await expect(confirmation).toHaveCount(0)
    await tools.getByRole('button', { name: '기권', exact: true }).click()
    await expect(confirmation).toBeVisible()
  }
  await confirmation.getByRole('button', { name: '계속 플레이', exact: true }).click({ timeout: 15000 })
  await expect(confirmation).toHaveCount(0)
  expect(server.sent.filter(message => message.type.includes('FORFEIT'))).toHaveLength(0)
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND')).toHaveLength(1)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([])
})
