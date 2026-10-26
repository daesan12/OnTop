import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

const manual = (page: Page) => page.getByRole('dialog', { name: '게임 설명서', exact: true })
const control = (page: Page) => manual(page).getByRole('region', { name: '공원 설정', exact: true })
  .getByRole('group', { name: '마우스 감도', exact: true })
const yaw = (page: Page) => page.evaluate(async () =>
  (await import('/src/world/cameraPerspective.ts' as string)).viewControls.yaw as number)
async function loaded(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible(); await page.locator('canvas').focus()
}
async function openManual(page: Page) {
  await page.keyboard.press('F1'); await expect(manual(page)).toHaveAttribute('data-phase', 'open')
}
async function closeManual(page: Page) {
  await page.keyboard.press('Escape'); await expect(manual(page)).toHaveCount(0)
  await page.locator('canvas').focus()
}
async function dragTurn(page: Page) {
  const before = await yaw(page)
  await page.mouse.move(700, 700); await page.mouse.down()
  await page.mouse.move(900, 700, { steps: 10 }); await page.mouse.up()
  return before - await yaw(page)
}

test('S15P31B105-208 F1 mouse sensitivity scales the park view and persists', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await fixture(page, { players: 2, position: { x: 0, y: .8, z: 34, yaw: Math.PI } }); await loaded(page)

  // 100% is the park default, which turns at 80% of the original fixed rate.
  expect(await dragTurn(page)).toBeCloseTo(200 * 0.004 * 0.8, 2)

  await openManual(page)
  const percent = control(page).getByLabel('마우스 감도 퍼센트')
  await expect(percent).toHaveValue('100')
  await control(page).getByLabel('마우스 감도 빠르기').fill('40')
  await expect(percent).toHaveValue('40')

  // Typed numbers apply on a 1% step; out-of-range text is tidied back when leaving the box.
  await percent.fill('7')
  await percent.fill('0')
  await percent.press('Enter')
  await expect(percent).toHaveValue('7')
  await expect(manual(page)).toHaveAttribute('data-phase', 'open')
  await screenshot(page, 'look-sensitivity-manual')
  await closeManual(page)

  expect(await dragTurn(page)).toBeCloseTo(200 * 0.004 * 0.8 * 0.07, 3)

  await loaded(page)
  await openManual(page)
  await expect(control(page).getByLabel('마우스 감도 퍼센트')).toHaveValue('7')
  expect(errors).toEqual([])
})
