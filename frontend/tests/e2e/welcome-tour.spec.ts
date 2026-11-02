import { test, expect, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { PARK_LAYOUT } from '../../src/map/park'
import { rpsCabinetPlacement } from '../../src/features/rpsRoulette/placement'

const camera = (page: Page) => page.evaluate(async () => {
  const q = await import('/tests/e2e/sceneProbe.ts' as string)
  return q.adCameraProbe() as { camera: number[]; pose: { x: number; y: number; z: number } | null }
})
const tour = (page: Page) => page.getByRole('complementary', { name: '공원 체험 투어' })
const step = (page: Page, title: string) => tour(page).locator('li', { hasText: title })
/** 앱과 같은 모듈 인스턴스(Vite 개발 서버 URL)로 투어 동작을 알린다. 실제 조작을 다시 검증할 필요가 없는 단계에만 쓴다. */
const note = (page: Page, actions: string[]) => page.evaluate(async list => {
  const q = await import('/src/features/welcomeTour/state.ts' as string)
  for (const action of list) action === 'walk' ? q.noteTourWalk(8) : q.noteTourAction(action)
}, actions)

test('온보딩 직후 첫 입장에서 5초 환영 비행 뒤 체험 투어를 직접 해 본다', async ({ page }) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const { cabinet, front } = rpsCabinetPlacement({ ...PARK_LAYOUT.SITES.cart, ...PARK_LAYOUT.SETTINGS.fishBreadShop })
  await fixture(page, { generatedPark: true, position: { x: front.x, y: .8, z: front.z, yaw: cabinet.yaw + Math.PI } })
  await page.route('**/api/v1/auth/exchange', route => route.fulfill({ json: { status: 'ONBOARDING_REQUIRED', onboardingToken: 'fixture-onboarding' } }))
  await page.route('**/api/v1/users/onboarding', route => route.fulfill({ json: { accessToken: 'fixture-access' } }))

  await page.goto('/auth/callback#exchange_code=' + 'A'.repeat(43))
  await expect(page.locator('.onboarding-page')).toBeVisible({ timeout: 20000 })
  await page.locator('#onboarding-nickname').fill('산책자')
  await page.getByText('안내를 확인했고, 이 캐릭터로 시작할게요').click()
  await page.getByRole('button', { name: '공원 입장하기' }).click()

  // 공원이 준비되면 건너뛸 수 없는 환영 비행이 시작된다.
  const banner = page.locator('.welcome-tour-banner')
  await expect(banner).toBeVisible({ timeout: 120000 })
  await expect(banner).toContainText('온탑 공원에 오신 걸 환영해요')
  // swiftshader 화면 캡처는 수 초가 걸리므로 시간에 민감한 확인을 캡처보다 먼저 한다.
  const high = await camera(page)
  expect(high.camera[1]).toBeGreaterThan(60)
  expect(await page.evaluate(async () => (await import('/src/world/inputOwnership.ts' as string)).panelOwnsKeys())).toBe(true)
  await page.keyboard.press('Escape')
  await expect(banner).toBeVisible({ timeout: 200 })
  await screenshot(page, 'tour-01-flight-start')
  await screenshot(page, 'tour-02-flight-later')

  // 비행이 끝나면 평소 3인칭 시점으로 돌아오고 투어 목록이 뜬다.
  await expect(banner).toBeHidden({ timeout: 6000 })
  await expect(tour(page)).toContainText('0/5')
  await page.waitForTimeout(800)
  const settled = await camera(page)
  const [cx, cy, cz] = settled.camera as [number, number, number]
  expect(Math.hypot(cx - settled.pose!.x, cy - settled.pose!.y, cz - settled.pose!.z)).toBeLessThan(15)
  await screenshot(page, 'tour-03-checklist', 'disabled')

  // 1 걷기: 게임기 앞에서 뒤로 걸었다가 돌아온다.
  await page.locator('canvas').focus()
  for (const key of ['KeyS', 'KeyW']) {
    await page.keyboard.down(key)
    await page.waitForTimeout(3500)
    await page.keyboard.up(key)
  }
  await expect(step(page, '걸어 보기')).toHaveAttribute('data-done', 'true', { timeout: 10000 })

  // 2 인사하기: 채팅 한 줄.
  await page.keyboard.press('Enter')
  await page.locator('#park-chat-input').fill('안녕하세요')
  await page.keyboard.press('Enter')
  await expect(step(page, '인사하기')).toHaveAttribute('data-done', 'true')

  // 3 지도로 길 찾기.
  await page.keyboard.press('KeyM')
  const map = page.getByRole('dialog', { name: '공원 지도창' })
  await expect(map).toBeVisible()
  await map.getByRole('button', { name: '소리함 길 안내', exact: true }).click()
  await page.keyboard.press('KeyM')
  await expect(map).toHaveCount(0)
  await expect(page.getByRole('region', { name: '내 길 안내', exact: true })).toBeVisible()
  await expect(step(page, '지도로 길 찾기')).toHaveAttribute('data-done', 'true')

  // 4 혼자 한 판: 게임기 창을 열기만 해도 된다.
  await page.locator('canvas').focus()
  await expect(page.getByRole('button', { name: /가위바위보 룰렛 하기/ })).toBeVisible({ timeout: 20000 })
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('dialog', { name: '가위바위보 룰렛', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(step(page, '혼자 한 판')).toHaveAttribute('data-done', 'true')
  await expect(tour(page)).toContainText('4/5')
  await expect(step(page, '함께 한 판')).toHaveAttribute('data-active', 'true')
  await screenshot(page, 'tour-04-progress', 'disabled')

  await tour(page).getByRole('button', { name: '나중에 하기' }).click()
  await expect(page.getByRole('button', { name: '투어 이어 하기 · 4/5' })).toBeVisible()
  await screenshot(page, 'tour-05-collapsed', 'disabled')
  await page.getByRole('button', { name: '투어 이어 하기 · 4/5' }).click()
  await expect(step(page, '함께 한 판')).toBeVisible()
  expect(errors).toEqual([])
})

test('다시 보기는 비행 없이 시작하고, 마치면 옷장 위치를 알려 준다', async ({ page }) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await fixture(page, { generatedPark: true })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.park-scene-message')).toBeHidden({ timeout: 120000 })
  await page.waitForTimeout(1500)
  // 온보딩을 거치지 않은 입장에는 환영 비행도 투어도 없다.
  await expect(page.locator('.welcome-tour-banner')).toHaveCount(0)
  await expect(tour(page)).toHaveCount(0)

  // 설명서 첫 걸음 페이지에서 다시 보기: 설명서가 닫힌 뒤 1단계부터.
  await page.keyboard.press('F1')
  const manual = page.getByRole('dialog', { name: '게임 설명서' })
  await expect(manual).toBeVisible()
  await manual.getByRole('button', { name: /첫 걸음/ }).click()
  await expect(manual.getByRole('button', { name: /공원 투어 다시 보기/ })).toBeEnabled()
  await screenshot(page, 'tour-06-manual-replay', 'disabled')
  await manual.getByRole('button', { name: /공원 투어 다시 보기/ }).click()
  await expect(manual).toBeHidden({ timeout: 5000 })
  await expect(tour(page)).toContainText('0/5')
  await expect(page.locator('.welcome-tour-banner')).toHaveCount(0)
  expect((await camera(page)).camera[1]).toBeLessThan(30)
  await tour(page).getByRole('button', { name: '투어 끝내기' }).click()
  await expect(tour(page)).toHaveCount(0)

  // 내 메뉴에서 다시 보기.
  await page.getByRole('button', { name: '내 메뉴' }).click()
  await page.getByRole('menuitem', { name: /공원 투어 다시 보기/ }).click()
  await expect(tour(page)).toContainText('0/5')

  // 앞의 네 단계는 첫 시나리오에서 실제 조작으로 확인했으므로 여기서는 바로 알린다.
  await note(page, ['walk', 'chat', 'navigate', 'minigame'])
  await expect(tour(page)).toContainText('4/5')
  // 5 함께 한 판: 테이블 앞에서 E로 앉는다.
  await page.locator('canvas').focus()
  await expect(page.getByRole('button', { name: /테이블에 앉기/ })).toBeVisible({ timeout: 20000 })
  await page.keyboard.press('KeyE')

  const finished = page.getByRole('complementary', { name: '공원 체험 투어' })
  await expect(finished).toContainText('투어를 모두 마쳤어요', { timeout: 10000 })
  await expect(finished).toContainText('옷장')
  await screenshot(page, 'tour-07-finished-seated', 'disabled')

  // 테이블에 앉아 있는 동안은 다시 보기를 막는다.
  await page.getByRole('button', { name: '내 메뉴' }).click()
  await expect(page.getByRole('menuitem', { name: /공원 투어 다시 보기/ })).toBeDisabled()
  await screenshot(page, 'tour-08-replay-blocked', 'disabled')
  await page.getByRole('button', { name: '내 메뉴' }).click()

  // 앉아 있는 동안 완료 카드가 저절로 닫히지 않고, 일어나면 옷장 버튼을 깜빡여 위치를 보여 준다.
  await page.waitForTimeout(13000)
  await expect(finished).toContainText('투어를 모두 마쳤어요')
  await page.getByRole('button', { name: '일어나기', exact: true }).click()
  const wardrobe = page.locator('.park-dock-wardrobe .park-shop-launcher')
  await expect(wardrobe).toBeVisible({ timeout: 10000 })
  expect(await wardrobe.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid')
  await expect(finished).toContainText('투어를 모두 마쳤어요')
  await screenshot(page, 'tour-09-finished-wardrobe', 'disabled')
  expect(errors).toEqual([])
})
