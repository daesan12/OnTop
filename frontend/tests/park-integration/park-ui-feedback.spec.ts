import { expect, test, type Page, type Locator } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'

const failures = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []; failures.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
})
test.afterEach(async ({ page }) => {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(failures.get(page)).toEqual([])
})
async function load(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
}
async function wheelToBottom(page: Page, panel: Locator) {
  expect(await panel.evaluate(el => getComputedStyle(el).scrollbarWidth)).toBe('none')
  expect(await panel.evaluate(el => getComputedStyle(el, '::-webkit-scrollbar').display)).toBe('none')
  await panel.evaluate(el => { el.scrollTop = 0 })
  expect(await panel.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0)
  const box = (await panel.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 2500)
  await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
}

test('최신 지도에서 이용자를 클릭하면 포인터·포커스 이동 후에도 닉네임을 유지하고 이탈·닫기 시 해제한다', async ({ page }) => {
  const server = await fixture(page, { generatedPark: true, players: 3 })
  await load(page)
  // Place the player on a zone disk to exercise real overlapping hit targets.
  const zone = await page.evaluate(async () => {
    const { PARK_ZONES } = await import('/src/park/mapConfig.ts' as string)
    return PARK_ZONES.find((zone: { id: string }) => zone.id === 'fountain')
  })
  server.remotePose({ x: zone.x, z: zone.z })
  await page.getByRole('button', { name: '공원 지도', exact: true }).click()
  const map = page.getByRole('dialog', { name: '공원 지도창', exact: true })
  const first = map.getByRole('button', { name: '산책자 102 위치', exact: true })
  const second = map.getByRole('button', { name: '산책자 103 위치', exact: true })
  const info = map.getByRole('status')
  await first.click(); await expect(first).toHaveAttribute('aria-pressed', 'true')
  await map.locator('.park-map-heading').hover(); await map.getByRole('button', { name: '지도 닫기' }).focus()
  await expect(info).toContainText('산책자 102')
  await screenshot(page, 'map-click-nickname-desktop', 'disabled')
  await second.focus(); await page.keyboard.press('Enter')
  await map.getByRole('button', { name: '지도 닫기' }).focus()
  await expect(info).toContainText('산책자 103'); await expect(second).toHaveAttribute('aria-pressed', 'true')
  await first.focus(); await page.keyboard.press('Space')
  await map.getByRole('button', { name: '지도 닫기' }).focus()
  await expect(info).toContainText('산책자 102')
  expect(await page.evaluate(async () =>
    (await import('/src/features/navigation/navigationState.ts' as string)).useNavigation.getState().target)).toBeNull()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(info).toBeInViewport(); await screenshot(page, 'map-click-nickname-mobile', 'disabled')
  server.players(1); await expect(info).not.toContainText('산책자 102')
  await map.getByRole('button', { name: '지도 닫기' }).click()
  server.players(3)
  await page.getByRole('button', { name: '공원 지도', exact: true }).click()
  await expect(map.getByRole('button', { name: '산책자 102 위치', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

for (const size of [{ width: 1366, height: 600 }, { width: 390, height: 600 }]) {
  test(`가위바위보와 복권방은 스크롤바 없이 휠로 하단 내용을 읽는다 ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size)
    await fixture(page, { generatedPark: true })
    await load(page)
    // Explicit browser-only service doubles; no real round, purchase or settlement.
    await page.evaluate(async () => {
      const store = await import('/src/features/rpsRoulette/store.ts' as string)
      const { PreviewRpsRouletteService } = await import('/src/features/rpsRoulette/preview.ts' as string)
      store.setRpsRoulettePort(new PreviewRpsRouletteService()); store.openRpsRoulette()
    })
    const rps = page.getByRole('dialog', { name: '가위바위보 룰렛', exact: true })
    await expect(rps).toBeVisible()
    await expect(rps.getByRole('button', { name: 'START', exact: true })).toBeEnabled()
    await wheelToBottom(page, rps)
    await expect(rps.locator('.rps-roulette-foot')).toBeInViewport()
    await screenshot(page, `rps-hidden-scrollbar-${size.width}`, 'disabled')
    await page.keyboard.press('Escape'); await expect(rps).toHaveCount(0)
    await page.evaluate(async () => {
      const store = await import('/src/features/raffle/store.ts' as string)
      const { PreviewRaffleService } = await import('/src/features/raffle/preview.ts' as string)
      store.setRafflePort(new PreviewRaffleService())
      ;(await import('/src/features/construction/model.ts' as string)).openConstructionNotice('layout-drink')
    })
    const raffle = page.locator('dialog.raffle')
    await expect(raffle).toBeVisible()
    await wheelToBottom(page, raffle)
    await expect(raffle.locator('.raffle-guide')).toBeInViewport()
    await screenshot(page, `raffle-hidden-scrollbar-${size.width}`, 'disabled')
    await page.keyboard.press('Escape'); await expect(raffle).toHaveCount(0)
  })
}
