import { test, expect } from '@playwright/test'

const at = '2026-11-16T06:00:00Z'
const identity = { rank: 1, userId: '11', nickname: '검수 도전자', completedAt: at, gameMaster: false }
const snapshot = {
  balance: [{ ...identity, coinBalance: 5000, equipmentValue: 1000, totalAssets: 6000 }],
  mole: [{ ...identity, score: 3333, maxCombo: 12 }], speedMole: [{ ...identity, score: 473, misses: 2 }],
  jumpRope: [{ ...identity, score: 1695, misses: 0 }], jumpRopeStartsAt: '2026-11-16T05:00:00Z', jumpRopeEndsAtExclusive: '2026-11-18T15:00:00Z',
  jumpmap: [{ ...identity, finishMs: 60123 }], bungeoppang: [{ ...identity, score: 1800, maxCombo: 15 }],
  skewer: [{ rank: 1, gameId: 'qa-team', chefUserId: '11', chefNickname: '검수 요리사', serverUserId: '12', serverNickname: '검수 서빙', score: 2400, playMode: 'VR', completedAt: at, chefGameMaster: false, serverGameMaster: false }], updatedAt: at,
}

test('board cycles locally; E preserves page, owns arrow keys, pauses the clock and displays both VR badges', async ({ page }, info) => {
  let requests = 0
  await page.route('**/api/v1/rankings/park', async route => { requests++; await route.fulfill({ json: snapshot }) })
  await page.clock.install()
  await page.goto('/tests/fixtures/ranking-pages/index.html')
  await expect(page.getByTestId('ready')).toContainText('집계 준비 완료')
  await expect(page.locator('canvas[data-rendered="true"]')).toBeVisible()
  await expect(page.getByTestId('board-page')).toHaveText('1 / 2')
  await page.screenshot({ path: info.outputPath('board-page-1.png') })
  await page.clock.fastForward(8000)
  await expect(page.getByTestId('board-page')).toHaveText('2 / 2')
  expect(requests).toBe(1)
  await page.screenshot({ path: info.outputPath('board-page-2.png') })
  await page.keyboard.press('e')
  const dialog = page.getByRole('dialog', { name: '온탑 랭킹' })
  await expect(dialog.getByRole('heading', { name: '점프맵', exact: true })).toBeVisible()
  await expect(dialog.locator('.ranking-vr-badge')).toHaveCount(2)
  await expect(dialog).toContainText('1:00.123')
  await page.clock.fastForward(24000)
  await expect(page.getByTestId('board-page')).toHaveText('2 / 2')
  await expect(dialog.getByRole('heading', { name: '점프맵', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('detail-page-2.png') })
  await page.keyboard.press('ArrowLeft')
  await expect(dialog.getByRole('heading', { name: '총자산', exact: true })).toBeVisible()
  await expect(dialog).toContainText('11/16 14:00 ~ 11/18 23:59')
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('heading', { name: '점프맵', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await page.clock.fastForward(8000)
  await expect(page.getByTestId('board-page')).toHaveText('1 / 2')
  expect(requests).toBe(1)
})

test('refresh failure keeps the previous complete snapshot on either page', async ({ page }) => {
  let fail = false
  await page.route('**/api/v1/rankings/park', route => fail ? route.fulfill({ status: 503, body: '{}' }) : route.fulfill({ json: snapshot }))
  await page.goto('/tests/fixtures/ranking-pages/index.html')
  await expect(page.getByTestId('ready')).toContainText('집계 준비 완료')
  await page.getByRole('button', { name: 'E 자세히 보기' }).click()
  fail = true
  await page.getByRole('button', { name: '새로 조회', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('이전 집계')
  await page.getByRole('button', { name: '다음 랭킹 페이지' }).click()
  await expect(page.getByRole('heading', { name: '점프맵', exact: true })).toBeVisible()
  await expect(page.locator('.ranking-vr-badge')).toHaveCount(2)
})
