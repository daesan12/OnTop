import { test, expect } from '@playwright/test'
import { fixture } from './contractFixture'
import path from 'node:path'
const root = '/api/v1/admin/operations/skins'
const head = '11111111-1111-4111-8111-111111111111', clothes = '22222222-2222-4222-8222-222222222222', hat = '33333333-3333-4333-8333-333333333333'
const entries = [[head, '선비 머리', ['HAIR', 'FACE']], [clothes, '도포', ['TOP', 'BOTTOM', 'SHOES']], [hat, '짚모자', ['HAIR']]].map(([id, name, slots]) => ({ id, definition: { productCode: name === '도포' ? 'ROBE' : name === '짚모자' ? 'HAT' : 'HEAD', name, slots, grade: 2, compatibility: 'MALE', wearMode: 'PARTS' }, state: 'PUBLISHED', version: 1, publishedUploadId: id, updatedAt: '' }))
entries.push({ ...entries[0]!, id: '55555555-5555-4555-8555-555555555555', publishedUploadId: '55555555-5555-4555-8555-555555555555', definition: { ...entries[0]!.definition, name: '전체 의상', productCode: 'WHOLE', wearMode: 'WHOLE', slots: ['HAIR', 'FACE', 'TOP', 'BOTTOM', 'SHOES'] } })
test('두 슬롯 점유·제거·초안 저장 후 검수·공개가 이어진다', async ({ page }, info) => {
  await fixture(page)
  await page.route('**/api/v1/admin/me', r => r.fulfill({ json: { canRead: true, canOperate: true, canGrant: false } }))
  await page.route('**/api/v1/skins/assets', r => r.fulfill({ json: entries.map(e => ({ ...e.definition, imageKey: 'catalog/' + e.id, modelUrl: 'https://cdn.example.test/model.glb', imageUrl: 'https://cdn.example.test/image.webp' })) }))
  await page.route('https://cdn.example.test/model.glb', r => r.fulfill({ path: path.resolve('public/art/characters/skins/ssafy-black-male-v3.glb'), contentType: 'model/gltf-binary' }))
  await page.route('https://cdn.example.test/image.webp', r => r.fulfill({ path: path.resolve('src/assets/entry/yeopjeon-icon.webp'), contentType: 'image/webp' }))
  let stored: Record<string, unknown> | null = null
  await page.route('**/api/v1/admin/operations/skins**', r => {
    const p = new URL(r.request().url()).pathname, method = r.request().method()
    if (p.endsWith('/settings')) return r.fulfill({ json: { storageReady: true } })
    if (p.endsWith('/components')) return r.fulfill({ json: entries })
    if (p === root + '/sets' && method === 'GET') return r.fulfill({ json: stored ? [stored] : [] })
    if (p === root + '/sets' && method === 'POST') {
      stored = { id: '44444444-4444-4444-8444-444444444444', definition: r.request().postDataJSON(), state: 'DRAFT', version: 0, publishedAt: null }
      return r.fulfill({ json: stored })
    }
    if (p.endsWith('/publish')) { stored = { ...stored, state: 'PUBLISHED', version: 1, publishedAt: '2026-11-09T00:00:00Z' };return r.fulfill({ json: stored }) }
    return r.fulfill({ json: [] })
  })
  await page.goto('/admin/skins');await page.getByRole('button', { name: '세트 관리', exact: true }).click()
  await page.getByLabel('세트 착용 캐릭터').selectOption('MALE')
  const grid = page.locator('.skin-component-grid')
  await grid.getByRole('button', { name: /선비 머리/ }).click()
  await expect(grid.getByRole('button', { name: /짚모자/ })).toBeDisabled()
  await expect(page.locator('.skin-set-places .occupied')).toHaveCount(2)
  await page.locator('.skin-set-selection').getByRole('button', { name: '빼기' }).click()
  await expect(grid.getByRole('button', { name: /짚모자/ })).toBeEnabled()
  await grid.getByRole('button', { name: /선비 머리/ }).click();await grid.getByRole('button', { name: /도포/ }).click()
  await expect(page.locator('.skin-set-places .occupied')).toHaveCount(3)
  // 슬롯 점유 검사는 API 대역, 실제 모델 검수·공개는 유효한 WHOLE GLB로 별도 확인한다.
  await expect(page.getByRole('alert')).toBeVisible()
  await page.locator('.skin-set-selection').getByRole('button', { name: '빼기' }).first().click()
  await page.locator('.skin-set-selection').getByRole('button', { name: '빼기' }).first().click()
  await grid.getByRole('button', { name: /전체 의상/ }).click()
  await page.getByLabel('세트 코드').fill('WHOLE_SET');await page.getByLabel('세트 이름').fill('전체 의상 세트')
  await page.getByRole('button', { name: '세트 정보 저장' }).click()
  const reviewed = page.getByLabel('구성품·미리보기를 확인했어요.')
  await expect(reviewed).toBeEnabled({ timeout: 60000 });await reviewed.check()
  await page.screenshot({ path: info.outputPath('skin-set-three-places.png'), fullPage: true })
  await page.getByRole('button', { name: '세트 공개', exact: true }).click()
  await expect(page.getByText('세트를 공개했어요.', { exact: false })).toBeVisible()
  await expect(grid.getByRole('button', { name: /선비 머리/ })).toBeDisabled()
})
