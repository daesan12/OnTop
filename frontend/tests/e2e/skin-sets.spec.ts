import { test, expect } from '@playwright/test'
import { fixture } from './contractFixture'
import path from 'node:path'
const root = '/api/v1/admin/operations/skins'
const head = '11111111-1111-4111-8111-111111111111', clothes = '22222222-2222-4222-8222-222222222222', hat = '33333333-3333-4333-8333-333333333333'
const entries = [[head, '선비 머리', ['HAIR', 'FACE']], [clothes, '도포', ['TOP', 'BOTTOM', 'SHOES']], [hat, '짚모자', ['HAIR']]].map(([id, name, slots]) => ({ id, definition: { productCode: name === '도포' ? 'ROBE' : name === '짚모자' ? 'HAT' : 'HEAD', name, slots, grade: 2, compatibility: 'MALE', wearMode: 'PARTS' }, state: 'PUBLISHED', version: 1, publishedUploadId: id, updatedAt: '' }))
entries.push({ ...entries[0]!, id: '55555555-5555-4555-8555-555555555555', publishedUploadId: '55555555-5555-4555-8555-555555555555', definition: { ...entries[0]!.definition, name: '전체 의상', productCode: 'WHOLE', wearMode: 'WHOLE', slots: ['HAIR', 'FACE', 'TOP', 'BOTTOM', 'SHOES'] } })
entries.push({ ...entries[3]!, id:'66666666-6666-4666-8666-666666666666', publishedUploadId:'66666666-6666-4666-8666-666666666666', definition:{...entries[3]!.definition, compatibility:'ANY', name:'공용 전체 의상', productCode:'COMMON_WHOLE'} })
test('두 슬롯 점유·제거·초안 저장 후 검수·공개가 이어진다', async ({ page }, info) => {
  await fixture(page)
  await page.route('**/api/v1/admin/me', r => r.fulfill({ json: { canRead: true, canOperate: true, canGrant: false } }))
  await page.route('**/api/v1/skins/assets', r => r.fulfill({ json: entries.map(e => ({ ...e.definition, imageKey: 'catalog/' + e.id, modelUrl: 'https://cdn.example.test/model.glb', imageUrl: 'https://cdn.example.test/image.webp' })) }))
  await page.route('https://cdn.example.test/model.glb', r => r.fulfill({ path: path.resolve('public/art/characters/skins/ssafy-black-male-v3.glb'), contentType: 'model/gltf-binary' }))
  await page.route('https://cdn.example.test/image.webp', r => r.fulfill({ path: path.resolve('src/assets/entry/yeopjeon-icon.webp'), contentType: 'image/webp' }))
  const same = (id:string,name:string) => ({id,definition:{productCode:'DRAFT_'+name,name,grade:2,compatibility:'MALE',imageSkinId:entries[3]!.id,itemIds:[entries[3]!.id]},state:'DRAFT',version:0,publishedAt:null})
  const presets = [same('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ONE'),same('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','TWO'),{...same('cccccccc-cccc-4ccc-8ccc-cccccccccccc','COMMON'),definition:{productCode:'COMMON_DRAFT',name:'공용 초안',grade:2,compatibility:'ANY',imageSkinId:'',itemIds:[]}}]
  let stored: Record<string, unknown> | null = null
  await page.route('**/api/v1/admin/operations/skins**', r => {
    const p = new URL(r.request().url()).pathname, method = r.request().method()
    if (p.endsWith('/settings')) return r.fulfill({ json: { storageReady: true } })
    if (p.endsWith('/components')) return r.fulfill({ json: entries })
    if (p === root + '/sets' && method === 'GET') return r.fulfill({ json: stored ? [stored,...presets] : presets })
    if (p === root + '/sets' && method === 'POST') {
      stored = { id: '44444444-4444-4444-8444-444444444444', definition: r.request().postDataJSON(), state: 'DRAFT', version: 0, publishedAt: null }
      return r.fulfill({ json: stored })
    }
    if (p.endsWith('/publish')) { stored = { ...stored, state: 'PUBLISHED', version: 1, publishedAt: '2026-11-09T00:00:00Z' };return r.fulfill({ json: stored }) }
    return r.fulfill({ json: [] })
  })

  await page.goto('/admin/skins')
  await expect(page.getByRole('figure', { name: '남자 캐릭터 미리보기' })).toBeVisible()
  await expect(page.getByRole('figure', { name: '여자 캐릭터 미리보기' })).toBeVisible()
  await page.getByRole('button',{name:'남자 머리 불러오기',exact:true}).click()
  await page.getByRole('dialog').getByRole('button',{name:/선비 머리/}).click()
  await expect(page.getByRole('button',{name:'남자 머리 불러오기',exact:true})).toBeDisabled()
  await expect(page.getByRole('button',{name:'남자 얼굴 불러오기',exact:true})).toBeDisabled()
  await expect(page.getByRole('button',{name:'여자 머리 불러오기',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'남자 머리 아이템 빼기',exact:true}).click()
  await expect(page.getByRole('button',{name:'남자 얼굴 불러오기',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'남자 머리 불러오기',exact:true}).click()
  await page.getByRole('dialog').getByRole('button',{name:/^전체 의상/}).click()
  await expect(page.locator('.skin-body-slots.male .occupied')).toHaveCount(3)
  await expect(page.locator('.skin-body-slots.female .occupied')).toHaveCount(0)
  await page.getByLabel('남자 세트 이름',{exact:true}).fill('전체 의상 세트')
  const male=page.getByRole('region',{name:'남자 세트 저장'})
  await expect(male.getByRole('checkbox')).toBeEnabled({timeout:60000})
  await male.getByRole('checkbox').check()
  await page.screenshot({path:info.outputPath('skin-twin-dressing.png'),fullPage:true})
  await page.getByRole('button',{name:'남자 세트 공개',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('남자 세트를 뽑기에 공개했어요.')
  expect((stored!.definition as {productCode:string}).productCode).toMatch(/^SET_[A-F0-9]{16}$/)
  await expect(page.getByRole('button',{name:'남자 세트 공개',exact:true})).toBeDisabled()
  await page.getByLabel('남자 기존 세트',{exact:true}).selectOption(presets[0]!.id)
  await expect(male.getByRole('checkbox')).toBeEnabled({timeout:60000})
  await page.getByLabel('남자 기존 세트',{exact:true}).selectOption(presets[1]!.id)
  await expect(male.getByRole('checkbox')).toBeEnabled({timeout:60000})
  await page.getByLabel('남자 기존 세트',{exact:true}).selectOption(presets[2]!.id)
  await page.getByRole('button',{name:'남자 머리 불러오기',exact:true}).click()
  await expect(page.getByRole('dialog').getByRole('button',{name:/^전체 의상/})).toHaveCount(0)
  await expect(page.getByRole('dialog').getByRole('button',{name:/공용 전체 의상/})).toBeEnabled()
  await page.getByRole('button',{name:'아이템 선택 닫기',exact:true}).click()

})
