import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { shopFixture } from './shopFixture'

const panels = [
  { kind: 'wardrobe', file: 'wardrobe/WardrobeScreen.tsx', label: '옷장' },
  { kind: 'shop', file: 'shop/ShopPanel.tsx', label: '상점' },
  { kind: 'manual', file: 'manual/ManualContents.tsx', label: '설명서' },
] as const
type Panel = typeof panels[number]

async function open(page: Page, panel: Panel) {
  if (panel.kind === 'wardrobe') await page.getByRole('button', { name: '옷장', exact: true }).click()
  else if (panel.kind === 'manual') await page.keyboard.press('F1')
  // The shop has no public launcher yet; exercise the real controller without adding one.
  else await page.evaluate(async () => { (await import('/src/features/shop/controller.ts' as string)).openShop() })
}
function content(page: Page, panel: Panel) {
  return panel.kind === 'wardrobe' ? page.getByRole('region', { name: '마이룸 옷장' })
    : panel.kind === 'shop' ? page.getByRole('dialog', { name: '온탑 상점과 옷장' })
    : page.getByRole('searchbox', { name: '게임 설명 검색' })
}
async function loaded(page: Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByRole('button', { name: '옷장', exact: true })).toBeEnabled()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
}
async function locks(page: Page) {
  return page.evaluate(async () => {
    const { inputState } = await import('/src/world/inputOwnership.ts' as string)
    return { shop: inputState.shopOpen, wardrobe: inputState.wardrobeOpen, manual: inputState.manualOpen }
  })
}

test('first on-demand manual opens over the current tablet without changing its seat', async ({ page }) => {
  const server = await fixture(page, { omok: true })
  await loaded(page)
  await page.locator('canvas').focus()
  await page.keyboard.press('KeyE')
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await expect(tablet).toBeVisible()
  const before = server.sent.filter(message => /TABLE_JOIN|TABLE_LEAVE|READY_SET|GAME_ACTION/.test(message.type)).length
  await page.keyboard.press('F1')
  const manual = page.getByRole('dialog', { name: '게임 설명서', exact: true })
  await expect(manual.getByRole('button', { name: '오목 설명 읽기', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(manual).toBeHidden()
  await expect(tablet).toBeVisible()
  expect(server.sent.filter(message => /TABLE_JOIN|TABLE_LEAVE|READY_SET|GAME_ACTION/.test(message.type))).toHaveLength(before)
})

for (const panel of panels) {
  test(`${panel.kind} keeps close and retry available after a chunk download failure`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const server = await fixture(page)
    await shopFixture(page, equipment => server.equipment('101', equipment))
    let fail = true
    await page.route(`**/src/features/${panel.file}*`, route => fail
      ? route.fulfill({ status: 503, contentType: 'text/javascript', body: '' }) : route.continue())
    await loaded(page)
    await open(page, panel)
    const fallback = page.getByLabel(`${panel.label} 불러오기`, { exact: true })
    await expect(fallback.getByRole('alert')).toBeVisible()
    fail = false
    await fallback.getByRole('button', { name: '다시 불러오기', exact: true }).click()
    await expect(content(page, panel)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect.poll(() => locks(page)).toEqual({ shop: false, wardrobe: false, manual: false })
    expect(errors).toEqual([])
  })

  test(`${panel.kind} downloads on demand and Escape works before its code arrives`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const server = await fixture(page)
    await shopFixture(page, equipment => server.equipment('101', equipment))
    const requests: string[] = []
    page.on('request', request => {
      if (panels.some(item => request.url().includes('/src/features/' + item.file))) requests.push(request.url())
    })
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    await page.route(`**/src/features/${panel.file}*`, async route => { await gate; await route.continue() })
    try {
      await loaded(page)
      expect(requests).toEqual([])
      await open(page, panel)
      await expect(page.getByLabel(`${panel.label} 불러오기`, { exact: true })).toBeVisible()
      await expect.poll(() => requests.length).toBe(1)
      await page.keyboard.press('Escape')
      await expect.poll(() => locks(page)).toEqual({ shop: false, wardrobe: false, manual: false })
      release()
      await expect(content(page, panel)).toBeHidden()
      await open(page, panel)
      await expect(content(page, panel)).toBeVisible()
      await expect(page.locator('vite-error-overlay')).toHaveCount(0)
      expect(errors).toEqual([])
      expect(server.maxActive).toBe(1)
      await screenshot(page, `optional-${panel.kind}-loaded`)
    } finally { release() }
  })

  test(`${panel.kind} releases input on session end while its code is pending`, async ({ page }) => {
    const server = await fixture(page)
    await shopFixture(page, equipment => server.equipment('101', equipment))
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    await page.route(`**/src/features/${panel.file}*`, async route => { await gate; await route.continue() })
    try {
      await loaded(page)
      await open(page, panel)
      await expect(page.getByLabel(`${panel.label} 불러오기`, { exact: true })).toBeVisible()
      server.endSession()
      await expect(page.getByRole('button', { name: '네이버로 계속하기', exact: true })).toBeVisible()
      await expect.poll(() => locks(page)).toEqual({ shop: false, wardrobe: false, manual: false })
      release()
      await expect(content(page, panel)).toBeHidden()
    } finally { release() }
  })
}
