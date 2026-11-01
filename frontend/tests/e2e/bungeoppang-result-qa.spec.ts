import { expect, test } from '@playwright/test'
import { bungeoppangFixture } from './bungeoppangFixture'
import { screenshot } from './contractFixture'

test('reference result layout shows pending, confirmed, failed lookup and mobile states without overlapping controls', async ({ page }) => {
  await bungeoppangFixture(page)
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click()
  await expect(page.getByRole('button', { name: '시작', exact: true })).toBeEnabled()
  // Render-state fixture only: no game completion or currency is forged in product code.
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
    const { createGrill } = await import('/src/features/bungeoppang/rules.ts' as string)
    const { BUNGEOPPANG } = await import('/src/features/bungeoppang/config.ts' as string)
    useBungeoppang.setState({ phase: 'result', grill: { ...createGrill(Array(64).fill(100), BUNGEOPPANG), score: 120, made: 8, failed: 2 }, result: null, submitting: false })
  })
  const result = page.getByRole('dialog', { name: '붕어빵 결과', exact: true })
  await expect(result.getByRole('heading', { name: '붕어빵 도전 결과' })).toBeVisible()
  await expect(result).toContainText('보상 확인 중')
  await expect(result).toContainText('8개'); await expect(result).toContainText('2회')
  await expect(result.getByRole('button', { name: '다시 도전', exact: true })).toBeDisabled()
  await expect(result.locator('.bung-result-hero img')).toBeVisible()
  await expect.poll(() => result.locator('.bung-result-hero img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await screenshot(page, 'qa-bungeoppang-result-pending')
  await result.getByRole('button', { name: '설명서', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '게임 설명서', exact: true })).toHaveAttribute('data-phase', 'open')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '게임 설명서', exact: true })).toHaveCount(0)
  await page.evaluate(async () => (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.setState({
    result: { score: 120, made: 8, golden: 6, failed: 2, wasted: 0, maxCombo: 4, coinsCalculated: 8, coinsGranted: 8, todayEarned: 8, dailyCap: 500, capReached: false },
  }))
  await expect(result).toContainText('받은 엽전 8냥')
  await expect(result.getByRole('button', { name: '다시 도전', exact: true })).toBeEnabled()
  await page.setViewportSize({ width: 1672, height: 941 }); await screenshot(page, 'qa-bungeoppang-result-confirmed')
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    const buttons = result.locator('.paper-actions')
    await expect(buttons).toBeInViewport()
    const box = (await buttons.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    await screenshot(page, `qa-bungeoppang-result-${viewport.width}`)
  }
  await page.evaluate(async () => (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.setState({
    result: null, submitError: { retryable: true, message: '일시적인 접속 지연일 수 있어요. 잠시 후 다시 확인해주세요.' },
  }))
  await expect(result).toContainText('보상 내역을 확인하지 못했어요')
  await expect(result.getByRole('button', { name: '같은 결과 다시 확인' })).toBeVisible()
  await screenshot(page, 'qa-bungeoppang-result-lookup-error')
})
