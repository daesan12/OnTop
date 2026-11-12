import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
import { bungeoppangFixture } from '../e2e/bungeoppangFixture'

const shot = (page: Page, name: string) => page.screenshot({ animations: 'disabled', path: path.join(process.env.QA_ARTIFACT_DIR ?? os.tmpdir(), `${name}.png`) })
async function checkScroll(page: Page, label: string) {
  const dialog = page.getByRole('dialog', { name: label, exact: true })
  expect(await dialog.evaluate(el => ({ width: el.scrollWidth, box: el.clientWidth, hidden: getComputedStyle(el).scrollbarWidth })))
    .toMatchObject({ hidden: 'none' })
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await dialog.getByRole('button').last().scrollIntoViewIfNeeded()
  await expect(dialog.getByRole('button').last()).toBeInViewport()
  await dialog.focus()
  await page.keyboard.press('Control+Home')
}

test('붕어빵 결과 상세는 기존 구성의 환산 문구만 표시하고 판별 지급 기준을 보존한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await bungeoppangFixture(page)
  await page.route('**/api/v1/minigames/bungeoppang/rankings?**', route => route.fulfill({ json: {
    rulesVersion: 'v5', durationMs: 120000, period: 'ALL_TIME', basis: 'PERSONAL_BEST', snapshotId: 'detail-review',
    updatedAt: new Date().toISOString(), totalParticipants: 0, items: [], me: null, nextCursor: null,
  } }))
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click()
  await expect(page.getByRole('button', { name: '시작', exact: true })).toBeEnabled()
  await expect(page.getByRole('region', { name: '붕어빵 굽기 시작' })).not.toContainText('5점당 1냥')
  // 화면 재현용 상태이며 실제 서버 지급이나 지갑 변경을 수행하지 않는다.
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
    const { createGrill } = await import('/src/features/bungeoppang/rulesV5.ts' as string)
    const { BUNGEOPPANG_V5: rules } = await import('/src/features/bungeoppang/config.ts' as string)
    const order = { orderId: '1', orderIndex: 0, customerSlot: 0, availableAfterSeq: 0, items: { ...rules.firstOrder } }
    useBungeoppang.setState({ phase: 'result', rules,
      grill: { ...createGrill(Array(rules.heatListLength).fill(100), [order], rules), score: 120, made: 8, failed: 2, served: 6, customersServed: 3 }, submitting: false,
      result: { score: 120, made: 8, golden: 6, failed: 2, wasted: 0, maxCombo: 4, served: 6, customersServed: 3,
        coinsCalculated: 24, coinsGranted: 24, todayEarned: 274, dailyCap: 1000, capReached: false } })
  })
  const dialog = page.getByRole('dialog', { name: '붕어빵 결과', exact: true })
  await expect(dialog).toContainText('받은 엽전 24냥')
  await expect(dialog).toContainText('미니게임 합산 수입 274 / 1000냥')
  await dialog.getByText('장사 기록 자세히', { exact: true }).click()
  await expect(dialog.locator('details')).toContainText('엽전 환산 5점당 1냥')
  await expect(dialog.locator('details')).toContainText('양면 황금 6개 · 버린 개수 0개 · 최고 콤보 4')
  await expect(dialog.locator('details')).toContainText('전달한 개수 6개 · 완료한 주문 3개')
  await expect(dialog).not.toContainText('점프맵과 합산')
  await expect(dialog).not.toContainText('한국 시간')
  await expect(dialog.locator('.bung-reward-detail')).toHaveCount(0)
  await dialog.locator('details').scrollIntoViewIfNeeded()
  await shot(page, 'bungeoppang-result-details')
  for (const viewport of [{ width: 390, height: 844 }, { width: 800, height: 450 }]) {
    await page.setViewportSize(viewport)
    await checkScroll(page, '붕어빵 결과')
    await dialog.locator('details').scrollIntoViewIfNeeded()
    await shot(page, `bungeoppang-details-${viewport.width}`)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
    useBungeoppang.setState({ rules: { ...useBungeoppang.getState().rules!, pointsPerCoin: 15 },
      result: { ...useBungeoppang.getState().result!, coinsCalculated: 8, coinsGranted: 8 } })
  })
  await expect(dialog.locator('details')).toContainText('엽전 환산 15점당 1냥')
  expect(errors).toEqual([])
})

test('점프맵 완료 화면은 완주 250냥과 구간 내역 및 한도 감액을 구분하고 작은 화면에서도 스크롤된다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/jumpmap-preview.html')
  await page.getByRole('button', { name: '출발 안내 보기', exact: true }).click()
  await expect(page.getByLabel('점프맵 보상 안내')).toContainText('완주하면 총 250냥')
  await checkScroll(page, '돌탑 점프맵 준비 안내')
  await shot(page, 'jumpmap-start-rewards')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '첫 발판 (테스트)', exact: true }).click()
  await page.getByRole('button', { name: '마지막 발판 (테스트)', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '점프맵 완료', exact: true })
  await expect(dialog).not.toContainText('일곱 구간 보상 합계')
  await expect(dialog).not.toContainText('붕어빵과 합산')
  await expect(dialog).not.toContainText('한국 시간')
  await dialog.getByText('구간 보상 자세히', { exact: true }).click()
  await expect(dialog.locator('details')).toContainText('85냥')
  await expect(dialog).not.toContainText('운동 보상')
  await shot(page, 'jumpmap-result-details')
  for (const viewport of [{ width: 390, height: 844 }, { width: 800, height: 450 }]) {
    await page.setViewportSize(viewport)
    await checkScroll(page, '점프맵 완료')
    await shot(page, `jumpmap-result-${viewport.width}`)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.keyboard.press('Escape')
  await page.evaluate(async () => (await import('/src/features/jumpmap/state.ts' as string)).useJumpmap.setState({ todayEarned: 400 }))
  await page.getByRole('button', { name: '첫 발판 (테스트)', exact: true }).click()
  await page.getByRole('button', { name: '마지막 발판 (테스트)', exact: true }).click()
  await expect(dialog).toContainText('완주 보상 250냥 중 남은 일일 한도만큼 100냥을 받았어요.')
  await expect(dialog).toContainText('기록 도전은 계속할 수 있어요.')
  await shot(page, 'jumpmap-result-capped')
  expect(errors).toEqual([])
})
