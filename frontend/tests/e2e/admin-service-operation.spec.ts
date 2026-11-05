import { expect, test } from '@playwright/test'
import type { ServiceOperationStatus } from '../../src/features/operation/serviceOperation'
import { fixture, screenshot } from './contractFixture'

const normal: ServiceOperationStatus = { mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
  version: 4, updatedAt: '2026-11-05T01:00:00Z', serverTime: '2026-11-05T01:01:00Z' }
const futureLocal = () => {
  const value = new Date(Date.now() + 60 * 60_000)
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

test('operation administrator drains new activity through an explicit confirmation and verifies the public state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const server = await fixture(page)
  let state = normal, updates = 0, publicReads = 0
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: { canRead: true, canGrant: false, canOperate: true } }))
  await page.route('**/api/v1/admin/operations/status', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: state })
    updates++
    expect(route.request().headers().authorization).toBe('Bearer fixture-access')
    const body = route.request().postDataJSON()
    expect(body).toMatchObject({ mode: 'DRAINING', notice: '진행 중인 게임을 마무리해주세요.', expectedVersion: 4 })
    expect(Date.parse(body.expectedOpenAt)).toBeGreaterThan(Date.parse(normal.serverTime))
    state = { ...normal, mode: 'DRAINING', notice: body.notice, expectedOpenAt: body.expectedOpenAt,
      maintenanceStartedAt: '2026-11-05T01:02:00Z', version: 5,
      updatedAt: '2026-11-05T01:02:00Z', serverTime: '2026-11-05T01:02:00Z' }
    return route.fulfill({ json: state })
  })
  await page.route('**/api/v1/operations/status', route => { publicReads++; return route.fulfill({ json: state }) })

  await page.goto('/admin/operations')
  await expect(page.getByRole('heading', { name: '서비스 운영 제어', exact: true }).first()).toBeVisible()
  await expect(page.getByLabel('현재 운영 상태')).toContainText('정상 운영')
  await page.getByRole('radio', { name: /신규 활동 차단/ }).check()
  await page.getByLabel('이용자 안내').fill('진행 중인 게임을 마무리해주세요.')
  await page.getByLabel('예상 재개 시각').fill(futureLocal())
  await page.getByRole('button', { name: '변경 내용 확인' }).click()
  await expect(page.getByLabel('운영 상태 변경 확인')).toContainText('신규 활동 차단 상태로 변경할까요?')
  expect(updates).toBe(0)
  await page.getByRole('button', { name: '신규 활동 차단으로 변경' }).click()
  await expect(page.getByRole('status')).toContainText('신규 활동 차단 상태로 변경했습니다.')
  await expect(page.getByLabel('현재 운영 상태')).toContainText('상태 버전5')
  expect(updates).toBe(1); expect(publicReads).toBeGreaterThanOrEqual(1); expect(server.connections).toBe(0)
  await screenshot(page, 'admin-service-operation-draining')
})

test('operation page reloads a concurrent change and never exposes controls to a read-only administrator', async ({ page }) => {
  await fixture(page)
  let canOperate = true, gets = 0
  await page.route('**/api/v1/admin/me', route => route.fulfill({ json: { canRead: true, canGrant: false, canOperate } }))
  await page.route('**/api/v1/admin/operations/status', route => {
    if (route.request().method() === 'PUT') return route.fulfill({ status: 409, json: { code: 'OPERATION_VERSION_CONFLICT' } })
    gets++
    return route.fulfill({ json: gets === 1 ? normal : { ...normal, mode: 'MAINTENANCE', notice: '다른 관리자의 점검',
      maintenanceStartedAt: '2026-11-05T01:02:00Z', expectedOpenAt: '2026-11-05T02:00:00Z', version: 5 } })
  })
  await page.goto('/admin/operations')
  await page.getByRole('radio', { name: /점검 중/ }).check()
  await page.getByLabel('이용자 안내').fill('점검을 시작합니다.')
  await page.getByLabel('예상 재개 시각').fill(futureLocal())
  await page.getByRole('button', { name: '변경 내용 확인' }).click()
  await page.getByRole('button', { name: '점검 중으로 변경' }).click()
  await expect(page.getByRole('alert')).toContainText('다른 관리자가 먼저 운영 상태를 변경했습니다')
  await expect(page.getByLabel('현재 운영 상태')).toContainText('다른 관리자의 점검')

  canOperate = false
  await page.reload()
  await expect(page.getByText('운영 관리자 권한이 필요합니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: '변경 내용 확인' })).toHaveCount(0)
})
