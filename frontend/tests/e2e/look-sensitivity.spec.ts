import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

const panel = (page: Page) => page.getByRole('region', { name: '설정', exact: true })
const control = (page: Page) => panel(page)
  .getByRole('group', { name: '마우스 감도', exact: true })
const yaw = (page: Page) => page.evaluate(async () =>
  (await import('/src/world/cameraPerspective.ts' as string)).viewControls.yaw as number)
async function loaded(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible(); await page.locator('canvas').focus()
  // Drag only turns the view once the park session can be controlled.
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/world/roamingCamera.ts' as string)).canControlRoamingCamera())).toBe(true)
}
// The control moved from the F1 manual to the dock's 설정 panel (S15P31B105-256).
async function openSettings(page: Page) {
  await page.keyboard.press('KeyO'); await expect(panel(page)).toBeVisible()
}
async function closeSettings(page: Page) {
  await page.keyboard.press('Escape'); await expect(panel(page)).toHaveCount(0)
  await page.locator('canvas').focus()
}
async function dragTurn(page: Page) {
  const before = await yaw(page)
  await page.mouse.move(700, 700); await page.mouse.down()
  await page.mouse.move(900, 700, { steps: 10 }); await page.mouse.up()
  return before - await yaw(page)
}

test('S15P31B105-208 settings mouse sensitivity scales the park view and persists', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await fixture(page, { players: 2, position: { x: 0, y: .8, z: 34, yaw: Math.PI } }); await loaded(page)

  // 100% is the park default, which turns at 80% of the original fixed rate.
  expect(await dragTurn(page)).toBeCloseTo(200 * 0.004 * 0.8, 2)

  await openSettings(page)
  const percent = control(page).getByLabel('마우스 감도 퍼센트')
  await expect(percent).toHaveValue('100')
  await control(page).getByLabel('마우스 감도 빠르기').fill('40')
  await expect(percent).toHaveValue('40')

  // Typed numbers apply on a 1% step; out-of-range text is tidied back when leaving the box.
  await percent.fill('7')
  await percent.fill('0')
  await percent.press('Enter')
  await expect(percent).toHaveValue('7')
  await expect(panel(page)).toBeVisible()
  await screenshot(page, 'look-sensitivity-settings')
  await closeSettings(page)

  expect(await dragTurn(page)).toBeCloseTo(200 * 0.004 * 0.8 * 0.07, 3)

  await loaded(page)
  await openSettings(page)
  await expect(control(page).getByLabel('마우스 감도 퍼센트')).toHaveValue('7')
  expect(errors).toEqual([])
})
