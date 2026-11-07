import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const errors: string[] = []
    Reflect.set(window, 'skewerWindowErrors', errors)
    window.addEventListener('error', event => errors.push(event.message))
  })
})
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => Reflect.get(window, 'skewerWindowErrors') ?? [])).toEqual([])
})

async function capture(page: Page, name: string) {
  const folder = process.env.SKEWER_FEEDBACK_EVIDENCE
  if (folder) { await mkdir(folder, { recursive: true }); await page.screenshot({ path: path.join(folder, `${name}.png`), animations: 'disabled' }) }
}
function health(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  return async () => {
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(errors).toEqual([])
  }
}

test('입장과 방 생성 후에는 원래 표지가 보이고 닫기·방 나가기는 작은 화면에서도 접근된다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/tests/skewer-coop/fixtures/play-feedback.html?lobby=home')
  await expect(page.locator('.coop-room-home img')).toHaveAttribute('src', /skewer-cover-lowpoly.png/)
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '친구를 기다리고 있어요', exact: true })).toBeVisible()
  await expect(page.locator('.coop-entry-art img')).toHaveAttribute('src', /skewer-cover-lowpoly.png/)
  for (const [width, height] of [[1440, 900], [900, 500], [390, 844]]) {
    await page.setViewportSize({ width, height })
    const dialog = page.getByRole('dialog', { name: '역할 선택과 준비', exact: true })
    await dialog.locator('.coop-leave-room').scrollIntoViewIfNeeded()
    await expect(dialog.locator('.coop-leave-room')).toBeInViewport()
    await expect(dialog.locator('.paper-close')).toBeInViewport()
    await expect(dialog.locator('.paper-close')).toHaveCSS('background-color', 'rgb(120, 61, 43)')
    expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await capture(page, `waiting-navigation-${width}x${height}`)
  }
  await page.locator('.coop-leave-room').click()
  await expect(page.getByRole('heading', { name: '어느 가게에 함께할까요?', exact: true })).toBeVisible()
  await verify()
})

test('역할과 PC·VR 선택은 기존 일러스트를 사용하고 준비 화면에서 역할을 다시 고를 수 있다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/tests/skewer-coop/fixtures/play-feedback.html?lobby=roles')
  await expect(page.locator('.coop-pick-card.is-chef img')).toHaveAttribute('src', /chef-role-illustration.png/)
  await expect(page.locator('.coop-pick-card.is-server img')).toHaveAttribute('src', /server-role-illustration.png/)
  await capture(page, 'restored-role-illustrations')
  await page.getByRole('button', { name: '요리사', exact: true }).click()
  await expect(page.locator('.coop-pick-card.is-pc img')).toHaveAttribute('src', /chef-pc-choice-illustration.png/)
  await expect(page.locator('.coop-pick-card.is-vr img')).toHaveAttribute('src', /chef-vr-choice-illustration.png/)
  await capture(page, 'restored-device-illustrations')
  await page.getByRole('button', { name: 'PC로 요리하기', exact: true }).click()
  await expect(page.locator('.coop-guide-art img')).toHaveAttribute('src', /chef-pc-choice-illustration.png/)
  await page.getByRole('button', { name: '← 역할 다시 고르기', exact: true }).click()
  await page.getByRole('button', { name: '서빙 담당', exact: true }).click()
  await expect(page.locator('.coop-guide-art img')).toHaveAttribute('src', /server-role-illustration.png/)
  await verify()
})

test('이동 응답 대기 중 방향 전환은 최신 입력으로 교체되고 확인 직후 전송된다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/tests/skewer-coop/fixtures/play-feedback.html?role=server&holdMoves=1')
  await expect(page.getByTestId('service-hall')).toBeVisible()
  await expect(page.locator('.service-stage')).toHaveAttribute('data-building', 'cutaway-tower')
  await expect(page.locator('.service-stage')).toHaveAttribute('data-server-model', 'sculpted', { timeout: 45000 })
  const moves = () => page.evaluate(() => Reflect.get(window, 'skewerFeedback').moves() as { dx: number; dz: number; at: number }[])
  await page.keyboard.down('d')
  await expect.poll(async () => (await moves()).some(input => input.dx === 1)).toBe(true)
  await page.keyboard.up('d'); await page.keyboard.down('s')
  await page.waitForTimeout(150)
  expect(await moves()).toHaveLength(1)
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').releaseMoves())
  await expect.poll(async () => (await moves()).some(input => input.dx === 0 && input.dz === 1), { intervals: [10, 20] }).toBe(true)
  await page.keyboard.up('s')
  await expect.poll(async () => (await moves()).at(-1)).toMatchObject({ dx: 0, dz: 0 })
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').releaseMoves())
  await capture(page, 'server-responsive-turn')
  await verify()
})

test('테이블 접근 안내는 유지하고 노란 테두리는 표시하지 않는다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/tests/skewer-coop/fixtures/play-feedback.html?role=server')
  await expect(page.locator('.service-stage')).toHaveAttribute('data-building', 'cutaway-tower')
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').nearTable(2))
  await expect(page.getByRole('button', { name: /E 2번 청소하기/ })).toBeVisible()
  await expect(page.locator('.service-table-target.is-near')).toHaveCount(0)
  await expect(page.getByRole('img', { name: '2번 1인 테이블', exact: true })).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)')
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').tableArrival(0))
  await page.waitForTimeout(500)
  await capture(page, 'server-no-yellow-highlight')
  await verify()
})

for (const role of ['chef', 'server']) test(`${role} 준비 이미지는 기존 역할 일러스트다`, async ({ page }) => {
  const verify = health(page)
  await page.goto(`/tests/skewer-coop/fixtures/play-feedback.html?role=${role}&prepare=1`)
  if (role === 'chef') await page.getByRole('button', { name: 'PC로 요리하기', exact: true }).click()
  const image = page.locator('.coop-guide-art img')
  await expect(image).toHaveAttribute('src', new RegExp(`${role === 'server' ? 'server-role' : 'chef-pc-choice'}-illustration.png`))
  await expect(image).toHaveJSProperty('complete', true, { timeout: 15000 })
  expect(await image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(1000)
  for (const [width, height] of [[1440, 900], [900, 500], [390, 844]]) {
    await page.setViewportSize({ width, height })
    const dialog = page.getByRole('dialog', { name: '역할 선택과 준비', exact: true })
    const [box, nav] = await dialog.evaluate(el => ['.coop-ready-footer', '.coop-lobby-navigation'].map(selector => {
      const r = el.querySelector(selector)!.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }))
    expect(Math.abs(box.x - nav.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(box.width - nav.width)).toBeLessThanOrEqual(1)
    expect(nav.y - box.y - box.height).toBeGreaterThanOrEqual(11)
    await expect(dialog.locator('.coop-guide-art figcaption')).toHaveCSS('min-height', '46px')
    await dialog.locator('.coop-ready-action button').scrollIntoViewIfNeeded()
    await dialog.locator('.coop-ready-action button').click({ trial: true })
    await expect(dialog.getByRole('button', { name: '방 나가기 · 다른 방 선택', exact: true })).toBeInViewport()
    await dialog.locator('.coop-leave-room').scrollIntoViewIfNeeded()
    await dialog.locator('.coop-leave-room').click({ trial: true })
    expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await capture(page, `${role}-ready-footer-${width}x${height}`)
  }
  await verify()
})

test('서빙은 클릭해도 이동하지 않고 키보드로 이동하며 착석 전 주문 말풍선이 없다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/tests/skewer-coop/fixtures/play-feedback.html?role=server')
  await expect(page.locator('.service-stage')).toHaveAttribute('data-input-mode', 'keyboard-only')
  await expect(page.locator('.service-stage')).toHaveAttribute('data-guest-model', 'bungeoppang', { timeout: 45000 })
  const start = await page.evaluate(() => Reflect.get(window, 'skewerFeedback').position())
  await page.getByRole('img', { name: '3번 1인 테이블', exact: true }).click({ force: true })
  await page.getByRole('img', { name: '음식 수령대', exact: true }).click({ force: true })
  await page.locator('.service-stage canvas').click({ position: { x: 900, y: 400 }, force: true })
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => Reflect.get(window, 'skewerFeedback').position())).toEqual(start)
  await page.keyboard.down('d'); await page.waitForTimeout(600); await page.keyboard.up('d')
  expect((await page.evaluate(() => Reflect.get(window, 'skewerFeedback').position())).x).toBeGreaterThan(start.x + 2)
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').tableArrival(6))
  await expect(page.locator('[data-table="3"]')).toHaveAttribute('data-status', 'arriving')
  await expect(page.locator('[data-table="3"] .service-bubble')).toHaveCount(0)
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').tableArrival(0))
  await expect(page.locator('[data-table="3"] .service-bubble')).toBeVisible()
  for (const size of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    for (const image of await page.locator('.service-bubble img').all()) expect(await image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    for (const bubble of await page.locator('.service-bubble').all()) expect(await bubble.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await capture(page, `keyboard-bubbles-${size.width}`)
  }
  await verify()
})

for (const role of ['chef', 'server']) test(`${role} 화면은 일시정지·인사·낡은 동료 응답에도 유지되고 종료 안내 뒤 결과로 간다`, async ({ page }) => {
  const verify = health(page)
  await page.goto(`/tests/skewer-coop/fixtures/play-feedback.html?role=${role}`)
  await expect(page).toHaveTitle('꼬치왕 플레이 피드백 검수')
  await expect(page.getByTestId('skewer-coop')).toHaveAttribute('data-role', role)
  const stage = page.locator(role === 'chef' ? '.chef-stage' : '.service-stage')
  await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 45000 })
  if (role === 'chef') await expect(stage).toHaveAttribute('data-park-source', 'stone-pagoda', { timeout: 30000 })
  await expect(page.getByTestId('served-count')).toHaveText('2')
  await stage.locator('canvas').evaluate(el => el.setAttribute('data-view-token', 'same-scene'))
  for (let n = 0; n < 5; n++) await page.evaluate(() => Reflect.get(window, 'skewerFeedback').corrupt())
  await expect(page.getByTestId('skewer-coop')).toHaveAttribute('data-role', role)
  await expect(stage.locator('canvas')).toHaveAttribute('data-view-token', 'same-scene')
  await page.getByRole('button', { name: '일시정지', exact: true }).click()
  const pause = page.getByRole('dialog', { name: '공원으로 나갈까요?', exact: true })
  await expect(pause).toBeVisible()
  await expect(pause.locator('.skewer-exit-mark svg')).toBeVisible()
  await expect(pause.locator('.skewer-exit-mark')).not.toHaveText('Ⅱ')
  await capture(page, `${role}-pause`)
  await pause.getByRole('button', { name: '계속하기', exact: true }).click()
  await expect(pause).not.toBeVisible()
  await expect(stage.locator('canvas')).toHaveAttribute('data-view-token', 'same-scene')
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').clock(9))
  await expect(page.locator('.skewer-business-status')).toHaveAttribute('data-clock-phase', 'critical')
  expect(await page.locator('.skewer-business-status').evaluate(el => getComputedStyle(el).animationName)).toContain('skewer-business-pulse')
  await capture(page, `${role}-expanded-status`)
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').greeting('missed'))
  const missed = page.getByRole('region', { name: '인사 결과', exact: true })
  await expect(missed).toContainText('아쉬워요!')
  await expect(missed.locator('img')).toHaveAttribute('src', '/art/skewer/greeting-missed-v1.webp')
  await expect(missed.locator('img')).toHaveJSProperty('complete', true)
  await capture(page, `${role}-missed-greeting`)
  await expect(missed).not.toBeVisible({ timeout: 3500 })
  await expect(page.getByText('인사 시간이 지났어요. 다음 손님에게 인사해요.', { exact: true })).not.toBeVisible({ timeout: 5000 })
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').greeting('success'))
  await expect(page.getByRole('region', { name: '인사 결과' })).toContainText('보너스 +24점')
  await expect(page.getByRole('region', { name: '인사 결과' })).not.toBeVisible({ timeout: 3500 })
  await expect(page.getByText('인사 완료! +24점', { exact: true })).not.toBeVisible({ timeout: 5000 })
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').finish())
  await expect(page.getByRole('status', { name: '영업 종료 안내' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '공동 경기 결과' })).not.toBeVisible()
  await capture(page, `${role}-business-closing`)
  await expect(page.getByRole('dialog', { name: '공동 경기 결과' })).toBeVisible({ timeout: 4500 })
  await verify()
})

test('확대한 서빙 가게와 공통 상단바는 작은 화면에서도 조작 영역을 가리지 않는다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/tests/skewer-coop/fixtures/play-feedback.html?role=server')
  const stage = page.locator('.service-stage')
  await expect(stage).toHaveAttribute('data-server-model', 'sculpted', { timeout: 45000 })
  for (const [width, height] of [[1440, 900], [1366, 768], [900, 500], [390, 844]]) {
    await page.setViewportSize({ width, height })
    for (const selector of ['.skewer-business-status', '.skewer-game-tools', '.service-held', '.service-carry']) await expect(page.locator(selector)).toBeInViewport()
    const bar = (await page.locator('.skewer-business-status').boundingBox())!
    expect(bar.width).toBeLessThanOrEqual(width)
    expect(bar.height).toBeGreaterThan(40)
    await capture(page, `server-layout-before-${width}x${height}`)
    for (const button of await page.locator('.service-station,.service-fridge').all()) {
      const box = (await button.boundingBox())!
      expect(box.y, `${width}x${height}: ${await button.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(height)
    }
    for (const box of await page.locator('.service-station,.service-fridge').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })))
      expect(Math.max(0, Math.min(box.x + box.width, bar.x + bar.width) - Math.max(box.x, bar.x)) * Math.max(0, Math.min(box.y + box.height, bar.y + bar.height) - Math.max(box.y, bar.y)), JSON.stringify({ width, height, box, bar })).toBe(0)
    const left = (await page.locator('.service-held').boundingBox())!, right = (await page.locator('.service-carry').boundingBox())!
    for (const box of await page.locator('.service-table-target').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }))) {
      for (const panel of [left, right]) expect(Math.max(0, Math.min(box.x + box.width, panel.x + panel.width) - Math.max(box.x, panel.x)) * Math.max(0, Math.min(box.y + box.height, panel.y + panel.height) - Math.max(box.y, panel.y))).toBe(0)
    }
    if (width >= 1100) {
      await expect(page.getByTestId('service-hall')).toHaveAttribute('data-inventory-layout', 'corners')
      expect((await stage.boundingBox())!.height).toBe(height)
    }
    await capture(page, `server-${width}x${height}`)
  }
  await verify()
})

test('VR 미리보기도 서빙 완료 수·공통 상단바·흑백 인사 결과와 석탑 배경을 사용한다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/tests/skewer-coop/fixtures/play-feedback.html?role=chef&mode=vr')
  await expect(page.getByTestId('chef-app')).toHaveAttribute('data-mode', 'vr')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-park-source', 'stone-pagoda', { timeout: 45000 })
  await expect(page.getByTestId('served-count')).toHaveText('2')
  await capture(page, 'chef-vr-shared-status')
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').greeting('missed'))
  await page.waitForTimeout(200)
  await capture(page, 'chef-vr-missed-greeting')
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').finish())
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-business-closing', 'true')
  await capture(page, 'chef-vr-business-closing')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-business-closing', 'false', { timeout: 4000 })
  await verify()
})
test('PC는 숫자로 재료를 선택하고 Space로만 꽂으며 재료 클릭은 반영하지 않는다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/skewer-chef.html?mode=pc')
  await expect(page).toHaveTitle(/꼬치/)
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-ready', 'true')
  await page.keyboard.press('1')
  const selected = await page.locator('.chef-ingredient-hit[aria-pressed=true]').getAttribute('aria-label')
  const other = page.locator('.chef-ingredient-hit[aria-pressed=false]').first()
  await expect(other).toBeDisabled()
  const box = (await other.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator('.chef-ingredient-hit[aria-pressed=true]')).toHaveAttribute('aria-label', selected!)
  await expect(page.getByTestId('chef-app')).toHaveAttribute('data-stack', '')
  await page.keyboard.press('Space')
  const pantry = (await page.locator('.chef-stage').getAttribute('data-pantry'))!.split(',')
  await expect(page.getByTestId('chef-app')).toHaveAttribute('data-stack', pantry[0])
  await capture(page, 'pc-keyboard-only')
  await verify()
})
test('결과 좌우 너비가 같고 보상 안내가 바뀌며 작은 화면에서도 끝까지 읽는다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/tests/skewer-coop/fixtures/result-panel.html')
  await expect(page).toHaveTitle('꼬치왕 결과 화면 검수')
  const dialog = page.getByRole('dialog', { name: '공동 경기 결과' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-settlement]')).toHaveAttribute('data-settlement', 'SETTLED')
  await expect(dialog.locator('[data-reward-coin-source]')).toContainText('123냥')
  await page.getByText('보상 기준 자세히', { exact: true }).click()
  await expect(dialog).not.toContainText('소수점은 버리고')
  await expect(dialog).toContainText('각자 최대 500냥')
  for (const [width, height] of [[1440, 900], [900, 500], [390, 844]]) {
    await page.setViewportSize({ width, height })
    const left = (await page.locator('.coop-team-record').boundingBox())!
    const right = (await page.locator('.coop-personal-reward').boundingBox())!
    expect(Math.abs(left.width - right.width)).toBeLessThanOrEqual(1)
    const close = (await page.getByRole('button', { name: '공원으로 돌아가기', exact: true }).boundingBox())!
    const ranking = (await page.getByRole('button', { name: '팀 랭킹 보기', exact: true }).boundingBox())!
    expect(Math.abs(close.width - ranking.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(close.height - ranking.height)).toBeLessThanOrEqual(1)
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.getByRole('button', { name: '공원으로 돌아가기', exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: '공원으로 돌아가기', exact: true })).toBeInViewport()
    await page.getByText('보상 기준 자세히', { exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByText('보상 기준 자세히', { exact: true })).toBeInViewport()
    await dialog.evaluate(el => { el.scrollTop = 0 })
    await capture(page, `result-${width}x${height}`)
  }
  await verify()
})
