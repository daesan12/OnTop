import { expect, test } from '@playwright/test'
import { boardColumns, boardRows } from '../../src/game/alkkagi/boardLayout'

test('8종 도감은 조회만 가능하고 실제 초기 알은 교차점에 놓인다', async ({ page }) => {
  const states: any[] = []
  page.on('websocket', ws => ws.on('framereceived', f => { const m = JSON.parse(String(f.payload)); if (m.type === 'STATE') states.push(m.state) }))
  await page.goto('/alkkagi-preview.html?role=red')
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await expect(page.getByRole('button', { name: '연습 카드 받기 (로컬)' })).toBeEnabled()
  await page.getByText('아이템 도감 · 8종', { exact: true }).click()
  await expect(page.locator('.item-catalog article')).toHaveCount(8)
  await expect(page.locator('.item-catalog button')).toHaveCount(0)
  for (const piece of states.at(-1).pieces) {
    expect(boardColumns.some(x => Math.abs(piece.x - x) < 1e-9)).toBe(true)
    expect(boardRows.some(y => Math.abs(piece.y - y) < 1e-9)).toBe(true)
  }
  await page.locator('.item-catalog-grid').screenshot({ path: '.vite-cache/alkkagi-test-results/card-catalog.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.item-catalog article').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('카드 선택·취소·확정과 중복 비활성화를 기존 흐름으로 유지한다', async ({ page }) => {
  await page.goto('/alkkagi-preview.html?role=red')
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await page.getByRole('button', { name: '연습 카드 받기 (로컬)' }).click()
  await expect(page.locator('.hand-cards button')).toHaveCount(2)
  const card = page.getByRole('button', { name: '한 번 더 튕기기', exact: true })
  await expect(card).toBeDisabled()
  await page.getByRole('button', { name: '테스트 시작', exact: true }).click()
  await card.click(); await expect(card).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.hand-cards').screenshot({ path: '.vite-cache/alkkagi-test-results/card-selected.png' })
  await page.getByRole('button', { name: '아이템 취소', exact: true }).click()
  await expect(card).toHaveAttribute('aria-pressed', 'false')
  await card.click(); await page.getByRole('button', { name: '아이템 확정', exact: true }).click()
  await expect(card).toHaveCount(0)
  await expect(page.locator('.hand-cards button')).toHaveCount(1)
  await expect(page.locator('.hand-cards button')).toBeDisabled()
})
