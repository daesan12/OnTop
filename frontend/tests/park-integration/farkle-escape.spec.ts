import { expect, test } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'

test('Esc opens a safe forfeit confirmation, respects foreground owners and submits only on explicit confirmation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const server = await fixture(page, { generatedPark: true, omok: true, dice: true, forfeit: true, manualLobby: true, tabletServer: true })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  server.configureTablet({ gameCode: 'DICE', playerCount: 2, betAmountPerPlayer: 1, targetScore: 4000 }); server.confirmStart()
  const hud = page.getByRole('region', { name: '주사위 경기', exact: true })
  const canvas = page.getByLabel('3D 공원', { exact: true }).locator('canvas')
  const confirmation = page.getByRole('dialog', { name: '기권 확인', exact: true })
  await expect(hud).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).farkleProbe().cameraReady)).toBe(true)
  await canvas.focus(); await page.keyboard.press('Escape')
  await expect(confirmation).toBeVisible(); await expect(confirmation).toContainText('기권하면 이번 경기는 패배로 처리됩니다.')
  await expect(confirmation.getByRole('button', { name: '계속 플레이', exact: true })).toBeFocused()
  await screenshot(page, 'escape-forfeit-desktop')
  // Neither gameplay shortcuts nor Enter on the safe default can send a request.
  await page.keyboard.press('KeyR'); await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyT')
  await expect(page.getByRole('dialog', { name: '주사위 점수표', exact: true })).toBeHidden()
  await confirmation.dispatchEvent('keydown', { code: 'Escape', key: 'Escape', repeat: true, bubbles: true, cancelable: true })
  await expect(confirmation).toBeVisible()
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); await expect(confirmation.locator(':focus')).toHaveCount(1) }
  await confirmation.getByRole('button', { name: '계속 플레이', exact: true }).focus()
  await page.keyboard.press('Enter'); await expect(confirmation).toBeHidden()
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND' || message.type.includes('FORFEIT'))).toHaveLength(0)
  await canvas.focus(); await page.keyboard.press('Escape'); await expect(confirmation).toBeVisible()
  await page.keyboard.press('Escape'); await expect(confirmation).toBeHidden()

  // Foreground owners consume their own Escape without opening another overlay.
  await canvas.focus(); await page.keyboard.press('KeyT')
  const sheet = page.getByRole('dialog', { name: '주사위 점수표', exact: true })
  await expect(sheet).toBeVisible(); await page.keyboard.press('Escape'); await expect(sheet).toBeHidden(); await expect(confirmation).toBeHidden()
  await canvas.focus(); await page.keyboard.press('F1')
  const manual = page.getByRole('dialog', { name: '게임 설명서', exact: true })
  await expect(manual).toHaveAttribute('data-phase', 'open'); await page.keyboard.press('Escape')
  await expect(manual).toBeHidden(); await expect(confirmation).toBeHidden()
  await page.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
  const chat = page.getByRole('region', { name: '경기 채팅', exact: true }).getByRole('textbox')
  await chat.fill('입력 보존'); await chat.press('Escape'); await expect(confirmation).toBeHidden()
  const menu = hud.locator('.farkle-settings')
  await menu.locator('summary').click(); await page.keyboard.press('Escape')
  await expect(menu).not.toHaveAttribute('open'); await expect(confirmation).toBeHidden()
  // Escape on the now-closed summary must still reach the gameplay shortcut.
  await page.keyboard.press('Escape'); await expect(confirmation).toBeVisible()
  for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size)
    for (const name of ['기권 확정', '계속 플레이']) {
      const button = confirmation.getByRole('button', { name, exact: true })
      await button.scrollIntoViewIfNeeded(); await expect(button).toBeInViewport({ ratio: 1 })
    }
    await screenshot(page, 'escape-forfeit-' + size.width)
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
  expect(server.sent.filter(message => message.type.includes('FORFEIT'))).toHaveLength(0)
  server.forfeitMode('hold')
  await confirmation.getByRole('button', { name: '기권 확정', exact: true }).click()
  await expect.poll(() => server.sent.filter(message => message.type === 'GAME_FORFEIT').length).toBe(1)
  await expect(confirmation).toContainText('기권 요청 확인 중')
  await expect(confirmation.getByRole('button', { name: '닫기', exact: true })).toBeFocused()
  await page.keyboard.press('KeyR'); await page.keyboard.press('Enter')
  await expect(confirmation).toBeHidden()
  await canvas.focus(); await page.keyboard.press('Escape'); await expect(confirmation).toBeVisible()
  await expect(confirmation).toContainText('기권 요청 확인 중')
  expect(server.sent.filter(message => message.type === 'GAME_FORFEIT')).toHaveLength(1)
  server.completeForfeit()
  await expect(confirmation).toBeHidden()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([])
})
