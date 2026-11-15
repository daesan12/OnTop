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

  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /게임 매크로 분석/ })).toHaveCount(0)
})

test('관리자가 게임 매크로 분석에서 판을 검색하고 타임라인과 입력 간격을 비교한다', async ({ page }, testInfo) => {
  await fixture(page)
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: false,
  } }))
  await page.route('**/api/v1/admin/macro-analysis/mole/detections?*', route => route.fulfill({ json: {
    items: [], from: '2026-10-14T01:00:00Z', until: startedAt, limit: 100,
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

test('적발 회원을 자동 조회하고 선택한 판을 수동 검색 없이 연다', async ({ page }, testInfo) => {
  await fixture(page)
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: false,
  } }))
  let speedRequests = 0
  await page.route('**/api/v1/admin/macro-analysis/mole/detections?*', route => {
    const game = new URL(route.request().url()).searchParams.get('game')
    if (game === 'speed-mole' && ++speedRequests === 1) return route.fulfill({ status: 503 })
    return route.fulfill({ json: {
      from: '2026-10-14T01:00:00Z', until: startedAt, limit: 100,
      items: game === 'speed-mole' ? [] : [{
        userId: '101', nickname: '테스트 회원', withdrawn: false, flaggedRounds: 2,
        liveRounds: 2, completionRounds: 1, latestRoundId: '456', lastDetectedAt: startedAt,
      }],
    } })
  })
  let manualSearches = 0
  await page.route('**/api/v1/admin/macro-analysis/mole?*', route => {
    manualSearches++
    return route.fulfill({ json: [] })
  })
  await page.route('**/api/v1/admin/macro-analysis/mole/456?*', route => {
    expect(Object.fromEntries(new URL(route.request().url()).searchParams)).toEqual({
      game: 'whack-a-mole', input: 'TOUCH',
    })
    const comparison = { rounds: 1, honeypotTaps: 1, completionHoneypotTaps: 0, first: distribution, rapid: distribution }
    return route.fulfill({ json: { selected: round, recent: [round], timeline: [], member: comparison, reference: comparison } })
  })

  await page.goto('/admin')
  await page.getByRole('navigation', { name: '관리자 메뉴' }).getByRole('button', { name: '게임 매크로 분석' }).click()
  await page.getByRole('button', { name: /두더지 플레이 기록/ }).click()
  const detections = page.getByRole('region', { name: '적발 회원' })
  await expect(detections.getByRole('rowheader', { name: /테스트 회원.*101/ })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('admin-mole-detections.png') })

  await page.setViewportSize({ width: 390, height: 740 })
  expect(await page.locator('body').evaluate(body => body.scrollWidth <= window.innerWidth)).toBe(true)
  await detections.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('admin-mole-detections-mobile.png') })
  await page.getByLabel('비교 입력 방식').selectOption('TOUCH')
  await detections.getByRole('button', { name: '456번 판 보기' }).click()
  await expect(page.getByRole('heading', { name: '플레이 기록 조회' })).toBeFocused()
  await expect(page.getByRole('heading', { name: '456번 판 타임라인' })).toBeVisible()
  expect(manualSearches).toBe(0)

  await page.getByLabel('게임', { exact: true }).selectOption('speed-mole')
  await expect(detections.getByRole('alert')).toBeVisible()
  await expect(detections.getByText('테스트 회원')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '456번 판 타임라인' })).toHaveCount(0)
  await detections.getByRole('button', { name: '새로고침' }).click()
  await expect(detections.getByText('최근 30일 동안 적발 기록이 없습니다.')).toBeVisible()
  expect(speedRequests).toBe(2)
  expect(pageErrors).toEqual([])
})
