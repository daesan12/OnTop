import { expect, test } from '@playwright/test'
import { fixture } from './contractFixture'
import path from 'node:path'
test('썸네일·등급·이름을 조회하고 기존 남녀 편집에 불러오며 없는 이미지도 안전하게 표시한다', async ({ page }, info) => {
  await fixture(page)
  const items = [1, 2, 3, 4].map(grade => ({ id: 'item-' + grade, publishedUploadId: 'upload-' + grade,
    definition: { productCode: 'ITEM_' + grade, name: '구성 의상 ' + grade, grade, compatibility: grade === 2 ? 'ANY' : 'MALE', wearMode: 'WHOLE', slots: ['HAIR','FACE','TOP','BOTTOM','SHOES'] },
    state: 'PUBLISHED', version: 1, updatedAt: '' }))
  const sets = items.map((item, n) => ({ id: 'set-' + (n + 1), definition: { productCode: 'SET_' + (n + 1), name: ['장원 선비','봄날 도포','산책 의상','기본 나들이'][n], grade: n + 1,
    compatibility: n === 1 ? 'ANY' : 'MALE', imageSkinId: item.id, itemIds: [item.id] }, state: 'PUBLISHED', version: 1, publishedAt: '2026-11-11T00:00:00Z' }))
  await page.route('**/api/v1/admin/me', r => r.fulfill({ json: { canRead: true, canOperate: true, canGrant: false } }))
  await page.route('**/api/v1/admin/operations/skins**', r => {
    const p = new URL(r.request().url()).pathname
    return r.fulfill({ json: p.endsWith('/components') ? items : p.endsWith('/sets') ? sets : p.endsWith('/settings') ? { storageReady: true } : items })
  })
  await page.route('**/api/v1/skins/assets', r => r.fulfill({ json: items.map((item, n) => ({ ...item.definition,
    imageKey: 'catalog/' + item.publishedUploadId, modelUrl: 'https://cdn.example.test/model.glb', femaleModelUrl: 'https://cdn.example.test/female.glb', imageUrl: 'https://cdn.example.test/skin-' + n + '.webp' })) }))
  await page.route('https://cdn.example.test/model.glb', r => r.fulfill({ path: path.resolve('public/art/characters/skins/ssafy-black-male-v3.glb'), contentType: 'model/gltf-binary' }))
  await page.route('https://cdn.example.test/female.glb', r => r.fulfill({ path: path.resolve('public/art/characters/girl.glb'), contentType: 'model/gltf-binary' }))
  await page.route('https://cdn.example.test/skin-*.webp', r => r.request().url().includes('skin-3') ? r.fulfill({ status: 404 })
    : r.fulfill({ path: path.resolve('src/features/wardrobe/parts/' + (r.request().url().includes('skin-1') ? 'outfit-general-g-face' : r.request().url().includes('skin-2') ? 'outfit-street-r-hair' : 'outfit-satto-k-top') + '.webp'), contentType: 'image/webp' }))
  const access = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/admin/me' && response.ok())
  await page.goto('/admin/skins')
  await access
  const library = page.getByRole('region', { name: '등록된 스킨 세트 목록' })
  const filter = library.getByRole('group', { name: '스킨 등급 필터' })
  await expect(library.locator('.skin-set-cards>li')).toHaveCount(4)
  await expect(library.getByAltText('장원 선비 썸네일')).toBeVisible()
  await expect(library.getByText('이미지 확인 필요', { exact: true })).toBeVisible()
  for (const tier of ['S', 'A', 'B', 'C']) {
    await filter.getByRole('button', { name: tier + '급', exact: true }).click()
    await expect(library.locator('.skin-set-cards>li')).toHaveCount(1)
    await expect(filter.getByRole('button', { name: tier + '급', exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  await filter.getByRole('button', { name: '전체', exact: true }).click()
  await library.getByLabel('세트 찾기').fill('없음')
  await expect(library.getByText('선택한 등급이나 이름에 맞는 세트가 없어요.', { exact: true })).toBeVisible()
  await library.getByLabel('세트 찾기').fill('봄날')
  await expect(library.locator('.skin-set-cards>li')).toHaveCount(1)
  await library.getByRole('button', { name: '봄날 도포 여자에 불러오기', exact: true }).click()
  await expect(page.getByLabel('여자 세트 이름', { exact: true })).toHaveValue('봄날 도포')
  await expect(page.getByLabel('남자 세트 이름', { exact: true })).toHaveValue('')
  await expect(page.getByRole('region', { name: '여자 세트 저장' }).getByRole('checkbox')).toBeEnabled({ timeout: 60000 })
  await expect(page.getByRole('figure', { name: '여자 캐릭터 미리보기' }).getByRole('alert')).toHaveCount(0)
  await library.getByLabel('세트 찾기').fill('')
  await expect(library.locator('.skin-grade').first()).toHaveCSS('white-space', 'nowrap')
  await page.screenshot({ path: info.outputPath('skin-gallery.png'), fullPage: true })
  await library.getByRole('button', { name: '장원 선비 남자에 불러오기', exact: true }).click()
  await page.getByLabel('여자 기존 세트', { exact: true }).selectOption('')
  await page.getByLabel('여자 세트 이름', { exact: true }).fill('저장 전 이름')
  page.once('dialog', dialog => dialog.dismiss())
  await library.getByRole('button', { name: '봄날 도포 여자에 불러오기', exact: true }).click()
  await expect(page.getByLabel('여자 세트 이름', { exact: true })).toHaveValue('저장 전 이름')
  page.once('dialog', dialog => dialog.accept())
  await library.getByRole('button', { name: '봄날 도포 여자에 불러오기', exact: true }).click()
  await expect(page.getByLabel('여자 세트 이름', { exact: true })).toHaveValue('봄날 도포')
  await page.getByRole('button', { name: '새 아이템 파일 등록', exact: false }).click()
  const previous = page.getByText('예전에 등록한 의상을 찾고 있나요?', { exact: true })
  await previous.click()
  await page.getByRole('button', { name: '이전 의상 불러오기', exact: true }).click()
  const oldFilter = page.getByRole('group', { name: '이전 스킨 등급 필터' })
  await oldFilter.getByRole('button', { name: 'B급', exact: true }).click()
  await expect(page.locator('.skin-library li')).toHaveCount(1)
  await expect(page.getByAltText('구성 의상 3 썸네일')).toBeVisible()
})
