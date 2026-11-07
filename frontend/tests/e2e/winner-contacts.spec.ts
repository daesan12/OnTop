import { expect, test } from '@playwright/test'
import { fixture } from './contractFixture'

const week = '2026-11-02'
const award = { winnerId: 41, weekStart: week, eventType: 'RAFFLE', place: 1,
  prizeName: '황올 세트', announcedAt: '2026-11-09T00:00:00Z',
  submissionDeadline: '2026-11-16T00:00:00Z', contactStatus: 'NOT_SUBMITTED',
  maskedPhone: null, contactExpiresAt: null }

test('only an announced winner sees the prompt; one number covers multiple awards and remains visible after reload', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-10T00:00:00Z') })
  await fixture(page)
  let submitted = false, writes = 0
  await page.route('**/api/v1/events/winnings/me?*', route => route.fulfill({ json: [
    { ...award, ...(submitted ? { contactStatus: 'SUBMITTED', maskedPhone: '***-****-5678',
      contactExpiresAt: '2026-11-24T00:00:00Z' } : {}) },
    { ...award, winnerId: 42, eventType: 'JUMPMAP', prizeName: '점프맵 상품',
      ...(submitted ? { contactStatus: 'SUBMITTED', maskedPhone: '***-****-5678',
        contactExpiresAt: '2026-11-24T00:00:00Z' } : {}) },
  ] }))
  await page.route(`**/api/v1/events/winnings/weeks/${week}/contact`, route => {
    writes++
    expect(route.request().headers().authorization).toBe('Bearer fixture-access')
    expect(route.request().postDataJSON()).toEqual({ phone: '01012345678' })
    if (writes === 1) return route.fulfill({ status: 503, json: { code: 'TEMPORARY', message: '잠시 후 다시 시도해주세요.' } })
    submitted = true
    return route.fulfill({ json: { weekStart: week, status: 'SUBMITTED', maskedPhone: '***-****-5678',
      expiresAt: '2026-11-24T00:00:00Z', submissionDeadline: award.submissionDeadline } })
  })
  await page.goto('/park')
  const dialog = page.getByRole('dialog', { name: '내 당첨 내역' })
  await expect(dialog).toBeVisible({ timeout: 90000 })
  await expect(dialog.getByText('응모권 추첨 1등')).toBeVisible()
  await expect(dialog.getByText('점프맵 1등')).toBeVisible()
  await expect(dialog.getByLabel('경품 전달용 휴대전화 번호')).toHaveCount(1)
  await dialog.getByLabel('경품 전달용 휴대전화 번호').fill('010-1234-5678')
  await dialog.getByLabel('연락처 수집·보관 안내를 확인했습니다.').check()
  await dialog.getByRole('button', { name: '연락처 제출' }).click()
  await expect(dialog.getByText('잠시 후 다시 시도해주세요.')).toBeVisible()
  await expect(dialog.getByLabel('경품 전달용 휴대전화 번호')).toHaveValue('010-1234-5678')
  await dialog.getByRole('button', { name: '연락처 제출' }).click()
  await expect(dialog.getByText('연락처 제출 완료 · ***-****-5678')).toBeVisible()
  expect(writes).toBe(2)
  await page.reload()
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 90000 })
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: '내 메뉴', exact: true }).click()
  await page.getByRole('menuitem', { name: /내 당첨 내역/ }).click()
  await expect(dialog.getByText('연락처 제출 완료 · ***-****-5678')).toBeVisible()
})

test('a member without announced winnings sees no contact prompt', async ({ page }) => {
  await fixture(page)
  await page.route('**/api/v1/events/winnings/me?*', route => route.fulfill({ json: [] }))
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 90000 })
  await expect(page.getByRole('dialog', { name: '내 당첨 내역' })).toHaveCount(0)
  await page.getByRole('button', { name: '내 메뉴', exact: true }).click()
  await page.getByRole('menuitem', { name: /내 당첨 내역/ }).click()
  await expect(page.getByText('아직 발표된 당첨 내역이 없어요.')).toBeVisible()
})

test('a failed refresh hides stale winnings until a new query succeeds', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-10T00:00:00Z') })
  await fixture(page)
  let fail = false
  await page.route('**/api/v1/events/winnings/me?*', route => fail
    ? route.fulfill({ status: 503, json: { code: 'TEMPORARY', message: '지금은 조회할 수 없습니다.' } })
    : route.fulfill({ json: [award] }))
  await page.goto('/park')
  const dialog = page.getByRole('dialog', { name: '내 당첨 내역' })
  await expect(dialog.getByText('황올 세트')).toBeVisible({ timeout: 90000 })
  await dialog.getByRole('button', { name: '당첨 내역 닫기' }).click()
  fail = true
  await page.getByRole('button', { name: '내 메뉴', exact: true }).click()
  await page.getByRole('menuitem', { name: /내 당첨 내역/ }).click()
  await expect(dialog.getByText('지금은 조회할 수 없습니다.')).toBeVisible()
  await expect(dialog.getByText('황올 세트')).toHaveCount(0)
  fail = false
  await dialog.getByRole('button', { name: '다시 조회' }).click()
  await expect(dialog.getByText('황올 세트')).toBeVisible()
})
