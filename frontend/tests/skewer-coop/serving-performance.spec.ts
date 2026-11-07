import { expect, test, type Page } from '@playwright/test'

async function probe(page: Page) {
  await page.goto('/tests/skewer-coop/fixtures/play-feedback.html?role=server')
  await expect(page).toHaveTitle('꼬치왕 플레이 피드백 검수')
  await expect(page.locator('.service-stage')).toHaveAttribute('data-ready', 'true')
  await page.evaluate(async () => {
    const url = '/src/features/skewer/serviceHall/rendering/ServiceScene.ts'
    const { ServiceScene } = await import(/* @vite-ignore */ url), update = ServiceScene.prototype.update
    ServiceScene.prototype.update = function (...args: unknown[]) {
      Reflect.set(window, 'servingScene', this); return update.apply(this, args)
    }
  })
  await page.waitForFunction(() => !!Reflect.get(window, 'servingScene'))
  await page.evaluate(() => {
    const scene = Reflect.get(window, 'servingScene'), counters = { steps: 0, updates: 0, draws: 0 }
    for (const [owner, name, counter] of [[scene, 'step', 'steps'], [scene, 'update', 'updates'], [scene.post, 'render', 'draws']] as const) {
      const original = owner[name]
      owner[name] = function (...args: unknown[]) { counters[counter]++; return original.apply(this, args) }
    }
    Reflect.set(window, 'servingCounters', counters)
  })
}
async function reset(page: Page) {
  await page.evaluate(() => { const c = Reflect.get(window, 'servingCounters'); c.steps = c.updates = c.draws = 0 })
}
const counts = (page: Page) => page.evaluate(() => ({ ...Reflect.get(window, 'servingCounters') }))

test('서빙 일시정지는 같은 장면의 계산·렌더를 생략하고 상태 갱신·리사이즈·재개는 유지한다', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await probe(page)
  const stage = page.locator('.service-stage')
  await expect(stage).toHaveAttribute('data-server-model', 'sculpted', { timeout: 45000 })
  await expect(stage).toHaveAttribute('data-chef-model', 'sculpted', { timeout: 45000 })
  await expect(stage).toHaveAttribute('data-guest-model', 'bungeoppang', { timeout: 45000 })
  await page.getByRole('button', { name: '일시정지', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '공원으로 나갈까요?', exact: true })
  await expect(dialog).toBeVisible(); await page.waitForTimeout(100); await reset(page)
  const position = await page.evaluate(() => Reflect.get(window, 'skewerFeedback').position())
  await page.keyboard.press('d'); await page.keyboard.press('e'); await page.waitForTimeout(300)
  expect(await page.evaluate(() => Reflect.get(window, 'skewerFeedback').position())).toEqual(position)
  expect(await counts(page)).toMatchObject({ updates: 0, draws: 0 })
  expect((await counts(page)).steps).toBeGreaterThan(3)
  await page.setViewportSize({ width: 1200, height: 760 })
  await expect.poll(async () => (await counts(page)).draws).toBeGreaterThan(0)
  await page.waitForTimeout(100); await reset(page)
  // A remote authoritative change must invalidate a paused canvas immediately.
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').tableArrival(6))
  await expect(stage.locator('canvas')).toBeVisible()
  await expect.poll(async () => (await counts(page)).updates).toBeGreaterThan(0)
  await expect(page.locator('[data-table="3"]')).toHaveAttribute('data-status', 'arriving')
  await page.waitForTimeout(100); await reset(page); await page.waitForTimeout(200)
  expect(await counts(page)).toMatchObject({ updates: 0, draws: 0 })
  await dialog.getByRole('button', { name: '계속하기', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.keyboard.down('d'); await page.waitForTimeout(450); await page.keyboard.up('d')
  expect((await page.evaluate(() => Reflect.get(window, 'skewerFeedback').position())).x).toBeGreaterThan(position.x)
  expect((await counts(page)).draws).toBeGreaterThan(3)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([])
})

test('일시정지 후 로딩된 실제 캐릭터도 캔버스를 다시 그린다', async ({ page }) => {
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/*.glb', async route => { await held; await route.continue() })
  try {
    await probe(page)
    await page.getByRole('button', { name: '일시정지', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '공원으로 나갈까요?', exact: true })).toBeVisible()
    await page.waitForTimeout(100); await reset(page); release()
    const stage = page.locator('.service-stage')
    for (const [key, value] of [['server', 'sculpted'], ['chef', 'sculpted'], ['guest', 'bungeoppang']]) {
      await expect(stage).toHaveAttribute(`data-${key}-model`, value, { timeout: 45000 })
    }
    await expect.poll(async () => (await counts(page)).draws).toBeGreaterThan(0)
    await page.waitForTimeout(150); await reset(page); await page.waitForTimeout(200)
    expect(await counts(page)).toMatchObject({ updates: 0, draws: 0 })
  } finally { release() }
})
