import { expect, test } from '@playwright/test'
import { fixture } from './contractFixture'

const startedAt = '2026-11-13T01:00:00Z'
const round = { roundId: '456', userId: '101', startedAt, status: 'SETTLED', observedTaps: 3, honeypotTaps: 1,
  completionHoneypotTaps: 0 }
const recent = { ...round, roundId: '455', honeypotTaps: 0 }
const distribution = { count: 12, median: 181, p10: 175, p90: 188 }

test('조회 권한이 없으면 게임 매크로 분석 메뉴와 홈 버튼을 숨긴다', async ({ page }) => {
  await fixture(page)
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: false, canGrant: false, canOperate: false,
  } }))

  await page.goto('/admin')

  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible()
  await expect(page.getByRole('button', { name: /게임 매크로 분석/ })).toHaveCount(0)
})

test('관리자가 게임 매크로 분석에서 판을 검색하고 타임라인과 입력 간격을 비교한다', async ({ page }, testInfo) => {
  await fixture(page)
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: false,
  } }))
  await page.route('**/api/v1/admin/macro-analysis/mole?*', route => {
    const query = new URL(route.request().url()).searchParams
    expect(Object.fromEntries(query)).toEqual({
      game: 'whack-a-mole', userId: '101', roundId: '456', date: '2026-11-13',
    })
    return route.fulfill({ json: [round] })
  })
  await page.route('**/api/v1/admin/macro-analysis/mole/456?*', route => {
    expect(new URL(route.request().url()).searchParams.get('input')).toBe('KEYBOARD')
    return route.fulfill({ json: {
      selected: round, recent: [round, recent],
      member: { rounds: 2, honeypotTaps: 1, completionHoneypotTaps: 0, first: distribution,
        rapid: { count: 7, median: 91, p10: 88, p90: 95 } },
      reference: { rounds: 20, honeypotTaps: 0, completionHoneypotTaps: 0,
        first: { count: 168, median: 248, p10: 150, p90: 315 }, rapid: { count: 54, median: 150, p10: 95, p90: 205 } },
      timeline: [
        { sequence: 1, clientAtMs: 1427, hole: 1, input: 'KEYBOARD', outcome: 'HIT',
          spawnId: 3, appearedAtMs: 1240, receivedAt: '2026-11-13T01:00:01.500Z' },
        { sequence: 2, clientAtMs: 3818, hole: 4, input: 'KEYBOARD', outcome: 'HONEYPOT',
          spawnId: null, appearedAtMs: null, receivedAt: '2026-11-13T01:00:03.860Z' },
        { sequence: 3, clientAtMs: 4380, hole: 2, input: 'KEYBOARD', outcome: 'RAPID',
          spawnId: 8, appearedAtMs: 4200, receivedAt: '2026-11-13T01:00:04.700Z' },
      ],
    } })
  })
  await page.goto('/admin')
  await page.getByRole('navigation', { name: '관리자 메뉴' }).getByRole('button', { name: '게임 매크로 분석' }).click()
  await page.getByRole('button', { name: /두더지 플레이 기록/ }).click()
  await page.getByLabel('회원 ID').fill('101')
  await page.getByLabel('판 ID').fill('456')
  await page.getByLabel('날짜').fill('2026-11-13')
  await page.getByRole('button', { name: '조회', exact: true }).click()

  await expect(page.getByRole('heading', { name: '456번 판 타임라인' })).toBeVisible()
  await expect(page.getByRole('button', { name: '455' })).toBeVisible()
  await expect(page.getByText('중앙값 248ms', { exact: false })).toBeVisible()
  await expect(page.locator('tr[data-signal]')).toContainText('더미 ID')
  await page.screenshot({ path: testInfo.outputPath('admin-mole-audit.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 740 })
  await expect(page.getByRole('heading', { name: '같은 게임·입력 방식 비교' })).toBeVisible()
  expect(await page.locator('body').evaluate(body => body.scrollWidth <= window.innerWidth)).toBe(true)
})
