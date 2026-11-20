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

test('온보딩 직후 첫 입장에서 카메라를 고정한 채 환영하고 체험 투어를 직접 해 본다', async ({ page }) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const { cabinet, front } = rpsCabinetPlacement({ ...PARK_LAYOUT.SITES.cart, ...PARK_LAYOUT.SETTINGS.fishBreadShop })
  await fixture(page, { generatedPark: true, position: { x: front.x, y: .8, z: front.z, yaw: cabinet.yaw + Math.PI } })
  await page.route('**/api/v1/auth/exchange', route => route.fulfill({ json: { status: 'ONBOARDING_REQUIRED', onboardingToken: 'fixture-onboarding' } }))
  await page.route('**/api/v1/users/onboarding', route => route.fulfill({ json: { accessToken: 'fixture-access' } }))

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/auth/callback#exchange_code=' + 'A'.repeat(43))
  await expect(page.locator('.onboarding-page')).toBeVisible({ timeout: 20000 })
  await page.locator('#onboarding-nickname').fill('산책자')
  await page.getByText('안내를 확인했고, 이 캐릭터로 시작할게요').click()
  const welcomeCamera = await page.evaluateHandle(async () => {
    const { adCameraProbe } = await import('/tests/e2e/sceneProbe.ts' as string)
    const { welcomeFlight } = await import('/src/features/welcomeTour/flight.ts' as string)
    const sample = { farthest: 0, frames: 0 }
    function frame() {
      if (document.querySelector('.welcome-tour-banner')) {
        const { camera, pose } = adCameraProbe()
        if (pose) {
          sample.farthest = Math.max(sample.farthest, Math.hypot(camera[0] - pose.x, camera[1] - pose.y, camera[2] - pose.z))
          sample.frames++
        }
      }
      if (!welcomeFlight.startedAt || performance.now() - welcomeFlight.startedAt < 3000) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    return sample
  })
  await page.getByRole('button', { name: '공원 입장하기' }).click()

  // 공원이 준비되면 내 캐릭터 곁에서 환영 배너를 보여 준다.
  const banner = page.locator('.welcome-tour-banner')
  await expect(banner).toBeVisible({ timeout: 120000 })
  await expect(banner).toContainText('온탑 공원에 오신 걸 환영해요')
  await expect.poll(() => welcomeCamera.evaluate(sample => sample.frames)).toBeGreaterThan(0)
  expect(await page.evaluate(async () => (await import('/src/world/inputOwnership.ts' as string)).panelOwnsKeys())).toBe(true)
  await screenshot(page, 'tour-01-stationary-welcome')

  // 환영 배너 뒤 기존 대화와 투어가 이어진다.
  await expect(banner).toBeHidden({ timeout: 6000 })
  expect(await welcomeCamera.evaluate(sample => sample.farthest)).toBeLessThan(15)
  const story = page.getByRole('dialog', { name: '박영감' })
  await expect(story).toBeVisible()
  await expect(story).toContainText('1 / 3')
  const portrait = story.locator('.joke-portrait')
  const frame = story.locator('.joke-dialogue-frame')
  const insideFrame = async () => {
    const [imageBox, frameBox] = await Promise.all([portrait.boundingBox(), frame.boundingBox()])
    return !!imageBox && !!frameBox && imageBox.x >= frameBox.x && imageBox.y >= frameBox.y
      && imageBox.x + imageBox.width <= frameBox.x + frameBox.width
      && imageBox.y + imageBox.height <= frameBox.y + frameBox.height
  }
  await expect.poll(insideFrame).toBe(true)
  await story.getByRole('button', { name: '다음' }).click()
  await expect(story).toContainText('2 / 3')
  await expect(story).toContainText('패치노트')
  await expect.poll(insideFrame).toBe(true)
  await story.getByRole('button', { name: '다음' }).click()
  await expect(story).toContainText('3 / 3')
  await expect(story).toContainText('공원 지하에는 보물이 많이 숨겨져 있다네')
  await expect.poll(insideFrame).toBe(true)
  await story.getByRole('button', { name: '공원 둘러보기' }).click()
  await expect(story).toBeHidden()
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

  // 4 혼자 한 판: 오락기 게임 고르기 창을 열기만 해도 된다.
  await page.locator('canvas').focus()
  await expect(page.getByRole('button', { name: /오락기 하기/ })).toBeVisible({ timeout: 20000 })
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('dialog', { name: '어떤 게임을 할까요?', exact: true })).toBeVisible()
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

const welcomePendingKey = 'ontop:park-welcome-pending'

test('대기 중 새로고침해도 로그인 환영 대화가 열리고 건너뛰면 대기를 지운다', async ({ page }) => {
  await fixture(page, { generatedPark: true })
  await page.addInitScript(() => {
    if (location.pathname !== '/auth/callback') return
    window.addEventListener('DOMContentLoaded', () => {
      const dialog = document.createElement('dialog')
      dialog.setAttribute('aria-label', '입장 중 열린 다른 창')
      document.body.append(dialog)
      dialog.showModal()
    }, { once: true })
  })
  await page.route('**/api/v1/auth/exchange', route => route.fulfill({
    json: { status: 'AUTHENTICATED', accessToken: 'fixture-access' },
  }))
  await page.goto('/auth/callback#exchange_code=' + 'A'.repeat(43))
  const story = page.getByRole('dialog', { name: '박영감' })
  await expect(page.getByRole('dialog', { name: '입장 중 열린 다른 창' })).toBeVisible()
  await expect(page.locator('.park-welcome-story')).toHaveCount(1, { timeout: 45000 })
  await expect(story).toBeHidden()
  expect(await page.evaluate(key => Number(sessionStorage.getItem(key)) > Date.now(), welcomePendingKey)).toBe(true)

  await page.reload()
  await expect(story).toBeVisible({ timeout: 80000 })
  await page.keyboard.press('Escape')
  await expect(story).toHaveCount(0)
  expect(await page.evaluate(key => sessionStorage.getItem(key), welcomePendingKey)).toBeNull()
})

test('다른 팝업을 기다리다 만료된 환영 대화는 접속 공지에 자리를 내준다', async ({ page }) => {
  await page.clock.install()
  await fixture(page, { generatedPark: true })
  await page.addInitScript(key => {
    sessionStorage.setItem(key, String(Date.now() + 90_000))
    window.addEventListener('DOMContentLoaded', () => {
      const dialog = document.createElement('dialog')
      dialog.id = 'welcome-story-test-blocker'
      document.body.append(dialog)
      dialog.showModal()
    }, { once: true })
  }, welcomePendingKey)
  const now = new Date().toISOString()
  const noticeId = '11111111-1111-4111-8111-111111111111'
  await page.route('**/api/v1/entry-news', route => route.fulfill({ json: { serverTime: now, pages: [{
    id: noticeId, title: '검수용 공지', published: true, displayOrder: 0,
    startsAt: null, endsAt: null, version: 1, updatedAt: now, imageHash: 'a'.repeat(64),
  }] } }))
  await page.route('**/api/v1/entry-news/' + noticeId + '/image', route => route.fulfill({
    path: 'tests/fixtures/entry-news/alkkagi-update.png', contentType: 'image/png',
  }))
  await page.goto('/park')
  await expect(page.locator('.park-welcome-story')).toHaveCount(1, { timeout: 45000 })
  await page.clock.fastForward(90_001)
  await expect(page.locator('.park-welcome-story')).toHaveCount(0)
  expect(await page.evaluate(key => sessionStorage.getItem(key), welcomePendingKey)).toBeNull()
  await page.locator('#welcome-story-test-blocker').evaluate(element => element.remove())
  await expect(page.getByRole('dialog', { name: '온탑 새 소식' })).toBeVisible({ timeout: 45000 })
})
