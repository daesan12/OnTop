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
  test(`가위바위보는 제목·닫기를 유지하며 룰렛부터 마지막 조작부까지 잘리지 않는다 ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size); await page.emulateMedia({ reducedMotion: 'reduce' })
    await load(page)
    await page.evaluate(async () => {
      const store = await import('/src/features/rpsRoulette/store.ts' as string)
      const { PreviewRpsRouletteService } = await import('/src/features/rpsRoulette/preview.ts' as string)
      store.setRpsRoulettePort(new PreviewRpsRouletteService()); store.openRpsRoulette()
    })
    const rps = page.getByRole('dialog', { name: '가위바위보 룰렛', exact: true })
    const content = rps.getByLabel('가위바위보 게임기 내용'), close = rps.getByRole('button', { name: '게임기 닫기' })
    await contained(page, rps); await contained(page, content)
    await expect(rps.getByRole('heading', { name: '가위바위보 룰렛' })).toBeInViewport()
    await expect(rps.locator('.rps-roulette-face')).toBeInViewport()
    await expect(close).toBeInViewport()
    await screenshot(page, `rps-first-content-${size.width}`, 'disabled')
    await wheel(page, content, 4000)
    await expect(rps.locator('.rps-roulette-foot')).toBeInViewport(); await expect(close).toBeInViewport()
    const start = rps.getByRole('button', { name: 'START', exact: true })
    await expect(start).toBeInViewport(); await expect(rps.getByRole('button', { name: '멈춤', exact: true })).toBeInViewport()
    await screenshot(page, `rps-last-content-${size.width}`, 'disabled')
    await start.click()
    await expect.poll(() => page.evaluate(async () =>
      (await import('/src/features/rpsRoulette/store.ts' as string)).useRpsRoulette.getState().data?.round?.phase)).toBe('DUEL')
    await expect(close).toBeInViewport(); await close.click(); await expect(rps).toHaveCount(0)
  })
}

test('장소 바로가기는 지도 범례와 높이를 맞추고 목록 안에서만 스크롤한다', async ({ page }) => {
  await load(page); await page.getByRole('button', { name: '공원 지도', exact: true }).click()
  const map = page.getByRole('dialog', { name: '공원 지도창', exact: true })
  const list = map.getByRole('group', { name: '장소 바로가기 목록', exact: true })
  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    await list.evaluate(el => { el.scrollTop = 0 })
    await list.scrollIntoViewIfNeeded()
    if (size.width > 900) {
      const figure = (await map.locator('.park-map-figure').boundingBox())!, side = (await map.locator('.park-map-side').boundingBox())!
      expect(Math.abs(figure.y - side.y)).toBeLessThan(1)
      expect(Math.abs(figure.height - side.height)).toBeLessThan(1)
    }
    expect(await list.evaluate(el => getComputedStyle(el).scrollbarWidth)).toBe('none')
    expect(await list.evaluate(el => getComputedStyle(el, '::-webkit-scrollbar').display)).toBe('none')
    const before = await map.evaluate(el => el.scrollTop)
    await wheel(page, list, 3000)
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
    expect(await map.evaluate(el => el.scrollTop)).toBe(before)
    await expect(list.getByRole('button', { name: /랭킹 보드/ })).toBeInViewport()
    await screenshot(page, `map-destination-list-scroll-${size.width}`, 'disabled')
  }
})

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
