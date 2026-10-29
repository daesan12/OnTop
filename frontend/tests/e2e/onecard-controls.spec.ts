import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fixture } from './contractFixture'

async function shot(page: Page, name: string) {
  const dir = process.env.ONECARD_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'ontop-onecard-controls')
  await fs.mkdir(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, name + '.png'), animations: 'disabled' })
}
async function start(page: Page, count: 2 | 3 = 2) {
  const server = await fixture(page, { omok: true, m09: true, onecard: count, players: count, forfeit: true })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(page.getByRole('button', { name: '공원 지도', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '공원 지도', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '공원 지도창', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(async () => {
    await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
    await expect(page.getByRole('button', { name: '앉기', exact: true })).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 15000 })
  await page.getByRole('button', { name: '앉기', exact: true }).click()
  await page.getByLabel('1인 참가비').fill('1'); await page.getByRole('button', { name: '원카드 선택', exact: true }).click()
  await page.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  await expect(page.getByRole('timer', { name: '차례 남은 시간' })).toBeVisible()
  return server
}
async function iconInsideComposer(page: Page, open: boolean) {
  const composer = page.locator('.park-chat__composer')
  const icon = open ? composer.getByRole('button', { name: '메시지 보내기', exact: true }) : composer.locator('.park-chat__send-icon')
  const outer = (await composer.boundingBox())!, inner = (await icon.boundingBox())!
  expect(inner.x).toBeGreaterThanOrEqual(outer.x); expect(inner.y).toBeGreaterThanOrEqual(outer.y)
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + .5)
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + .5)
}

test('gameplay map lock, contained chat icons and Escape confirm/cancel send only one explicit forfeit', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  const server = await start(page)
  await expect(page.getByRole('button', { name: '공원 지도', exact: true })).toBeDisabled()
  await expect(page.locator('.onecard-game-hud .mini-tools')).toHaveCount(0)
  for (const name of ['기권', '원카드 규칙', '최신 원카드 확인']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  await page.locator('canvas').focus(); await page.keyboard.press('KeyM')
  await page.evaluate(async () => (await import('/src/features/navigation/navigationState.ts' as string)).openParkMap())
  await expect(page.getByRole('dialog', { name: '공원 지도창', exact: true })).toBeHidden()
  await iconInsideComposer(page, false)
  await page.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
  await iconInsideComposer(page, true)
  await page.getByRole('textbox', { name: '주변 채팅 메시지' }).fill('확인 중')
  await page.keyboard.press('Escape')
  const dialog = page.getByRole('dialog', { name: '기권하시겠습니까?', exact: true })
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '하트 4', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).toContainText('배팅한 엽전은 모두 잃게 됩니다.')
  await expect(dialog.getByRole('button', { name: '계속 플레이', exact: true })).toBeFocused()
  await shot(page, 'onecard-escape-confirm')
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: '하트 4', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(server.sent.filter(m => m.type === 'GAME_FORFEIT')).toHaveLength(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await iconInsideComposer(page, false)
  await page.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click(); await iconInsideComposer(page, true)
  await page.keyboard.press('Escape'); await page.locator('canvas').focus()
  server.forfeitMode('hold'); await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: '기권 확정', exact: true }).click({ clickCount: 2 })
  await expect(dialog).toContainText('기권 요청 확인 중')
  expect(server.sent.filter(m => m.type === 'GAME_FORFEIT')).toHaveLength(1)
  server.completeForfeit()
  await expect(dialog).toBeHidden()
  await expect.poll(() => server.forfeitApplications).toBe(1)
  expect(server.sent.filter(m => m.type === 'TABLE_LEAVE')).toHaveLength(0)
  expect(errors).toEqual([])
})

test('an eliminated One Card player can explicitly recover an unconfirmed forfeit receipt', async ({ page }) => {
  const server = await start(page, 3)
  server.forfeitMode('lost-after-apply'); await page.locator('canvas').focus(); await page.keyboard.press('Escape')
  const dialog = page.getByRole('dialog', { name: '기권하시겠습니까?', exact: true })
  await dialog.getByRole('button', { name: '기권 확정', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(async () => (await import('/src/game/forfeit.ts' as string)).useForfeit.getState().attempt))?.status, { timeout: 15000 }).toBe('uncertain')
  await expect(dialog.getByRole('button', { name: '같은 기권 요청 확인', exact: true })).toBeEnabled()
  server.forfeitMode('approve'); await dialog.getByRole('button', { name: '같은 기권 요청 확인', exact: true }).click()
  await expect(dialog).toBeHidden()
  const requests = server.sent.filter(m => m.type === 'GAME_FORFEIT')
  expect(requests).toHaveLength(2); expect(requests[0]!.payload).toEqual(requests[1]!.payload)
  expect(server.forfeitApplications).toBe(1)
})
