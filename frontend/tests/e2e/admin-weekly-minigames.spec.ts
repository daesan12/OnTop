import { expect, test, type Page } from '@playwright/test'
import { fixture } from './contractFixture'

const week = '2026-11-09'
const game = (gameCode: string, finalized = false) => ({ gameCode,
  displayName: gameCode === 'JUMPMAP' ? '점프맵' : '붕어빵', rankingRuleVersion: 'verified-v1',
  weekStartDate: week, startsAt: '2026-11-09T00:00:00Z', endsAt: '2026-11-15T15:00:00Z',
  announcesAt: '2026-11-16T00:00:00Z', prizeName: '기프티콘', enabled: true,
  finalizedAt: finalized ? '2026-11-16T00:10:00Z' : null })
const rank = (recordId: string) => ({ place: 1, userId: 31, nickname: '우승자',
  sourceRecordId: recordId, sourceValue: 616, secondaryValue: 3,
  achievedAt: '2026-11-12T00:00:00Z' })
const ranking = (gameCode: string, status: 'PROVISIONAL' | 'READY' | 'FINALIZED',
  recordId = '42') => ({ game: game(gameCode, status === 'FINALIZED'), status,
  candidateCount: 3, excludedGmCount: 1,
  ranks: status === 'FINALIZED' ? [] : [rank(recordId)],
  winner: status === 'FINALIZED' ? { userId: 31, nickname: '우승자', sourceRecordId: recordId,
    sourceValue: 616, sourceAchievedAt: '2026-11-12T00:00:00Z', prizeName: '기프티콘' } : null })

async function open(page: Page, canOperate = true) {
  await fixture(page)
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate, canViewContacts: false,
  } }))
  await page.route('**/api/v1/admin/events/winners?*', route => route.fulfill({ json: {
    winners: [], limit: 20, offset: 0, hasMore: false,
  } }))
  await page.goto('/admin/events')
  await page.getByLabel('회차 시작일').fill(week)
  await page.getByRole('button', { name: '미니게임 1위' }).click()
}

test('registered games share one menu and confirm independently from verified ranking', async ({ page }) => {
  let bungeoFinalized = false, confirms = 0
  await page.clock.install({ time: new Date('2026-11-16T01:00:00Z') })
  await fixture(page)
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: true, canViewContacts: false,
  } }))
  await page.route('**/api/v1/admin/events/winners?*', route => route.fulfill({ json: {
    winners: [], limit: 20, offset: 0, hasMore: false,
  } }))
  await page.route(`**/api/v1/admin/events/minigames/rounds/${week}/games**`, route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/games')) return route.fulfill({ json: [game('BUNGEOPPANG'), game('JUMPMAP')] })
    if (path.endsWith('/ranking')) return route.fulfill({ json: ranking(
      path.includes('JUMPMAP') ? 'JUMPMAP' : 'BUNGEOPPANG',
      path.includes('JUMPMAP') ? 'PROVISIONAL' : bungeoFinalized ? 'FINALIZED' : 'READY') })
    if (path.endsWith('/finalize')) {
      expect(route.request().postDataJSON()).toEqual({ candidateCount: 3,
        excludedGmCount: 1, expectedSourceRecordId: '42' })
      confirms++; bungeoFinalized = true
      return route.fulfill({ json: ranking('BUNGEOPPANG', 'FINALIZED') })
    }
    return route.abort()
  })
  await page.goto('/admin/events')
  await page.getByLabel('회차 시작일').fill(week)
  await page.getByRole('button', { name: '미니게임 1위' }).click()
  await expect(page.getByRole('button', { name: '붕어빵 1위' })).toHaveCount(0)
  await page.getByLabel('미니게임 선택').selectOption('JUMPMAP')
  await expect(page.getByText('잠정 순위입니다.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: '1위 확정 준비' })).toHaveCount(0)
  await page.getByLabel('미니게임 선택').selectOption('BUNGEOPPANG')
  await expect(page.getByText('기록 42', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '1위 확정 준비' }).click()
  expect(confirms).toBe(0)
  await page.getByRole('button', { name: '이 순위 최종 확정' }).click()
  await expect(page.getByRole('heading', { name: '확정 결과' })).toBeVisible()
  expect(confirms).toBe(1)
  await page.getByLabel('미니게임 선택').selectOption('JUMPMAP')
  await expect(page.getByText('잠정 순위입니다.', { exact: false })).toBeVisible()
})

test('stale rank prevents POST and a lost confirmation reloads the saved result', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-16T01:00:00Z') })
  let recordId = '42', finalized = false, confirms = 0
  await fixture(page)
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: true, canViewContacts: false,
  } }))
  await page.route('**/api/v1/admin/events/winners?*', route => route.fulfill({ json: {
    winners: [], limit: 20, offset: 0, hasMore: false,
  } }))
  await page.route(`**/api/v1/admin/events/minigames/rounds/${week}/games**`, route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/games')) return route.fulfill({ json: [game('BUNGEOPPANG')] })
    if (path.endsWith('/ranking')) return route.fulfill({ json: ranking('BUNGEOPPANG',
      finalized ? 'FINALIZED' : 'READY', recordId) })
    if (path.endsWith('/finalize')) {
      confirms++; finalized = true
      return route.abort('failed')
    }
    return route.abort()
  })
  await page.goto('/admin/events')
  await page.getByLabel('회차 시작일').fill(week)
  await page.getByRole('button', { name: '미니게임 1위' }).click()
  await page.getByLabel('미니게임 선택').selectOption('BUNGEOPPANG')
  await expect(page.getByText('기록 42', { exact: false })).toBeVisible()
  recordId = '43'
  await page.getByRole('button', { name: '1위 확정 준비' }).click()
  await page.getByRole('button', { name: '이 순위 최종 확정' }).click()
  await expect(page.getByText('순위가 변경됐습니다.', { exact: false })).toBeVisible()
  await expect(page.getByText('기록 43', { exact: false })).toBeVisible()
  expect(confirms).toBe(0)
  await page.getByRole('button', { name: '1위 확정 준비' }).click()
  await page.getByRole('button', { name: '이 순위 최종 확정' }).click()
  await expect(page.getByRole('heading', { name: '확정 결과' })).toBeVisible()
  expect(confirms).toBe(1)
})

test('unregistered games and read-only permission are explained without mutation', async ({ page }) => {
  await open(page, false)
  let games: ReturnType<typeof game>[] = [], mutations = 0
  await page.route(`**/api/v1/admin/events/minigames/rounds/${week}/games**`, route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() === 'POST') mutations++
    return route.fulfill({ json: path.endsWith('/games') ? games : ranking('BUNGEOPPANG', 'READY') })
  })
  await page.getByRole('button', { name: '게임 목록 새로고침' }).click()
  await expect(page.getByText('등록되어 활성화된 미니게임이 없습니다.', { exact: false })).toBeVisible()
  games = [game('BUNGEOPPANG')]
  await page.getByRole('button', { name: '게임 목록 새로고침' }).click()
  await page.getByLabel('미니게임 선택').selectOption('BUNGEOPPANG')
  await expect(page.getByText('확정 전 검토 순위')).toBeVisible()
  await expect(page.getByRole('button', { name: '1위 확정 준비' })).toHaveCount(0)
  expect(mutations).toBe(0)
})

test('the old week still shows existing game results in the shared menu', async ({ page }) => {
  await fixture(page)
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: false, canViewContacts: false,
  } }))
  await page.route('**/api/v1/admin/events/winners?*', route => route.fulfill({ json: {
    winners: [], limit: 20, offset: 0, hasMore: false,
  } }))
  await page.route('**/api/v1/admin/events/minigames/jumpmap/rounds/2026-11-02', route =>
    route.fulfill({ json: { weekStartDate: '2026-11-02',
      endsAt: '2026-11-15T15:00:00Z', announcesAt: '2026-11-16T00:00:00Z',
      finalized: true, candidateCount: 2, excludedGmCount: 1,
      winner: { userId: 31, nickname: '점프왕', sourceRecordId: '123',
        sourceValue: 10000, prizeName: '기프티콘' } } }))
  await page.goto('/admin/events')
  await page.getByLabel('회차 시작일').fill('2026-11-02')
  await page.getByRole('button', { name: '미니게임 1위' }).click()
  await page.getByLabel('미니게임 선택').selectOption('jumpmap')
  await expect(page.getByText('점프왕')).toBeVisible()
  await expect(page.getByText('기존 회차')).toBeVisible()
})
