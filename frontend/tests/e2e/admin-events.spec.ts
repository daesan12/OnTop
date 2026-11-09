import { expect, test } from '@playwright/test'
import { fixture } from './contractFixture'

const week = '2026-11-02'
const winner = { winnerId: 41, userId: 101, weekStart: week, eventType: 'RAFFLE', place: 1,
  nickname: '돼지병아리', prizeName: '1등 상품', contactStatus: 'SUBMITTED', maskedPhone: '010-****-5678',
  contactExpiresAt: '2026-11-23T00:00:00Z', deliveryStatus: 'PENDING',
  deliveredByUserId: null, deliveredAt: null }
const pick = { userId: 101, nickname: '돼지병아리', raffleTicketId: 77, ticketNumber: 12,
  place: 1, slotNumber: 1, prizeName: '1등 상품' }
const review = (drawId: number, attemptNumber = 1, rerollReason: string | null = null) => ({
  drawId, weekStartDate: week, announcesAt: '2026-11-09T00:00:00Z',
  attemptNumber, status: 'REVIEW', requestedByUserId: 101, rerollReason,
  drawnAt: '2026-11-09T00:10:00Z', candidateCount: 4, excludedGmCount: 1,
  expectedPrizeCount: 8, awardedPrizeCount: 1, vacantPrizeCount: 7, picks: [pick],
})
const draw = (finalized: boolean) => ({ weekStartDate: week, announcesAt: '2026-11-09T00:00:00Z',
  finalized, alreadyFinalized: false, candidateCount: finalized ? 4 : null,
  excludedGmCount: finalized ? 1 : null,
  expectedPrizeCount: 8, awardedPrizeCount: finalized ? 1 : 0, vacantPrizeCount: finalized ? 7 : 8,
  winners: finalized ? [pick] : [],
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
  await expect(page.getByRole('button', { name: '지급 완료 기록' })).toHaveCount(0)
  expect(mutations).toBe(0); expect(reveals).toBe(0)
})

test('operator confirms one award after delivery and sees partial then complete status', async ({ page }) => {
  await fixture(page)
  let firstDelivered = false, puts = 0
  const second = { ...winner, winnerId: 42, place: 2, prizeName: '2등 상품',
    deliveryStatus: 'DELIVERED', deliveredByUserId: 9, deliveredAt: '2026-11-16T00:00:00Z' }
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: true, canViewContacts: false,
  } }))
  await page.route(`**/api/v1/admin/raffles/rounds/${week}**`, route => route.fulfill({ json: draw(true) }))
  await page.route('**/api/v1/admin/events/winners?*', route => route.fulfill({ json: {
    winners: [firstDelivered ? { ...winner, deliveryStatus: 'DELIVERED',
      deliveredByUserId: 9, deliveredAt: '2026-11-16T01:00:00Z' } : winner, second],
    limit: 20, offset: 0, hasMore: false,
  } }))
  await page.route('**/api/v1/admin/events/winners/41/delivery', route => {
    expect(route.request().method()).toBe('PUT')
    expect(route.request().postDataJSON()).toEqual({ expectedUserId: 101 })
    puts++; firstDelivered = true
    return route.fulfill({ json: { winnerId: 41, userId: 101, deliveryStatus: 'DELIVERED',
      deliveredByUserId: 9, deliveredAt: '2026-11-16T01:00:00Z', alreadyDelivered: false } })
  })
  await page.goto('/admin/events')
  await page.getByLabel('회차 시작일').fill(week)
  await expect(page.getByText('일부 지급 완료')).toBeVisible()
  await expect(page.getByText('돼지병아리 · 당첨 #41')).toBeVisible()
  await page.getByRole('button', { name: '지급 완료 기록' }).click()
  expect(puts).toBe(0)
  await expect(page.getByText('경품을 실제 전달한 뒤에만', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '전달 완료 확인' }).click()
  await expect(page.getByText('모두 지급 완료')).toBeVisible()
  await expect(page.getByRole('button', { name: '지급 완료 기록' })).toHaveCount(0)
  expect(puts).toBe(1)
})

test('lost delivery response checks the saved status before suggesting another attempt', async ({ page }) => {
  await fixture(page)
  let delivered = false, puts = 0
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: true, canViewContacts: false,
  } }))
  await page.route(`**/api/v1/admin/raffles/rounds/${week}**`, route => route.fulfill({ json: draw(true) }))
  await page.route('**/api/v1/admin/events/winners?*', route => route.fulfill({ json: {
    winners: [delivered ? { ...winner, deliveryStatus: 'DELIVERED',
      deliveredByUserId: 9, deliveredAt: '2026-11-16T01:00:00Z' } : winner],
    limit: 20, offset: 0, hasMore: false,
  } }))
  await page.route('**/api/v1/admin/events/winners/41/delivery', route => {
    puts++; delivered = true
    return route.abort('failed')
  })
  await page.goto('/admin/events')
  await page.getByLabel('회차 시작일').fill(week)
  await page.getByRole('button', { name: '지급 완료 기록' }).click()
  await page.getByRole('button', { name: '전달 완료 확인' }).click()
  await expect(page.getByText('서버에 저장된 지급 완료 기록을 확인했습니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: '지급 완료 기록' })).toHaveCount(0)
  expect(puts).toBe(1)
})

test('operator reviews a draw before confirming its saved ID and explicitly reveals contact', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T01:00:00Z') })
  await fixture(page)
  let finalized = false, current: ReturnType<typeof review> | null = null
  let draws = 0, confirmations = 0, reveals = 0
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: true, canViewContacts: true,
  } }))
  await page.route(`**/api/v1/admin/raffles/rounds/${week}**`, route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (path.endsWith('/draws/current')) return current
      ? route.fulfill({ json: current })
      : route.fulfill({ status: 404, json: { code: 'RAFFLE_REVIEW_NOT_FOUND' } })
    if (path.endsWith('/draws') && method === 'POST') {
      draws++; current = review(31)
      return route.fulfill({ json: current })
    }
    if (path.endsWith('/finalize') && method === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ drawId: 31 })
      confirmations++; finalized = true
    }
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
  await expect(page.getByRole('button', { name: '사전 추첨 실행' })).toBeEnabled()
  await page.getByRole('button', { name: '사전 추첨 실행' }).click()
  await expect(page.getByText('1회 · #31')).toBeVisible()
  expect(draws).toBe(1); expect(confirmations).toBe(0)
  await page.getByRole('button', { name: '검토 결과 확정' }).click()
  expect(confirmations).toBe(0)
  await page.getByRole('button', { name: '이 결과 최종 확정' }).click()
  await expect(page.getByText('응모권 #12')).toBeVisible()
  await expect(page.getByRole('button', { name: '재추첨' })).toHaveCount(0)
  await expect(page.getByText('010-****-5678')).toBeVisible()
  expect(confirmations).toBe(1); expect(reveals).toBe(0)
  await page.getByRole('button', { name: '연락처 원문 열람' }).click()
  await expect(page.getByLabel('연락처 원문')).toHaveText('01012345678')
  expect(reveals).toBe(1)
  await page.getByRole('button', { name: '원문 숨기기' }).click()
  await expect(page.getByText('01012345678')).toHaveCount(0)
  await page.getByRole('button', { name: '연락처 원문 열람' }).click()
  await expect(page.getByLabel('연락처 원문')).toHaveText('01012345678')
  await page.clock.fastForward(30_001)
  await expect(page.getByLabel('연락처 원문')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '연락처 원문 열람' })).toBeVisible()
})

test('stale confirmation is blocked and reroll is restored after page reload', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T01:00:00Z') })
  await fixture(page)
  let current = review(31), confirmations = 0, rerolls = 0
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: true, canViewContacts: false,
  } }))
  await page.route('**/api/v1/admin/events/winners?*', route => route.fulfill({ json: {
    winners: [], limit: 20, offset: 0, hasMore: false,
  } }))
  await page.route(`**/api/v1/admin/raffles/rounds/${week}**`, route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/draws/current')) return route.fulfill({ json: current })
    if (path.endsWith('/draws/reroll') && route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ expectedDrawId: 32, reason: '후보 검토' })
      rerolls++; current = review(33, 3, '후보 검토')
      return route.fulfill({ json: current })
    }
    if (path.endsWith('/finalize') && route.request().method() === 'POST') confirmations++
    return route.fulfill({ json: draw(false) })
  })
  await page.goto('/admin/events')
  await page.getByLabel('회차 시작일').fill(week)
  await expect(page.getByText('1회 · #31')).toBeVisible()
  current = review(32, 2, '운영 검토')
  await page.getByRole('button', { name: '검토 결과 확정' }).click()
  await page.getByRole('button', { name: '이 결과 최종 확정' }).click()
  await expect(page.getByText('다른 관리자가 추첨 결과를 변경했습니다.', { exact: false })).toBeVisible()
  await expect(page.getByText('2회 · #32')).toBeVisible()
  expect(confirmations).toBe(0)
  await page.getByRole('button', { name: '재추첨' }).click()
  await page.getByRole('textbox', { name: '재추첨 사유' }).fill('후보 검토')
  await page.getByRole('button', { name: '사유 기록하고 재추첨' }).click()
  await expect(page.getByText('3회 · #33')).toBeVisible()
  expect(rerolls).toBe(1)
  await page.reload()
  await page.getByLabel('회차 시작일').fill(week)
  await expect(page.getByText('3회 · #33')).toBeVisible()
})

test('lost response restores the saved draw instead of drawing twice', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T01:00:00Z') })
  await fixture(page)
  let current: ReturnType<typeof review> | null = null, draws = 0
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: true, canViewContacts: false,
  } }))
  await page.route('**/api/v1/admin/events/winners?*', route => route.fulfill({ json: {
    winners: [], limit: 20, offset: 0, hasMore: false,
  } }))
  await page.route(`**/api/v1/admin/raffles/rounds/${week}**`, route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/draws/current')) return current
      ? route.fulfill({ json: current })
      : route.fulfill({ status: 404, json: { code: 'RAFFLE_REVIEW_NOT_FOUND' } })
    if (path.endsWith('/draws') && route.request().method() === 'POST') {
      draws++; current = review(31)
      return route.abort('failed')
    }
    return route.fulfill({ json: draw(false) })
  })
  await page.goto('/admin/events')
  await page.getByLabel('회차 시작일').fill(week)
  await expect(page.getByRole('button', { name: '사전 추첨 실행' })).toBeEnabled()
  await page.getByRole('button', { name: '사전 추첨 실행' }).dblclick()
  await expect(page.getByText('1회 · #31')).toBeVisible()
  await expect(page.getByRole('button', { name: '사전 추첨 실행' })).toHaveCount(0)
  expect(draws).toBe(1)
})

test('lost confirmation response reloads the finalized result', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T01:00:00Z') })
  await fixture(page)
  let finalized = false, confirmations = 0
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: true, canViewContacts: false,
  } }))
  await page.route('**/api/v1/admin/events/winners?*', route => route.fulfill({ json: {
    winners: [], limit: 20, offset: 0, hasMore: false,
  } }))
  await page.route(`**/api/v1/admin/raffles/rounds/${week}**`, route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/draws/current')) return finalized
      ? route.fulfill({ status: 409, json: { code: 'RAFFLE_ALREADY_FINALIZED' } })
      : route.fulfill({ json: review(31) })
    if (path.endsWith('/finalize') && route.request().method() === 'POST') {
      confirmations++; finalized = true
      return route.abort('failed')
    }
    return route.fulfill({ json: draw(finalized) })
  })
  await page.goto('/admin/events')
  await page.getByLabel('회차 시작일').fill(week)
  await expect(page.getByText('1회 · #31')).toBeVisible()
  await page.getByRole('button', { name: '검토 결과 확정' }).click()
  await page.getByRole('button', { name: '이 결과 최종 확정' }).click()
  await expect(page.getByRole('heading', { name: '확정 결과' })).toBeVisible()
  await expect(page.getByRole('button', { name: '검토 결과 확정' })).toHaveCount(0)
  expect(confirmations).toBe(1)
})

test('read-only admin can inspect a review while API failure blocks drawing', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T01:00:00Z') })
  await fixture(page)
  let unavailable = false, mutations = 0
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: {
    canRead: true, canGrant: false, canOperate: false, canViewContacts: false,
  } }))
  await page.route('**/api/v1/admin/events/winners?*', route => route.fulfill({ json: {
    winners: [], limit: 20, offset: 0, hasMore: false,
  } }))
  await page.route(`**/api/v1/admin/raffles/rounds/${week}**`, route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/draws/current')) return unavailable
      ? route.fulfill({ status: 503, json: { code: 'RAFFLE_UNAVAILABLE', message: '잠시 확인할 수 없습니다.' } })
      : route.fulfill({ json: review(31) })
    if (route.request().method() === 'POST') mutations++
    return route.fulfill({ json: draw(false) })
  })
  await page.goto('/admin/events')
  await page.getByLabel('회차 시작일').fill(week)
  await expect(page.getByText('1회 · #31')).toBeVisible()
  await expect(page.getByRole('button', { name: '검토 결과 확정' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '재추첨' })).toHaveCount(0)
  unavailable = true
  await page.getByRole('button', { name: '추첨 결과 새로고침' }).click()
  await expect(page.getByText('잠시 확인할 수 없습니다.')).toBeVisible()
  expect(mutations).toBe(0)
})
