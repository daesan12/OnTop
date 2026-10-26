import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

const lookPanel = (page: Page) => page.getByRole('region', { name: '마우스 감도', exact: true })
const lookButton = (page: Page) => page.getByRole('complementary', { name: '공원 카메라 조작', exact: true })
  .getByRole('button', { name: /^감도/ })
const yaw = (page: Page) => page.evaluate(async () =>
  (await import('/src/world/cameraPerspective.ts' as string)).viewControls.yaw as number)
async function loaded(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible(); await page.locator('canvas').focus()
}
async function dragTurn(page: Page) {
  const before = await yaw(page)
  await page.mouse.move(700, 700); await page.mouse.down()
  await page.mouse.move(900, 700, { steps: 10 }); await page.mouse.up()
  return before - await yaw(page)
}

test('S15P31B105-208 mouse sensitivity scales the park view and persists', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await fixture(page, { players: 2, position: { x: 0, y: .8, z: 34, yaw: Math.PI } }); await loaded(page)

  await expect(lookButton(page)).toHaveText('감도 80%')
  expect(await dragTurn(page)).toBeCloseTo(200 * 0.004 * 0.8, 2)

  await lookButton(page).click()
  await expect(lookPanel(page)).toBeVisible()
  const percent = lookPanel(page).getByLabel('감도 퍼센트')
  await lookPanel(page).getByLabel('시점 회전 빠르기').fill('0.4')
  await expect(percent).toHaveValue('40')
  await expect(lookButton(page)).toHaveText('감도 40%')

  // Typed numbers apply on a 1% step; out-of-range text is tidied back when leaving the box.
  await percent.fill('7')
  await expect(lookButton(page)).toHaveText('감도 7%')
  await percent.fill('0')
  await expect(lookButton(page)).toHaveText('감도 7%')
  await percent.press('Enter')
  await expect(percent).toHaveValue('7')
  await expect(page.locator('#park-chat-input')).toBeHidden()
  await screenshot(page, 'look-sensitivity-panel')
  await lookPanel(page).getByRole('button', { name: '마우스 감도 닫기', exact: true }).click()
  await expect(lookPanel(page)).toHaveCount(0)

  await page.locator('canvas').focus()
  expect(await dragTurn(page)).toBeCloseTo(200 * 0.004 * 0.07, 3)

  await loaded(page)
  await expect(lookButton(page)).toHaveText('감도 7%')
  await lookButton(page).click()
  await lookPanel(page).getByRole('button', { name: '기본값(80%)', exact: true }).click()
  await expect(lookPanel(page).getByLabel('감도 퍼센트')).toHaveValue('80')
  expect(errors).toEqual([])
})
