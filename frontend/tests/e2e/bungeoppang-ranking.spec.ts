import { test, expect, type Page } from '@playwright/test'
import { bungeoppangFixture } from './bungeoppangFixture'
import { screenshot } from './contractFixture'
const first = { rank: 1, userId: '102', nickname: '일찍 구운 달인', score: 1200, maxCombo: 12, made: 18, failed: 3, completedAt: '2026-10-28T08:00:00Z' }
const second = { ...first, userId: '103', nickname: '노릇노릇 장인', made: 12, failed: 0, completedAt: '2026-10-28T09:00:00Z' }
const me = { rank: 3, userId: '101', nickname: '공원 산책자', score: 1200, maxCombo: 8, made: 20, failed: 0, completedAt: '2026-10-28T07:00:00Z' }
const lower = { ...me, rank: 4, userId: '104', nickname: '콤보 도전자', score: 1000, maxCombo: 30, made: 40 }
async function result(page: Page) {
  await page.goto('/park'); await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().status)).toBe('connected')
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click()
  await expect(page.getByRole('button', { name: '시작', exact: true })).toBeEnabled()
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
    const { createGrill } = await import('/src/features/bungeoppang/rulesV4.ts' as string)
    const { BUNGEOPPANG_V4 } = await import('/src/features/bungeoppang/config.ts' as string)
    useBungeoppang.setState({ phase: 'result', gameId: 'rank-fixture', grill: { ...createGrill(Array(400).fill(100), { orderId: '1', orderIndex: 0, items: { bean: 2, custard: 0, pizza: 0, chocolate: 0 } }, BUNGEOPPANG_V4), made: 8, failed: 2, score: 120 },
      result: { score: 120, made: 8, golden: 6, failed: 2, wasted: 0, maxCombo: 4, coinsCalculated: 8, coinsGranted: 8, todayEarned: 8, dailyCap: 500, capReached: false },
      submitting: false, starting: false, confirmExit: false, walletError: null, startError: null, submitError: null })
  })
  await expect(page.getByRole('dialog', { name: '붕어빵 결과', exact: true })).toBeVisible()
}
test('ranking prioritizes score, combo and completion time across shared ranks and pages', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await bungeoppangFixture(page)
  let reads = 0
  await page.route('**/api/v1/minigames/bungeoppang/rankings?**', route => {
    reads++; const params = new URL(route.request().url()).searchParams
    expect(params.get('period')).toBe('ALL_TIME'); expect(params.get('rulesVersion')).toBe('v4')
    return route.fulfill({ status: 200, contentType: 'application/json', json: { rulesVersion: 'v4', period: 'ALL_TIME', basis: 'PERSONAL_BEST', snapshotId: 's1', updatedAt: '2026-10-28T10:00:00Z', totalParticipants: 4,
      items: params.has('cursor') ? [me, lower] : [first, second], me, nextCursor: params.has('cursor') ? null : 'page2' } })
  })
  await result(page)
  const summary = page.getByRole('region', { name: '전체 랭킹 요약', exact: true })
  await expect(summary).toContainText('3위'); await expect(summary).toContainText('최고 1,200점 · 최대 8콤보')
  await screenshot(page, 'bungeoppang-ranking-result', 'disabled')
  await summary.getByRole('button', { name: '랭킹 보기', exact: true }).click()
  const ranking = page.getByRole('dialog', { name: '붕어빵 전체 랭킹', exact: true })
  await expect(ranking.getByRole('heading', { name: '붕어빵 전체 랭킹' })).toBeVisible()
  const rows = ranking.locator('tbody tr'); await expect(rows).toHaveCount(2)
  await expect(ranking.getByRole('columnheader', { name: '점수', exact: true })).toBeVisible()
  await expect(ranking.getByRole('columnheader', { name: '최대 콤보', exact: true })).toBeVisible()
  await expect(ranking).toContainText('두 값이 같으면 공동 순위')
  await expect(ranking.getByRole('columnheader', { name: '완성', exact: true })).toHaveCount(0)
  await expect(rows.nth(0)).toContainText('1,200점'); await expect(rows.nth(1)).toContainText('1,200점')
  await expect(rows.nth(0)).toContainText('12콤보'); await expect(rows.nth(1)).toContainText('12콤보')
  await expect(rows.nth(0)).toContainText('일찍 구운 달인'); await expect(rows.nth(1)).toContainText('노릇노릇 장인')
  await expect(rows.nth(0).locator('td').first()).toContainText('1위'); await expect(rows.nth(1).locator('td').first()).toContainText('1위')
  await ranking.getByRole('button', { name: '다음 순위 더 보기', exact: true }).click(); await expect(rows).toHaveCount(4)
  await expect(rows.nth(2)).toHaveAttribute('data-own', 'true'); await expect(rows.nth(2)).toContainText('3위')
  await expect(rows.nth(2)).toContainText('1,200점'); await expect(rows.nth(2)).toContainText('8콤보')
  await expect(rows.nth(3)).toContainText('4위'); await expect(rows.nth(3)).toContainText('1,000점'); await expect(rows.nth(3)).toContainText('30콤보')
  await screenshot(page, 'bungeoppang-ranking-detail', 'disabled')
  await page.setViewportSize({ width: 390, height: 844 }); await screenshot(page, 'bungeoppang-ranking-mobile', 'disabled')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: '붕어빵 결과', exact: true })).toBeVisible()
  expect(reads).toBe(2); expect(errors).toEqual([])
})

for (const missing of ['score', 'maxCombo'] as const) test(`a response missing ${missing} shows preparation without a false rank`, async ({ page }) => {
  await bungeoppangFixture(page)
  const old = { ...first } as Partial<typeof first>; delete old[missing]
  await page.route('**/api/v1/minigames/bungeoppang/rankings?**', route => route.fulfill({ json: {
    rulesVersion: 'v4', period: 'ALL_TIME', basis: 'PERSONAL_BEST', snapshotId: 'old-count-ranking',
    updatedAt: '2026-10-28T10:00:00Z', totalParticipants: 1, items: [old], me: null, nextCursor: null,
  } }))
  await result(page)
  const summary = page.getByRole('region', { name: '전체 랭킹 요약', exact: true })
  await expect(summary).not.toContainText('1위')
  await summary.getByRole('button', { name: '랭킹 보기', exact: true }).click()
  const ranking = page.getByRole('dialog', { name: '붕어빵 전체 랭킹', exact: true })
  await expect(ranking.getByRole('alert')).toContainText('점수·콤보 기준 랭킹을 준비하고 있어요')
  await expect(ranking.locator('tbody tr')).toHaveCount(0)
})
test('a ranking failure never invents a position and offers a working read-only retry', async ({ page }) => {
  await bungeoppangFixture(page); let fail = true
  await page.route('**/api/v1/minigames/bungeoppang/rankings?**', route => route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json',
    json: fail ? { message: '잠시 후 확인해주세요', code: 'TEMPORARY_ERROR' } : { rulesVersion: 'v4', period: 'ALL_TIME', basis: 'PERSONAL_BEST', snapshotId: 'empty', updatedAt: '2026-10-28T10:00:00Z', totalParticipants: 0, items: [], me: null, nextCursor: null } }))
  await result(page); await page.getByRole('button', { name: '랭킹 보기', exact: true }).click()
  const ranking = page.getByRole('dialog', { name: '붕어빵 전체 랭킹', exact: true })
  await expect(ranking.getByRole('alert')).toContainText('전체 랭킹을 불러오지 못했어요')
  await expect(ranking.locator('tbody tr')).toHaveCount(0)
  fail = false; await ranking.getByRole('button', { name: '랭킹 다시 확인', exact: true }).click()
  await expect(ranking).toContainText('아직 등록된 기록이 없어요')
  await ranking.getByRole('button', { name: '결과로 돌아가기', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '붕어빵 결과', exact: true })).toContainText('받은 엽전 8냥')
})
