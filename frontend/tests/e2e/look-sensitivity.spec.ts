import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

const lookPanel = (page: Page) => page.getByRole('region', { name: '마우스 감도', exact: true })
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

const lookButton = (page: Page) => page.getByRole('complementary', { name: '공원 카메라 조작', exact: true })
  .getByRole('button', { name: /^감도/ })

test('S15P31B105-208 mouse sensitivity scales the park view and persists', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await fixture(page, { players: 2, position: { x: 0, y: .8, z: 34, yaw: Math.PI } }); await loaded(page)

  const normal = await dragTurn(page)
  expect(normal).toBeCloseTo(200 * 0.004, 2)

  await expect(lookButton(page)).toHaveText('감도 1.0')
  await lookButton(page).click()
  await expect(lookPanel(page)).toBeVisible()
  await lookPanel(page).getByLabel('시점 회전 배율').fill('0.5')
  await expect(lookPanel(page).locator('output')).toHaveText('0.5배')
  await expect(lookButton(page)).toHaveText('감도 0.5')
  await screenshot(page, 'look-sensitivity-panel')
  await lookPanel(page).getByRole('button', { name: '마우스 감도 닫기', exact: true }).click()
  await expect(lookPanel(page)).toHaveCount(0)

  await page.locator('canvas').focus()
  expect(await dragTurn(page)).toBeCloseTo(normal * 0.5, 2)

  await loaded(page)
  await expect(lookButton(page)).toHaveText('감도 0.5')
  await lookButton(page).click()
  await lookPanel(page).getByRole('button', { name: '기본값(1.0배)', exact: true }).click()
  await expect(lookPanel(page).locator('output')).toHaveText('1.0배')
  expect(errors).toEqual([])
})
