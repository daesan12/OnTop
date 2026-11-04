import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
const id = 'a78baf0b-0246-4391-adef-a247f90ac50a'
const initial = { id, title: '행사 안내', text: '오늘도 즐거운 온탑 공원!', published: true, displayOrder: 1, startsAt: null, endsAt: null, version: 0, updatedAt: '2026-11-04T03:00:00Z' }

test('운영 관리자는 등록·수정·삭제하고 저장 도중 입력을 변경할 수 없다', async ({ page }) => {
  await fixture(page)
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: { canRead: true, canGrant: false, canOperate: true } }))
  let values: typeof initial[] = [], savedBody: any
  await page.route('**/api/v1/admin/operations/announcements**', async route => {
    const req = route.request(), method = req.method()
    expect(req.headers().authorization).toBe('Bearer fixture-access')
    if (method === 'GET') return route.fulfill({ json: values })
    if (method === 'DELETE') { values = []; return route.fulfill({ status: 204 }) }
    savedBody = req.postDataJSON()
    await new Promise(resolve => setTimeout(resolve, 300))
    values = [{ ...initial, ...savedBody, id: req.url().split('/').pop()!, version: method === 'PUT' ? 1 : 0 }]
    return route.fulfill({ json: values[0] })
  })
  await page.goto('/admin/announcements')
  await expect(page.getByText('등록된 공지가 없어요.')).toBeVisible()
  await page.getByLabel('관리용 제목').fill('행사 안내')
  await page.getByLabel('표시할 내용').fill('오늘도 즐거운 온탑 공원!')
  await page.getByLabel('게시 켜기').check()
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByLabel('표시할 내용')).toBeDisabled()
  await expect(page.locator('.announcement-admin li')).toHaveCount(1)
  await page.getByRole('button', { name: '수정', exact: true }).click()
  await page.getByLabel('표시할 내용').fill('안내를 수정했어요.')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.locator('.announcement-admin li')).toContainText('안내를 수정했어요.')
  expect(savedBody).not.toHaveProperty('id'); expect(savedBody).not.toHaveProperty('updatedAt')
  await screenshot(page, 'announcements-admin')
  await page.getByRole('button', { name: '삭제', exact: true }).click()
  await page.getByRole('button', { name: '삭제 확정' }).click()
  await expect(page.getByText('등록된 공지가 없어요.')).toBeVisible()
})

test('조회 전용 관리자는 공지 편집을 열 수 없다', async ({ page }) => {
  await fixture(page)
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: { canRead: true, canGrant: false, canOperate: false } }))
  await page.goto('/admin/announcements')
  await expect(page.getByLabel('관리용 제목')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0)
})

test('공원 공지는 흐름을 멈추고 전체 본문을 열고 닫을 수 있다', async ({ page }) => {
  await fixture(page)
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: {
    serverTime: new Date().toISOString(), refreshAt: new Date(Date.now() + 10000).toISOString(),
    announcements: [{ id, text: initial.text, endsAt: null, version: 0 }],
  } }))
  await page.goto('/park')
  await expect(page.locator('canvas')).toBeVisible({ timeout: 90000 })
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(page.getByLabel('공지 전체 보기')).toBeVisible({ timeout: 90000 })
  await page.getByLabel('공지 흐름 일시정지').click()
  await expect(page.locator('.announcement-moving')).toHaveAttribute('data-paused', 'true')
  await page.getByLabel('공지 전체 보기').click()
  const dialog = page.locator('.announcement-dialog')
  await expect(dialog).toBeVisible(); await expect(dialog).toContainText(initial.text)
  await screenshot(page, 'announcements-park-dialog')
  await dialog.getByRole('button', { name: '닫기' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByLabel('공지 전체 보기')).toBeFocused()
})
