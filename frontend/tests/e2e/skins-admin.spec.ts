import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fixture } from './contractFixture'
const root = '/api/v1/admin/operations/skins', id = '11111111-1111-4111-8111-111111111111', uploadId = '22222222-2222-4222-8222-222222222222'
const initial = { productCode: 'SPRING_SET', name: '봄꽃 한복', grade: 2, compatibility: 'MALE', wearMode: 'WHOLE', slots: ['HAIR', 'FACE', 'TOP', 'BOTTOM', 'SHOES'] }
const modelPath = path.resolve('public/art/characters/skins/ssafy-black-male-v3.glb')
const imagePath = path.resolve('src/assets/entry/yeopjeon-icon.webp')
const cdn = 'https://cdn.example.test/published/'

async function setup(page: Page, ready: boolean) {
  await fixture(page)
  await page.route('**/api/v1/admin/me', r => r.fulfill({ json: { canRead: true, canOperate: true, canGrant: false } }))
  let entry: Record<string, unknown> | null = null, posts = 0, published = 0, conflict = false, puts = 0
  await page.route('**/api/v1/admin/operations/skins**', async route => {
    const request = route.request(), p = new URL(request.url()).pathname
    expect(request.headers().authorization).toBe('Bearer fixture-access')
    if (p.endsWith('/settings')) return route.fulfill({ json: { storageReady: ready, maxModelBytes: 20971520, maxImageBytes: 2097152, urlTtlSeconds: 300 } })
    if (p === root && request.method() === 'GET') return route.fulfill({ json: entry ? [entry] : [] })
    if (p === root && request.method() === 'POST') {
      posts++; entry = { id, definition: request.postDataJSON(), state: 'DRAFT', version: 0, publishedUploadId: null, updatedAt: '2026-11-07T12:00:00Z' }
      return route.fulfill({ json: entry })
    }
    if (request.method() === 'PUT') {
      if (conflict) return route.fulfill({ status: 409, json: { code: 'SKIN_VERSION_CHANGED', message: '다른 창에서 변경됐어요. 목록을 다시 불러온 뒤 확인해주세요.' } })
      entry = { ...entry, definition: request.postDataJSON().definition, version: Number(entry!.version) + 1 }; return route.fulfill({ json: entry })
    }
    if (p.endsWith('/uploads')) {
      expect(request.postDataJSON().model.sha256).toMatch(/^[0-9a-f]{64}$/)
      return route.fulfill({ json: { uploadId, expiresAt: '2030-01-01T00:00:00Z', model: { url: 'https://upload.example.test/model', headers: { 'Content-Type': 'model/gltf-binary' } }, image: { url: 'https://upload.example.test/image', headers: { 'Content-Type': 'image/webp' } } } })
    }
    if (p.endsWith('/verify')) return route.fulfill({ json: { uploadId, modelUrl: cdn + 'model.glb', imageUrl: cdn + 'image.webp' } })
    if (p.endsWith('/publish')) {
      published++; expect(request.postDataJSON()).toEqual({ version: 0, uploadId, reviewed: true })
      entry = { ...entry, state: 'PUBLISHED', version: 1, publishedUploadId: uploadId }; return route.fulfill({ json: entry })
    }
    if (p.endsWith('/disable')) { entry = { ...entry, state: 'DISABLED', version: 2 }; return route.fulfill({ json: entry }) }
    return route.fulfill({ status: 404, json: {} })
  })
  await page.route('https://upload.example.test/**', route => {
    expect(route.request().headers().authorization).toBeUndefined(); puts++
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  await page.route(cdn + '**', route => route.fulfill({ path: route.request().url().endsWith('.glb') ? modelPath : imagePath,
    contentType: route.request().url().endsWith('.glb') ? 'model/gltf-binary' : 'image/webp', headers: { 'Access-Control-Allow-Origin': '*' } }))
  return { get posts() { return posts }, get published() { return published }, get puts() { return puts }, conflict() { conflict = true } }
}
async function save(page: Page) {
  await page.getByLabel('상품 코드', { exact: true }).fill(initial.productCode)
  await page.getByLabel('스킨 이름', { exact: true }).fill(initial.name)
  await page.getByLabel('등급', { exact: true }).selectOption('2')
  await page.getByRole('button', { name: '상품 정보 저장' }).click()
  await expect(page.getByText('상품 정보를 임시저장했어요.', { exact: false })).toBeVisible()
}
test('AWS 없이 임시저장·재조회는 가능하고 업로드 성공을 가장하지 않는다', async ({ page }, info) => {
  const state = await setup(page, false); await page.goto('/admin/skins'); await expect(page.getByText('파일 저장소 연결 준비 중')).toBeVisible()
  await save(page); expect(state.posts).toBe(1)
  await expect(page.getByLabel('GLB 모델', { exact: true })).toBeDisabled()
  await page.reload(); await page.getByRole('button', { name: /봄꽃 한복/ }).click()
  await expect(page.getByLabel('스킨 이름', { exact: true })).toHaveValue(initial.name)
  await page.screenshot({ path: info.outputPath('skin-draft-no-aws.png'), fullPage: true })
  expect(state.published).toBe(0)
})
test('실제 제품 화면에서 파일·리그 미리보기 후 한 번만 공개하고 비활성화한다', async ({ page }, info) => {
  const state = await setup(page, true); await page.goto('/admin/skins'); await save(page)
  await page.getByLabel('GLB 모델', { exact: true }).setInputFiles(modelPath)
  await page.getByLabel('WebP 대표 이미지', { exact: true }).setInputFiles(imagePath)
  await page.getByRole('button', { name: '파일 업로드·검증' }).click()
  await expect(page.getByRole('heading', { name: '공개 전 검수' })).toBeVisible()
  const publish = page.getByRole('button', { name: '검수한 스킨 공개' })
  await expect(publish).toBeDisabled()
  await page.getByLabel('미리보기·캐릭터 크기·착용 규격을 검수했어요.').check()
  await expect(publish).toBeEnabled({ timeout: 60000 })
  await page.screenshot({ path: info.outputPath('skin-verified-renderer.png'), fullPage: true })
  await publish.click(); await expect(page.getByText('스킨을 공개했어요.', { exact: false })).toBeVisible()
  expect(state.puts).toBe(2); expect(state.published).toBe(1)
  await page.getByRole('button', { name: '신규 획득 중단', exact: true }).click()
  await expect(page.getByText('신규 획득을 중단했어요.', { exact: false })).toBeVisible()
})
test('다중 창 버전 충돌은 입력을 보존하고 자동으로 다시 저장하지 않는다', async ({ page }) => {
  const state = await setup(page, false); await page.goto('/admin/skins'); await save(page)
  await page.getByLabel('스킨 이름', { exact: true }).fill('바꾸던 이름'); state.conflict()
  await page.getByRole('button', { name: '상품 정보 저장' }).click()
  await expect(page.getByText('다른 창에서 변경됐어요.', { exact: false })).toBeVisible()
  await expect(page.getByLabel('스킨 이름', { exact: true })).toHaveValue('바꾸던 이름')
  expect(state.posts).toBe(1)
})
test('등록 리그 생성 실패는 실제 기본 캐릭터로 격리한다', async ({ page }) => {
  await setup(page, false); await page.goto('/admin/skins')
  const result = await page.evaluate(async () => {
    const { ParkAssetLoader } = await import('/src/world/art/assetLoader.ts' as string)
    const { characterUrls } = await import('/src/world/art/CharacterRig.ts' as string)
    const { createSafeCharacterRig } = await import('/src/world/art/safeCharacterRig.ts' as string)
    const { defaultLook } = await import('/src/world/art/characterLook.ts' as string)
    const base = await new ParkAssetLoader().loadAsync(characterUrls[0])
    const broken = { ...base, scene: base.scene.clone(false) }
    const rig = createSafeCharacterRig(base, defaultLook('man'), new Map(), broken)
    const result = { bones: Object.keys(rig.bones).length, visible: rig.root.children.length > 0 }
    rig.dispose(); return result
  })
  expect(result).toEqual({ bones: 49, visible: true })
})
test('조회 전용 관리자는 등록 화면을 사용할 수 없다', async ({ page }) => {
  await fixture(page)
  await page.route('**/api/v1/admin/me', r => r.fulfill({ json: { canRead: true, canOperate: false, canGrant: false } }))
  let calls = 0
  await page.route('**/api/v1/admin/operations/skins**', r => { calls++; return r.fulfill({ json: [] }) })
  await page.goto('/admin/skins')
  await expect(page.getByText('스킨 등록 운영 권한이 필요합니다.')).toBeVisible()
  expect(calls).toBe(0)
})
test('공용 PARTS의 실제 표시 조각이 없으면 미리보기 단계에서도 공개를 막는다', async ({ page }) => {
  const state = await setup(page, true); await page.goto('/admin/skins'); await save(page)
  await page.getByLabel('착용 방식', { exact: true }).selectOption('PARTS')
  await page.getByLabel('착용 캐릭터', { exact: true }).selectOption('ANY')
  await page.getByRole('button', { name: '상품 정보 저장' }).click()
  await expect(page.getByText('상품 정보를 임시저장했어요.', { exact: false })).toBeVisible()
  await page.getByLabel('GLB 모델', { exact: true }).setInputFiles(modelPath)
  await page.getByLabel('WebP 대표 이미지', { exact: true }).setInputFiles(imagePath)
  await page.getByRole('button', { name: '파일 업로드·검증' }).click()
  await expect(page.getByText('모델을 표시하지 못했어요.', { exact: false })).toBeVisible({ timeout: 60000 })
  await page.getByLabel('미리보기·캐릭터 크기·착용 규격을 검수했어요.').check()
  await expect(page.getByRole('button', { name: '검수한 스킨 공개' })).toBeDisabled()
  expect(state.published).toBe(0)
})
