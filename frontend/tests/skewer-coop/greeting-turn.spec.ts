import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

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

async function turnCommand(page: Page, name: string, value?: unknown) {
  return page.evaluate(async ({ name, value }) => {
    const qa = Reflect.get(window, 'greetingTurnQA') as Record<string, (value?: unknown) => unknown>
    return await qa[name](value)
  }, { name, value })
}

async function pauseCommand(page: Page, name: string, value?: unknown) {
  return page.evaluate(async ({ name, value }) => {
    return await (Reflect.get(window, 'vrPauseQA') as Record<string, (value?: unknown) => unknown>)[name](value)
  }, { name, value })
}
async function enterKitchenVR(page: Page) {
  await page.goto('/tests/skewer-coop/fixtures/vr-pause.html')
  await page.getByRole('button', { name: 'VR로 요리하기', exact: true }).click()
  await capture(page, 'chef-vr-ready')
  await page.getByRole('button', { name: '준비 완료', exact: true }).scrollIntoViewIfNeeded()
  await capture(page, 'chef-vr-ready-controls')
  await page.getByRole('button', { name: '헤드셋 연결하기', exact: true }).click()
  await page.getByRole('button', { name: 'VR 시작', exact: true }).click()
  await expect.poll(() => pauseCommand(page, 'snapshot')).toMatchObject({ requested: 1, rendererAttached: true, protected: true })
  await expect.poll(async () => (await pauseCommand(page, 'snapshot') as { frames: number }).frames).toBeGreaterThan(1)
  await pauseCommand(page, 'start')
  await expect(page.getByTestId('skewer-coop')).toHaveAttribute('data-phase', 'PLAYING')
}

test('VR 오른손 B 일시정지·계속하기는 헤드셋 안에서 작동하고 DOM 모달을 열지 않는다', async ({ page }) => {
  const verify = health(page)
  await enterKitchenVR(page)
  await pauseCommand(page, 'hold', true)
  await pauseCommand(page, 'b', true)
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-pause-open', 'true')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-pause-busy', 'true')
  await pauseCommand(page, 'select', 'resume'); await pauseCommand(page, 'select', 'leave')
  await page.keyboard.press('Space')
  expect(await pauseCommand(page, 'snapshot')).toMatchObject({ calls: ['CHEF_MODE', 'PAUSE:true'], modalCalls: 0 })
  await pauseCommand(page, 'release')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-pause-busy', 'false')
  await capture(page, 'vr-pause-confirmed')
  await pauseCommand(page, 'b', false)
  await page.waitForTimeout(100)
  await pauseCommand(page, 'b', true)
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-pause-open', 'false')
  expect(await pauseCommand(page, 'snapshot')).toMatchObject({ calls: ['CHEF_MODE', 'PAUSE:true', 'PAUSE:false'], paused: false, modalCalls: 0 })
  await verify()
})

test('VR 트리거로 일시정지 실패를 재시도하고 계속하기·나가기를 선택한다', async ({ page }) => {
  const verify = health(page)
  await enterKitchenVR(page)
  await pauseCommand(page, 'select', 'guide')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-vr-guide', 'true')
  await page.waitForTimeout(100) // 합성 XR 카메라로 안내 패널을 렌더한 뒤 캡처한다.
  await capture(page, 'chef-vr-controller-guide')
  await pauseCommand(page, 'select', 'closeGuide')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-vr-guide', 'false')
  await pauseCommand(page, 'fail')
  expect(await pauseCommand(page, 'select', 'pause')).toMatchObject({ pick: { action: 'pause' } })
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-pause-open', 'true')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-pause-busy', 'false')
  expect(await pauseCommand(page, 'snapshot')).toMatchObject({ paused: false, modalCalls: 0 })
  await capture(page, 'vr-pause-retry')
  await pauseCommand(page, 'select', 'pauseRetry')
  await expect.poll(() => pauseCommand(page, 'snapshot')).toMatchObject({ paused: true })
  await pauseCommand(page, 'fail')
  await pauseCommand(page, 'select', 'resume')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-pause-open', 'true')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-pause-busy', 'false')
  expect(await pauseCommand(page, 'snapshot')).toMatchObject({ paused: true })
  await pauseCommand(page, 'select', 'resume')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-pause-open', 'false')
  await pauseCommand(page, 'select', 'pause')
  await expect.poll(() => pauseCommand(page, 'snapshot')).toMatchObject({ paused: true })
  await pauseCommand(page, 'select', 'leave')
  await expect(page.getByRole('status', { name: '', exact: true })).toContainText('공원으로 돌아왔어요')
  const snapshot = await pauseCommand(page, 'snapshot') as { calls: string[]; protectionReleased: number; modalCalls: number }
  expect(snapshot.calls.filter(call => call === 'FORFEIT')).toHaveLength(1)
  expect(snapshot.calls.filter(call => call === 'LEAVE')).toHaveLength(1)
  expect(snapshot.protectionReleased).toBe(1)
  expect(snapshot.modalCalls).toBe(0)
  await verify()
})

test('VR 실제 몸 회전만 인사로 인정하고 좌우 한 바퀴를 한 번씩 전송한다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/tests/skewer-coop/fixtures/greeting-turn.html')
  await expect(page).toHaveTitle('꼬치왕 VR 한 바퀴 인사 검수')
  await expect(page.locator('#host')).toHaveAttribute('data-fixture-ready', 'true')
  await turnCommand(page, 'select')
  expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: 0, progress: 0 })
  await turnCommand(page, 'enter')
  await turnCommand(page, 'select')
  await turnCommand(page, 'virtualTurn')
  expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: 0, progress: 0 })
  await turnCommand(page, 'turn', 180)
  expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: 0, progress: 50, followsHead: true, panelYaw: 0 })
  await page.waitForTimeout(1000) // 인사 원본 이미지 로딩은 회전 판정과 별개다.
  await capture(page, 'vr-greeting-half-turn')
  await turnCommand(page, 'turn', -180)
  expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: 0, progress: 0 })
  await turnCommand(page, 'turn', 360)
  expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: 1, progress: 100 })
  await turnCommand(page, 'turn', 360)
  expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: 1 })
  await turnCommand(page, 'acknowledge')
  await capture(page, 'vr-greeting-answered')
  await turnCommand(page, 'start', 1)
  await turnCommand(page, 'turn', -360)
  expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: 2, progress: 100 })
  await verify()
})

test('VR 인사 회전은 추적·가이드·일시정지·재중심·종료 경계에서 잘못 완료되지 않는다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/tests/skewer-coop/fixtures/greeting-turn.html')
  await expect(page.locator('#host')).toHaveAttribute('data-fixture-ready', 'true')
  await turnCommand(page, 'enter')
  for (const method of ['paused', 'blocked', 'guide', 'tracked', 'visibility']) {
    await turnCommand(page, 'turn', 180)
    expect(await turnCommand(page, 'snapshot')).toMatchObject({ progress: 50, count: 0 })
    const off = method === 'tracked' ? false : method === 'visibility' ? 'hidden' : true
    const on = method === 'tracked' ? true : method === 'visibility' ? 'visible' : false
    await turnCommand(page, method, off)
    await turnCommand(page, 'turn', 360)
    expect(await turnCommand(page, 'snapshot')).toMatchObject({ progress: 0, count: 0 })
    await turnCommand(page, method, on)
    await turnCommand(page, 'turn', 180)
    await turnCommand(page, 'recenter')
    expect(await turnCommand(page, 'snapshot')).toMatchObject({ progress: 0, count: 0 })
  }
  await turnCommand(page, 'turn', 360)
  await turnCommand(page, 'recenter')
  await turnCommand(page, 'turn', 360)
  expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: 1 })
  await turnCommand(page, 'start', 1)
  await turnCommand(page, 'turn', 180)
  await turnCommand(page, 'finish')
  await turnCommand(page, 'turn', 360)
  expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: 1, progress: 0 })
  await turnCommand(page, 'end')
  expect(await turnCommand(page, 'snapshot')).toMatchObject({ followsHead: false })
  await turnCommand(page, 'enter')
  await turnCommand(page, 'start', 2)
  await turnCommand(page, 'turn', -360)
  expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: 2 })
  await turnCommand(page, 'dispose')
  await verify()
})

test('VR 요리사의 G 키 우회는 막고 PC 요리사·서빙의 G 키 인사는 유지한다', async ({ page }) => {
  const verify = health(page)
  for (const mode of ['vr', 'pc', 'server']) {
    await page.goto(`/tests/skewer-coop/fixtures/play-feedback.html?role=${mode === 'server' ? 'server' : 'chef'}&prepare=1`)
    if (mode !== 'server') await page.getByRole('button', { name: `${mode.toUpperCase()}로 요리하기`, exact: true }).click()
    await page.evaluate(() => Reflect.get(window, 'skewerFeedback').playGreeting())
    await expect(page.getByTestId('skewer-coop')).toHaveAttribute('data-phase', 'PLAYING')
    await page.keyboard.press('g')
    if (mode === 'vr') {
      await expect(page.locator('.chef-stage')).toHaveAttribute('data-greeting-input', 'physical-turn')
      expect(await page.evaluate(() => Reflect.get(window, 'skewerFeedback').greetings())).toBe(0)
    } else await expect.poll(() => page.evaluate(() => Reflect.get(window, 'skewerFeedback').greetings())).toBe(1)
  }
  await verify()
})
