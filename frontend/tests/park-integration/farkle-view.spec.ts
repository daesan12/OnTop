import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'

const probe = (page: Page) => page.evaluate(async () => ({
  ...(await import('/tests/e2e/sceneProbe.ts' as string)).farkleProbe(),
  ...(await import('/tests/e2e/sceneProbe.ts' as string)).tablePresentationProbe(),
}))
const prop = (page: Page, name: string, offset: [number, number, number] = [0, 0, 0]) =>
  page.evaluate(async ({ name, offset }) => (await import('/tests/park-integration/farkleMotionProbe.ts' as string)).pointForFarkleProp(name, offset), { name, offset })

for (const own of ['101', '102'] as const) test(`dice player ${own} uses empty left drag and Tab without stealing dice, cup or modal input`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const server = await fixture(page, { generatedPark: true, omok: true, dice: true, manualLobby: true, tabletServer: true, ownUserId: own })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  server.configureTablet({ gameCode: 'DICE', playerCount: 2, betAmountPerPlayer: 1, targetScore: 4000 })
  server.confirmStart()
  const hud = page.getByRole('region', { name: '주사위 경기', exact: true }), canvas = page.getByLabel('3D 공원', { exact: true }).locator('canvas')
  await expect(hud).toBeVisible()
  server.diceSnapshot({ turnUserId: own, turnDeadline: new Date(Date.now() + 30000).toISOString() })
  await expect.poll(async () => (await probe(page)).cameraReady).toBe(true)
  const board = (await probe(page)).camera
  // A click, or a tiny pointer wobble, must leave the board camera alone.
  await page.mouse.move(190, 330); await page.mouse.down(); await page.mouse.move(192, 330); await page.mouse.up()
  expect((await probe(page)).query.lookScope).toBe('')
  // A genuine empty-space drag uses the same seated yaw as the existing right drag.
  await page.mouse.move(190, 330); await page.mouse.down(); await page.mouse.move(280, 330, { steps: 8 }); await page.mouse.up()
  await expect.poll(async () => (await probe(page)).query.lookScope).not.toBe('')
  await expect.poll(async () => (await probe(page)).fov).toBeCloseTo(76, 1)
  expect((await probe(page)).yaw).not.toBe(0)
  await screenshot(page, `farkle-left-drag-${own}`)
  await page.keyboard.press('Tab')
  await expect.poll(async () => (await probe(page)).cameraReady).toBe(true)
  expect((await probe(page)).camera).toEqual(board)
  // Shift+Tab, repeat, IME and modified keys retain their original owners.
  for (const flags of [{ shiftKey: true }, { repeat: true }, { isComposing: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
    await canvas.dispatchEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true, ...flags })
    expect((await probe(page)).query.lookScope).toBe('')
  }
  await page.mouse.move(190, 330); await page.mouse.down({ button: 'right' }); await page.mouse.move(250, 330, { steps: 5 }); await page.mouse.up({ button: 'right' })
  expect((await probe(page)).query.lookScope).not.toBe('')
  await page.keyboard.press('Tab'); await expect.poll(async () => (await probe(page)).cameraReady).toBe(true)

  const cup = await prop(page, 'farkle-cup-table-1', [0, .15, 0])
  await page.mouse.move(cup.x, cup.y); await page.mouse.down(); await page.mouse.move(cup.x + 25, cup.y, { steps: 4 })
  await expect(hud).toContainText('컵을 잡은 채')
  expect((await probe(page)).query.lookScope).toBe('')
  await page.keyboard.press('Tab'); await expect.poll(async () => (await probe(page)).cup).toBe('idle')
  await page.mouse.up()
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND')).toHaveLength(0)
  await page.keyboard.press('Tab'); await expect.poll(async () => (await probe(page)).cameraReady).toBe(true)

  server.diceReply({ kind: 'roll', selectedIds: [] }, { stage: 'SELECTING', rollId: 1, lastEvent: 'ROLL', turnDeadline: new Date(Date.now() + 30000).toISOString(),
    dice: [1, 1, 1, 5, 3, 2].map((value, id) => ({ id, value, held: false })) })
  await page.keyboard.press('KeyR')
  await expect(hud.getByRole('button', { name: '주사위 1: 1', exact: true })).toBeEnabled()
  await expect.poll(async () => (await probe(page)).dice.find((die: { id: string }) => die.id === 'farkle-die-0')?.quaternion).toEqual([0, 0, 0, 1])
  const die = await prop(page, 'farkle-die-0')
  await page.mouse.move(die.x, die.y); await page.mouse.down(); await page.mouse.move(die.x + 15, die.y, { steps: 3 }); await page.mouse.up()
  expect((await probe(page)).query.lookScope).toBe('')
  const wasSelected = await hud.getByRole('button', { name: '주사위 1: 1', exact: true }).getAttribute('aria-pressed') === 'true'
  const settledDie = await prop(page, 'farkle-die-0')
  await page.mouse.click(settledDie.x, settledDie.y)
  await expect(hud.getByRole('button', { name: '주사위 1: 1', exact: true })).toHaveAttribute('aria-pressed', String(!wasSelected))
  if (wasSelected) await hud.getByRole('button', { name: '주사위 1: 1', exact: true }).click()
  await canvas.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Tab')
  await expect.poll(async () => (await probe(page)).cameraReady).toBe(true)
  await expect(hud.getByRole('button', { name: '주사위 1: 1', exact: true })).toHaveAttribute('aria-pressed', 'true')

  const book = await prop(page, 'farkle-scorebook-prop', [0, 0, .07])
  await page.mouse.move(book.x, book.y); await page.mouse.down(); await page.mouse.move(book.x + 15, book.y, { steps: 3 }); await page.mouse.up()
  expect((await probe(page)).query.lookScope).toBe('')
  await page.mouse.click(book.x, book.y)
  const sheet = page.getByRole('dialog', { name: '주사위 점수표', exact: true })
  await expect(sheet).toBeVisible(); await page.keyboard.press('Tab')
  expect((await probe(page)).query.lookScope).toBe('')
  await page.keyboard.press('Escape'); await expect(sheet).toBeHidden()
  await canvas.focus(); await page.keyboard.press('F1')
  const manual = page.getByRole('dialog', { name: '게임 설명서', exact: true })
  await expect(manual).toHaveAttribute('data-phase', 'open'); await page.keyboard.press('Tab')
  expect((await probe(page)).query.lookScope).toBe('')
  await page.keyboard.press('Escape'); await expect(manual).toBeHidden()
  await page.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
  const chat = page.getByRole('region', { name: '경기 채팅', exact: true }).getByRole('textbox')
  await chat.fill('시점 변경 확인'); await chat.press('Tab')
  expect((await probe(page)).query.lookScope).toBe('')
  await expect(chat).toHaveValue('시점 변경 확인')
  await page.getByRole('button', { name: '채팅 입력창 닫기', exact: true }).click()
  server.diceSnapshot({ turnUserId: own === '101' ? '102' : '101' })
  await canvas.focus(); await page.keyboard.press('Tab')
  expect((await probe(page)).query.lookScope).not.toBe('')
  await page.keyboard.press('Tab'); await expect.poll(async () => (await probe(page)).cameraReady).toBe(true)
  await expect(hud.getByRole('button', { name: /^R / })).toBeDisabled()
  await expect(hud.getByRole('button', { name: '주사위 1: 1', exact: true })).toHaveAttribute('aria-pressed', 'false')
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND')).toHaveLength(1)
  await screenshot(page, `farkle-tab-board-${own}`)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
