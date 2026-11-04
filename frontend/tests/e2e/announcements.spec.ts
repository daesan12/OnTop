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
  await expect(page.getByText('아직 등록된 공지가 없어요.')).toBeVisible()
  await page.getByLabel('공지 내용', { exact: true }).fill('오늘도 즐거운 온탑 공원!')
  await page.getByRole('button', { name: '공지 올리기', exact: true }).click()
  await expect(page.getByLabel('공지 내용', { exact: true })).toBeDisabled()
  await expect(page.locator('.announcement-admin li')).toHaveCount(1)
  await page.getByRole('button', { name: '수정', exact: true }).click()
  await page.getByLabel('공지 내용', { exact: true }).fill('안내를 수정했어요.')
  await expect(page.getByRole('button', { name: '숨기기', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '수정 저장', exact: true }).click()
  await expect(page.locator('.announcement-admin li')).toContainText('안내를 수정했어요.')
  expect(savedBody).not.toHaveProperty('id'); expect(savedBody).not.toHaveProperty('updatedAt')
  await page.getByRole('button', { name: '숨기기', exact: true }).click()
  await expect(page.locator('.announcement-state')).toHaveText('숨김')
  await page.getByRole('button', { name: '게시하기', exact: true }).click()
  await expect(page.locator('.announcement-state')).toHaveText('게시 중')
  await screenshot(page, 'announcements-admin')
  await page.getByRole('button', { name: '삭제', exact: true }).click()
  await page.getByRole('button', { name: '삭제 확정' }).click()
  await expect(page.getByText('아직 등록된 공지가 없어요.')).toBeVisible()
})

test('조회 전용 관리자는 공지 편집을 열 수 없다', async ({ page }) => {
  await fixture(page)
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: { canRead: true, canGrant: false, canOperate: false } }))
  await page.goto('/admin/announcements')
  await expect(page.getByLabel('공지 내용', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0)
})

test('공지는 맨 위 정중앙의 보기 전용이며 날씨는 분리되고 흐름이 멈추지 않는다', async ({ page }) => {
  await fixture(page)
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: {
    serverTime: new Date().toISOString(), refreshAt: new Date(Date.now() + 10000).toISOString(),
    announcements: [{ id, text: initial.text, endsAt: null, version: 0 }],
  } }))
  await page.goto('/park')
  await expect(page.locator('canvas')).toBeVisible({ timeout: 90000 })
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  const banner = page.getByRole('complementary', { name: '공원 공지' })
  await expect(banner).toBeVisible({ timeout: 90000 })
  await expect(banner.locator('button,a,[tabindex],dialog')).toHaveCount(0)
  expect(await banner.evaluate(e => getComputedStyle(e).pointerEvents)).toBe('none')
  const moving = page.locator('.announcement-moving')
  for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 900, height: 700 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    await expect.poll(async () => {
      const b = await banner.boundingBox(), chip = await page.locator('.park-location-chip').boundingBox()
      return !!b && !!chip && b.y <= 21 && Math.abs(b.x + b.width / 2 - size.width / 2) < 2 && chip.y > b.y + b.height
    }).toBe(true)
    await expect.poll(() => moving.evaluate(e => getComputedStyle(e).animationPlayState)).toBe('running')
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
  await screenshot(page, 'announcements-park-readonly')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => moving.evaluate(e => getComputedStyle(e).animationName)).toBe('none')
  expect(await moving.evaluate(e => getComputedStyle(e).whiteSpace)).toBe('normal')
})
