import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

async function capture(page: Page, name: string) {
  const folder = process.env.SKEWER_FEEDBACK_EVIDENCE
  if (folder) { await mkdir(folder, { recursive: true }); await page.screenshot({ path: path.join(folder, `${name}.png`) }) }
}
function health(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  return async () => {
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(errors).toEqual([])
  }
}
test('PC는 숫자로 재료를 선택하고 Space로만 꽂으며 재료 클릭은 반영하지 않는다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/skewer-chef.html?mode=pc')
  await expect(page).toHaveTitle(/꼬치/)
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-ready', 'true')
  await page.keyboard.press('1')
  const selected = await page.locator('.chef-ingredient-hit[aria-pressed=true]').getAttribute('aria-label')
  const other = page.locator('.chef-ingredient-hit[aria-pressed=false]').first()
  await expect(other).toBeDisabled()
  const box = (await other.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator('.chef-ingredient-hit[aria-pressed=true]')).toHaveAttribute('aria-label', selected!)
  await expect(page.getByTestId('chef-app')).toHaveAttribute('data-stack', '')
  await page.keyboard.press('Space')
  const pantry = (await page.locator('.chef-stage').getAttribute('data-pantry'))!.split(',')
  await expect(page.getByTestId('chef-app')).toHaveAttribute('data-stack', pantry[0])
  await capture(page, 'pc-keyboard-only')
  await verify()
})
test('결과 좌우 너비가 같고 보상 안내가 바뀌며 작은 화면에서도 끝까지 읽는다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/tests/skewer-coop/fixtures/result-panel.html')
  await expect(page).toHaveTitle('꼬치왕 결과 화면 검수')
  const dialog = page.getByRole('dialog', { name: '공동 경기 결과' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-settlement]')).toHaveAttribute('data-settlement', 'SETTLED')
  await expect(dialog.locator('[data-reward-coin-source]')).toContainText('123냥')
  await page.getByText('보상 기준 자세히', { exact: true }).click()
  await expect(dialog).not.toContainText('소수점은 버리고')
  await expect(dialog).toContainText('각자 최대 500냥')
  for (const [width, height] of [[1440, 900], [900, 500], [390, 844]]) {
    await page.setViewportSize({ width, height })
    const left = (await page.locator('.coop-team-record').boundingBox())!
    const right = (await page.locator('.coop-personal-reward').boundingBox())!
    expect(Math.abs(left.width - right.width)).toBeLessThanOrEqual(1)
    const close = (await page.getByRole('button', { name: '공원으로 돌아가기', exact: true }).boundingBox())!
    const ranking = (await page.getByRole('button', { name: '팀 랭킹 보기', exact: true }).boundingBox())!
    expect(Math.abs(close.width - ranking.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(close.height - ranking.height)).toBeLessThanOrEqual(1)
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.getByRole('button', { name: '공원으로 돌아가기', exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: '공원으로 돌아가기', exact: true })).toBeInViewport()
    await page.getByText('보상 기준 자세히', { exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByText('보상 기준 자세히', { exact: true })).toBeInViewport()
    await dialog.evaluate(el => { el.scrollTop = 0 })
    await capture(page, `result-${width}x${height}`)
  }
  await verify()
})
