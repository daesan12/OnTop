import { expect, test } from '@playwright/test'

test('opens free standalone practice from the old VR preview URL and exits to the preview', async ({ page }) => {
  const paymentRequests: string[] = []
  page.on('request', request => {
    if (/\/api\/v1\/(?:wallets\/me|minigames\/skewer\/admissions)/.test(request.url())) paymentRequests.push(request.url())
  })
  await page.goto('/vr-zone.html')
  await expect(page.getByRole('link', { name: /무료 연습 열기/ })).toBeVisible()
  await page.keyboard.press('KeyE')
  await expect(page).toHaveURL(/\/skewer\.html$/)
  await expect(page.getByText('개별 연습 모드')).toBeVisible()
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await expect(page.locator('.sk-app')).toHaveAttribute('data-phase', /countdown|playing/)
  await page.goto('/skewer.html')
  await page.getByRole('button', { name: /나가기/ }).click()
  await expect(page).toHaveURL(/\/vr-zone\.html$/)
  expect(paymentRequests).toEqual([])
})
