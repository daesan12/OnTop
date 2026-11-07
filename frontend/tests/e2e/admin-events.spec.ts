import { expect, test } from '@playwright/test'
import { fixture } from './contractFixture'

const week = '2026-11-02'
const winner = { winnerId: 41, userId: 101, weekStart: week, eventType: 'RAFFLE', place: 1,
  prizeName: '1등 상품', contactStatus: 'SUBMITTED', maskedPhone: '010-****-5678',
  contactExpiresAt: '2026-11-23T00:00:00Z' }
const draw = (finalized: boolean) => ({ weekStartDate: week, announcesAt: '2026-11-09T00:00:00Z',
  finalized, alreadyFinalized: false, candidateCount: finalized ? 4 : null,
  excludedGmCount: finalized ? 1 : null,
  expectedPrizeCount: 8, awardedPrizeCount: finalized ? 1 : 0, vacantPrizeCount: finalized ? 7 : 8,
  winners: finalized ? [{ userId: 101, ticketNumber: 12, place: 1, prizeName: '1등 상품' }] : [],
})

test('read-only admin sees the draw and masked contact without mutation or raw-phone request', async ({ page }) => {
  await fixture(page)
  let mutations = 0, reveals = 0
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: false, canViewContacts: false,
  } }))
  await page.route(`**/api/v1/admin/raffles/rounds/${week}**`, route => {
    if (route.request().method() === 'POST') mutations++
    return route.fulfill({ json: draw(true) })
  })
  await page.route('**/api/v1/admin/events/winners?*', route => route.fulfill({ json: {
    winners: [winner], limit: 20, offset: 0, hasMore: false,
  } }))
  await page.route('**/api/v1/admin/events/winners/41/contact', route => {
    reveals++; return route.fulfill({ json: { winnerId: 41, phone: '01012345678', expiresAt: '2026-11-23T00:00:00Z' } })
  })
  await page.goto('/admin/events')
  await page.getByLabel('회차 시작일').fill(week)
  await expect(page.getByText('응모권 #12')).toBeVisible()
  await expect(page.getByText('010-****-5678')).toBeVisible()
  await expect(page.getByRole('button', { name: '결과 확정 준비' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '연락처 원문 열람' })).toHaveCount(0)
  expect(mutations).toBe(0); expect(reveals).toBe(0)
})

test('operator confirms once and contact reader explicitly reveals a number', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T01:00:00Z') })
  await fixture(page)
  let finalized = false, mutations = 0, reveals = 0
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: true, canViewContacts: true,
  } }))
  await page.route(`**/api/v1/admin/raffles/rounds/${week}**`, route => {
    if (route.request().method() === 'POST') { finalized = true; mutations++ }
    return route.fulfill({ json: draw(finalized) })
  })
  await page.route('**/api/v1/admin/events/winners?*', route => route.fulfill({ json: {
    winners: finalized ? [winner] : [], limit: 20, offset: 0, hasMore: false,
  } }))
  await page.route('**/api/v1/admin/events/winners/41/contact', route => {
    reveals++; return route.fulfill({ json: { winnerId: 41, phone: '01012345678', expiresAt: '2026-11-23T00:00:00Z' } })
  })
  await page.goto('/admin/events')
  await page.getByLabel('회차 시작일').fill(week)
  await expect(page.getByRole('button', { name: '결과 확정 준비' })).toBeEnabled()
  expect(mutations).toBe(0)
  await page.getByRole('button', { name: '결과 확정 준비' }).click()
  expect(mutations).toBe(0)
  await page.getByRole('button', { name: '확정 실행' }).click()
  await expect(page.getByText('응모권 #12')).toBeVisible()
  await expect(page.getByRole('button', { name: '결과 확정 준비' })).toHaveCount(0)
  await expect(page.getByText('010-****-5678')).toBeVisible()
  expect(mutations).toBe(1); expect(reveals).toBe(0)
  await page.getByRole('button', { name: '연락처 원문 열람' }).click()
  await expect(page.getByLabel('연락처 원문')).toHaveText('01012345678')
  expect(reveals).toBe(1)
  await page.getByRole('button', { name: '원문 숨기기' }).click()
  await expect(page.getByText('01012345678')).toHaveCount(0)
})
