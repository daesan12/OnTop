import { test, expect } from '@playwright/test'
import { fixture } from './contractFixture'

const id = '77777777-7777-4777-8777-777777777777'
async function setup(page: import('@playwright/test').Page) {
  await fixture(page)
  await page.route('**/api/v1/admin/me', r => r.fulfill({ json: { canRead: true, canOperate: true, canGrant: false } }))
  await page.route('**/api/v1/skins/assets', r => r.fulfill({ json: [] }))
  let saved: Record<string, unknown> | null = null
  await page.route('**/api/v1/admin/operations/skins**', r => {
    const p = new URL(r.request().url()).pathname
    if (p.endsWith('/settings')) return r.fulfill({ json: { storageReady: true, maxModelBytes: 20971520, maxImageBytes: 2097152 } })
    if (p.endsWith('/components') && r.request().method() === 'POST') {
      saved = { id, definition: r.request().postDataJSON(), state: 'DRAFT', version: 0, publishedUploadId: null }
      return r.fulfill({ json: saved })
    }
    if (p.endsWith('/components')) return r.fulfill({ json: saved ? [saved] : [] })
    return r.fulfill({ json: [] })
  })
  await page.goto('/admin/skins')
  return { get saved() { return saved } }
}

test('처음 등록은 이름·부위부터 시작하고 코드와 이전 도구는 접어 둔다', async ({ page }, info) => {
  const result = await setup(page)
  await expect(page.getByRole('button', { name: /의상 파일 등록/ })).toHaveAttribute('aria-current', 'step')
  await expect(page.getByRole('button', { name: '이전 의상 불러오기', exact: true })).toBeHidden()
  await expect(page.getByLabel('상품 코드', { exact: true })).toBeHidden()
  await expect(page.getByLabel('GLB 모델', { exact: true })).toHaveCount(0)
  await page.getByLabel('의상 이름', { exact: true }).fill('갓과 얼굴')
  await page.getByLabel('얼굴', { exact: true }).check()
  await page.getByRole('button', { name: '저장하고 파일 올리기 →', exact: true }).click()
  await expect(page.getByLabel('GLB 모델', { exact: true })).toBeEnabled()
  const definition = result.saved!.definition as { productCode: string; slots: string[] }
  expect(definition.productCode).toMatch(/^ITEM_[A-F0-9]{16}$/)
  expect(definition.slots).toEqual(['HAIR', 'FACE'])
  await page.screenshot({ path: info.outputPath('item-file-step.png'), fullPage: true })
})

test('저장 전 단계 이동을 취소하면 입력을 유지하고 승인한 경우에만 이동한다', async ({ page }) => {
  await setup(page)
  await page.getByLabel('의상 이름', { exact: true }).fill('아직 저장하지 않은 의상')
  page.once('dialog', d => d.dismiss())
  await page.getByRole('button', { name: /뽑기 세트 만들기/ }).click()
  await expect(page.getByLabel('의상 이름', { exact: true })).toHaveValue('아직 저장하지 않은 의상')
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: /뽑기 세트 만들기/ }).click()
  await expect(page.getByRole('heading', { name: '함께 뽑힐 의상을 골라주세요.' })).toBeVisible()
  await expect(page.getByText('아직 준비된 의상이 없어요.', { exact: false })).toBeVisible()
})

test('준비된 의상에서 다음 단계로 가면 해당 부위와 캐릭터가 미리 선택된다', async ({ page }) => {
  await setup(page)
  const entry = { id, definition: { productCode: 'READY_HEAD', name: '준비한 갓', grade: 4, compatibility: 'FEMALE', wearMode: 'PARTS', slots: ['HAIR', 'FACE'] }, state: 'PUBLISHED', version: 1, publishedUploadId: id }
  await page.route('**/api/v1/admin/operations/skins/components', r => r.fulfill({ json: [entry] }))
  await page.reload()
  await page.getByRole('button', { name: /준비한 갓/ }).click()
  await page.getByRole('button', { name: '이 의상으로 세트 만들기 →', exact: true }).click()
  await expect(page.getByLabel('세트 착용 캐릭터')).toHaveValue('FEMALE')
  await expect(page.locator('.skin-set-places .occupied')).toHaveCount(2)
  await expect(page.locator('.skin-set-selection')).toContainText('준비한 갓')
})


test('세트 화면 안에서 새 세트를 눌러도 저장 전 변경을 보호한다', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: /뽑기 세트 만들기/ }).click()
  await page.getByLabel('세트 이름').fill('작성 중인 선비 세트')
  page.once('dialog', d => d.dismiss())
  await page.getByRole('button', { name: '＋ 새 세트 만들기', exact: true }).click()
  await expect(page.getByLabel('세트 이름')).toHaveValue('작성 중인 선비 세트')
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: '＋ 새 세트 만들기', exact: true }).click()
  await expect(page.getByLabel('세트 이름')).toHaveValue('')
})
