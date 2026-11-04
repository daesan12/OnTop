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
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: { mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null, version: 1, updatedAt: new Date().toISOString(), serverTime: new Date().toISOString() } }))
  const noticeRequestTimes: number[] = []
  await page.route('**/api/v1/announcements', route => { noticeRequestTimes.push(Date.now()); return route.fulfill({ json: {
    serverTime: new Date().toISOString(), refreshAt: new Date(Date.now() + 50).toISOString(),
    announcements: [{ id, text: initial.text, endsAt: null, version: 0 }],
  } }) })
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
  // 개발 StrictMode의 최초 effect 재실행은 제외하고 화면 준비 후 정기 폴링을 관찰한다.
  noticeRequestTimes.length = 0
  await expect.poll(() => noticeRequestTimes.length, { timeout: 6000 }).toBeGreaterThanOrEqual(2)
  const intervals = noticeRequestTimes.slice(1).map((time, index) => time - noticeRequestTimes[index])
  expect(intervals, JSON.stringify(intervals)).toEqual(expect.arrayContaining([expect.any(Number)]))
  expect(intervals.every(interval => interval >= 1900), JSON.stringify(intervals)).toBe(true)
  await screenshot(page, 'announcements-park-readonly')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => moving.evaluate(e => getComputedStyle(e).animationName)).toBe('none')
  expect(await moving.evaluate(e => getComputedStyle(e).whiteSpace)).toBe('normal')
})

test('지난 공지 검색과 카드 드래그·버튼 정렬은 저장 후 유지되고 충돌은 부분 반영하지 않는다', async ({ page }) => {
  await fixture(page)
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: { canRead: true, canGrant: false, canOperate: true } }))
  const second = { ...initial, id: 'b78baf0b-0246-4391-adef-a247f90ac50a', title: '숨긴 소식', text: '보관한 안내입니다.', published: false, displayOrder: 2 }
  const third = { ...initial, id: 'c78baf0b-0246-4391-adef-a247f90ac50a', title: '지난 행사', text: '지난달 행사 기록입니다.', displayOrder: 3, endsAt: '2020-01-01T00:00:00Z' }
  let values = [initial, second, third], conflict = false, savedIds: string[] = []
  await page.route('**/api/v1/admin/operations/announcements**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: values })
    expect(route.request().url()).toMatch(/\/order$/)
    if (conflict) return route.fulfill({ status: 409, json: {} })
    const { items } = route.request().postDataJSON()
    expect(items).toHaveLength(3)
    for (const item of items) expect(item.expectedVersion).toBe(values.find(v => v.id === item.id)!.version)
    savedIds = items.map((item: any) => item.id)
    values = items.map((item: any, displayOrder: number) => ({ ...values.find(v => v.id === item.id)!, displayOrder, version: item.expectedVersion + 1 }))
    return route.fulfill({ status: 204 })
  })
  await page.goto('/admin/announcements')
  await expect(page.getByRole('list', { name: '공지 카드 목록' }).locator('li')).toHaveCount(3)
  await expect(page.locator('input[type=number]')).toHaveCount(0)
  await page.getByRole('button', { name: '지난 공지 2', exact: true }).click()
  await expect(page.getByRole('list', { name: '공지 카드 목록' }).locator('li')).toHaveCount(2)
  await page.getByRole('searchbox', { name: '공지 검색' }).fill('지난달')
  await expect(page.getByRole('list', { name: '공지 카드 목록' }).locator('li')).toHaveCount(1)
  await expect(page.getByRole('list', { name: '공지 카드 목록' })).toContainText('지난 행사')
  await screenshot(page, 'announcements-history')
  await page.getByRole('searchbox', { name: '공지 검색' }).fill('')
  await page.getByRole('button', { name: '전체 3', exact: true }).click()
  await page.getByRole('button', { name: '지난 행사 위로 이동', exact: true }).click()
  await expect(page.getByLabel('공지 내용', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '지난 행사 순서 드래그', exact: true }).dragTo(page.getByRole('list', { name: '공지 카드 목록' }).locator('li').first())
  await expect(page.getByRole('list', { name: '공지 카드 목록' }).locator('li').first()).toContainText('지난 행사')
  await page.getByRole('button', { name: '순서 저장', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('표시 순서를 저장했어요.')
  expect(savedIds).toEqual([third.id, initial.id, second.id])
  expect(values.find(v => v.id === third.id)!.endsAt).toBe(third.endsAt)
  await page.reload()
  await expect(page.getByRole('list', { name: '공지 카드 목록' }).locator('li').first()).toContainText('지난 행사')
  await screenshot(page, 'announcements-card-order')
  conflict = true
  await page.getByRole('button', { name: '행사 안내 아래로 이동', exact: true }).click()
  await page.getByRole('button', { name: '순서 저장', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('다른 관리자가 변경했습니다.')
  expect(values.map(v => v.id)).toEqual(savedIds)
  await page.getByRole('button', { name: '새로고침', exact: true }).click()
  await expect(page.getByRole('button', { name: '순서 저장', exact: true })).toHaveCount(0)
  await expect(page.getByRole('list', { name: '공지 카드 목록' }).locator('li').first()).toContainText('지난 행사')
})
