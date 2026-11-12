import { test, expect } from '@playwright/test'
import { bungeoppangFixture } from './bungeoppangFixture'
test('default result opens a preparation screen without calling an unconfirmed ranking API or inventing participants', async ({ page }) => {
  await bungeoppangFixture(page); let reads = 0
  page.on('request', request => { if (request.url().includes('/bungeoppang/rankings')) reads++ })
  await page.goto('/park'); await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().status)).toBe('connected')
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click()
  await expect(page.getByRole('button', { name: '시작', exact: true })).toBeEnabled()
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
    const { createGrill } = await import('/src/features/bungeoppang/rules.ts' as string)
    const { BUNGEOPPANG } = await import('/src/features/bungeoppang/config.ts' as string)
    useBungeoppang.setState({ phase: 'result', grill: { ...createGrill(Array(64).fill(100), BUNGEOPPANG), made: 8, failed: 2, score: 120 },
      result: { score: 120, made: 8, golden: 6, failed: 2, wasted: 0, maxCombo: 4, coinsCalculated: 8, coinsGranted: 8, todayEarned: 8, dailyCap: 1000, capReached: false },
      submitting: false, starting: false, confirmExit: false, walletError: null, startError: null, submitError: null })
  })
  await expect(page.getByRole('region', { name: '전체 랭킹 요약', exact: true })).toContainText('전체 랭킹 준비 중')
  await page.getByRole('button', { name: '랭킹 보기', exact: true }).click()
  const ranking = page.getByRole('dialog', { name: '붕어빵 전체 랭킹', exact: true })
  await expect(ranking).toContainText('전체 랭킹을 준비하고 있어요')
  await expect(ranking.locator('tbody tr')).toHaveCount(0)
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: '붕어빵 결과', exact: true })).toBeVisible()
  expect(reads).toBe(0)
})
