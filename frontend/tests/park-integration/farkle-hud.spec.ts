import { expect, test } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'
import path from 'node:path'
import os from 'node:os'

test('Farkle HUD keeps selection, shortcuts and scrollable controls across screen sizes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  // DICE remains unavailable in the production selector. Exercise its retained renderer
  // using confirmed fixture events without enabling a construction game for real users.
  const server = await fixture(page, { generatedPark: true, omok: true, dice: true, manualLobby: true, tabletServer: true,
    publicProfiles: { '102': { nickname: '솔바람', characterGender: 'FEMALE' } } })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '게임 태블릿', exact: true })).toBeVisible()
  server.configureTablet({ gameCode: 'DICE', playerCount: 2, betAmountPerPlayer: 1, targetScore: 4000 })
  server.confirmStart()
  const hud = page.getByRole('region', { name: '주사위 경기', exact: true })
  const actions = page.getByRole('region', { name: '주사위 조작', exact: true })
  const roll = hud.getByRole('button', { name: /^R / })
  const bank = hud.getByRole('button', { name: /^Q 점수 챙기기/ })
  await expect(hud).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).farkleProbe().cameraReady)).toBe(true)
  await expect(bank).toBeDisabled()
  server.diceReply({ kind: 'roll', selectedIds: [] }, { stage: 'SELECTING', rollId: 1, lastEvent: 'ROLL', scores: [1200, 2750], turnScore: 500,
    dice: [1, 1, 1, 5, 3, 2].map((value, id) => ({ id, value, held: false })) })
  await roll.click()
  for (const id of [1, 2, 3, 4]) await hud.getByRole('button', { name: new RegExp(`^주사위 ${id}:`) }).click()
  await expect(bank).toHaveAccessibleName('Q 점수 챙기기 · 1,550점')
  await expect(bank).toBeEnabled()
  await expect(roll).toHaveAccessibleName('R 한 번 더!')
  for (const viewport of [{ width: 1672, height: 941 }, { width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    await expect(hud.locator('.farkle-scoreboard')).toBeInViewport({ ratio: 1 })
    await expect(actions).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await actions.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `${viewport.width}×${viewport.height} controls fit horizontally`).toBe(true)
    for (const control of [roll, bank, hud.getByRole('button', { name: 'T 점수표', exact: true })]) {
      await control.scrollIntoViewIfNeeded()
      await expect(control).toBeInViewport({ ratio: 1 })
    }
    await screenshot(page, `farkle-hud-${viewport.width}x${viewport.height}`)
  }
  await page.setViewportSize({ width: 1672, height: 941 })
  const actionsBefore = server.sent.filter(message => message.type === 'GAME_ACTION_SEND').length
  await hud.getByRole('button', { name: 'T 점수표', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '주사위 점수표', exact: true })
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('header .dice-face')).toHaveCount(0)
  await sheet.locator('.scorebook-page').evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})))
  })
  expect(await sheet.locator('.scorebook-page').evaluate(element => getComputedStyle(element).transform)).toBe('none')
  for (const face of await sheet.locator('.dice-face').all()) {
    const value = Number(await face.getAttribute('data-face'))
    await expect(face.locator('svg circle[data-pip]')).toHaveCount(value)
  }
  await expect(sheet).toContainText('싹쓸이!'); await expect(sheet).toContainText('허탕!')
  await expect(sheet).not.toContainText(/HOT DICE|BUST|Bank/)
  await expect(page.getByRole('region', { name: /채팅/, exact: false })).toBeHidden()
  await page.keyboard.press('KeyR'); await page.keyboard.press('KeyQ')
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND')).toHaveLength(actionsBefore)
  await screenshot(page, 'farkle-hud-scorebook')
  await page.setViewportSize({ width: 1672, height: 1080 })
  await sheet.screenshot({ path: path.join(process.env.QA_ARTIFACT_DIR ?? os.tmpdir(), 'farkle-scorebook-detail.png') })
  for (const viewport of [{ width: 1672, height: 941 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    expect(await sheet.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await sheet.locator('footer small').scrollIntoViewIfNeeded()
    await expect(sheet.locator('footer small')).toBeInViewport({ ratio: 1 })
    await sheet.getByRole('button', { name: '점수표 닫기' }).scrollIntoViewIfNeeded()
    await expect(sheet.getByRole('button', { name: '점수표 닫기' })).toBeInViewport({ ratio: 1 })
    const title = (await sheet.getByRole('heading', { name: '주사위 점수표', exact: true }).boundingBox())!
    const close = (await sheet.getByRole('button', { name: '점수표 닫기' }).boundingBox())!
    expect(Math.abs(title.y + title.height / 2 - close.y - close.height / 2)).toBeLessThanOrEqual(1)
    expect(title.x + title.width).toBeLessThan(close.x)
    if (viewport.width === 320) await screenshot(page, 'farkle-scorebook-320x568')
  }
  await page.setViewportSize({ width: 1672, height: 941 })
  await page.keyboard.press('Escape'); await expect(sheet).toBeHidden()
  const chat = page.getByRole('region', { name: /채팅/, exact: false })
  await expect(chat).toBeVisible()
  // The new button presentation must send the existing Bank contract unchanged.
  server.diceReply({ kind: 'bank', selectedIds: [0, 1, 2, 3] }, { turnUserId: '102', round: 2, turnScore: 0, scores: [2750, 2750], stage: 'AWAITING_ROLL', lastEvent: 'BANK', dice: [] })
  await bank.click()
  await expect(roll).toBeDisabled(); await expect(bank).toBeDisabled()
  await expect(hud).toContainText('솔바람 차례')
  await expect(hud.locator('.farkle-scoreboard')).toContainText('2,750')
  server.diceSnapshot({ turnUserId: '101', round: 3, stage: 'SELECTING', hotDice: true, lastEvent: 'HOT_DICE',
    dice: [1, 2, 3, 4, 5, 6].map((value, id) => ({ id, value, held: false })) })
  await expect(hud.getByRole('status')).toContainText('싹쓸이!')
  server.diceSnapshot({ turnUserId: '102', round: 4, stage: 'AWAITING_ROLL', hotDice: false, lastEvent: 'BUST', dice: [] })
  await expect(hud.getByRole('status')).toContainText('허탕!')
  await expect(hud).not.toContainText(/HOT DICE|BUST|Bank|재굴리기/)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
