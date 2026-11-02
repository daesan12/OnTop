import { expect, test, type Page, type Locator } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'
import { PARK_LAYOUT as park } from '../../src/map/park'

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
  const [x, y, z] = park.data.physics.spawn.position
  await fixture(page, { generatedPark: true, position: { x, y, z, yaw: 0 } })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
}
async function contained(page: Page, panel: Locator) {
  await expect(panel).toBeVisible()
  const box = (await panel.boundingBox())!, size = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1)
  expect(await panel.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  expect(await panel.evaluate(el => getComputedStyle(el).scrollbarWidth)).toBe('none')
}
async function wheel(page: Page, target: Locator, delta: number) {
  const box = (await target.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, delta)
}

test('지도는 분수대 연결 마당·징검다리를 표시하고 누락된 시설의 실제 진입점으로 안내한다', async ({ page }) => {
  await load(page)
  await page.getByRole('button', { name: '공원 지도', exact: true }).click()
  const map = page.getByRole('dialog', { name: '공원 지도창', exact: true })
  const court = map.locator('[data-map-court="vr"]')
  await expect(court).toHaveAttribute('x', String(park.VR_COURT.x - park.VR_COURT.width / 2))
  await expect(court).toHaveAttribute('width', String(park.VR_COURT.width))
  await expect(map.locator('[data-map-crossing="stone"] > line')).toHaveCount(0)
  expect(await map.locator('[data-map-crossing="stone"] > rect').count()).toBeGreaterThan(8)
  await expect(map.locator('[data-map-crossing="wood"]')).toBeVisible()
  const rps = map.locator('[data-place-id="rps-roulette"] circle')
  expect(Number(await rps.getAttribute('r'))).toBeLessThan(Number(await map.locator('[data-place-id="folk"] circle').getAttribute('r')))
  for (const name of ['민속놀이 존', '돌탑 점프맵', '가위바위보 룰렛', '복권방', '랭킹 보드']) {
    const marker = map.getByRole('button', { name: `${name} 길 안내`, exact: true })
    await marker.click()
    await expect.poll(() => page.evaluate(async () =>
      (await import('/src/features/navigation/navigationState.ts' as string)).useNavigation.getState().status)).toBe('guiding')
    await expect(map.getByLabel('안내 중인 목적지')).toContainText(name)
  }
  await map.evaluate(el => { el.scrollTop = 0 })
  await screenshot(page, 'map-paths-and-facilities-desktop', 'disabled')
})

for (const size of [{ width: 320, height: 480 }, { width: 800, height: 360 }]) {
  test(`복권방은 제목·닫기를 유지하며 첫 경품부터 마지막 안내·응모 결과까지 잘리지 않는다 ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size); await page.emulateMedia({ reducedMotion: 'reduce' })
    await load(page)
    await page.evaluate(async () => {
      const store = await import('/src/features/raffle/store.ts' as string)
      const { PreviewRaffleService } = await import('/src/features/raffle/preview.ts' as string)
      store.setRafflePort(new PreviewRaffleService())
      ;(await import('/src/features/construction/model.ts' as string)).openConstructionNotice('layout-drink')
    })
    const raffle = page.getByRole('dialog', { name: '복권방 행운의 뽑기', exact: true })
    const content = raffle.getByLabel('복권방 내용'), close = raffle.getByRole('button', { name: '복권방 닫기' })
    await contained(page, raffle); await contained(page, content)
    await expect(raffle.getByRole('heading', { name: /행운의/ })).toBeInViewport()
    await expect(raffle.locator('.raffle-rank').first()).toBeInViewport()
    await expect(close).toBeInViewport()
    await screenshot(page, `raffle-first-content-${size.width}`, 'disabled')
    await wheel(page, content, 4000)
    await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
    await expect(raffle.locator('.raffle-note')).toBeInViewport(); await expect(close).toBeInViewport()
    await screenshot(page, `raffle-last-content-${size.width}`, 'disabled')
    const draw = raffle.getByRole('button', { name: '뽑기권 뽑기 · 100냥', exact: true })
    await draw.scrollIntoViewIfNeeded(); await draw.click()
    const result = raffle.getByRole('group', { name: '뽑은 응모 번호', exact: true })
    await expect(result).toBeVisible(); await contained(page, result)
    await expect(result.locator('strong')).toHaveText(/^\d{1,5}$/)
    const confirm = result.getByRole('button', { name: '확인', exact: true })
    await confirm.scrollIntoViewIfNeeded(); await expect(confirm).toBeInViewport()
    await screenshot(page, `raffle-result-accessible-${size.width}`, 'disabled')
    await confirm.click(); await expect(result).toHaveCount(0)
    await expect(close).toBeInViewport(); await close.click(); await expect(raffle).toHaveCount(0)
  })
}

test('공통 메뉴와 종이 팝업은 낮은 화면에서 내용과 마지막 버튼까지 스크롤할 수 있다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 800, height: 360 }); await load(page)
  await page.getByRole('button', { name: '내 메뉴', exact: true }).click()
  await page.getByRole('menuitem', { name: /내 정보/ }).click()
  const profile = page.getByRole('dialog', { name: '내 정보', exact: true })
  await page.setViewportSize({ width: 390, height: 320 })
  await contained(page, profile)
  const save = profile.getByRole('button', { name: '저장', exact: true })
  await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport()
  await screenshot(page, 'common-profile-low-height', 'disabled')
  await page.keyboard.press('Escape')
  await page.goto('/jumpmap-preview.html')
  await page.getByRole('button', { name: '출발 안내 보기', exact: true }).click()
  const paper = page.getByRole('dialog', { name: '돌탑 점프맵 준비 안내', exact: true })
  await contained(page, paper)
  await wheel(page, paper, 2000)
  const depart = paper.getByRole('button', { name: '안내 닫고 출발하기', exact: true })
  await depart.scrollIntoViewIfNeeded(); await expect(depart).toBeInViewport()
  await screenshot(page, 'common-paper-low-height', 'disabled'); await depart.click()
  await expect(paper).toHaveCount(0)
})
