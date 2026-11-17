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
async function enterKitchenVR(page: Page, start = true) {
  await page.goto('/tests/skewer-coop/fixtures/vr-pause.html')
  await page.getByRole('button', { name: 'VR로 요리하기', exact: true }).click()
  await capture(page, 'chef-vr-ready')
  await page.getByRole('button', { name: '준비 완료', exact: true }).scrollIntoViewIfNeeded()
  await capture(page, 'chef-vr-ready-controls')
  await page.getByRole('button', { name: '헤드셋 연결하기', exact: true }).click()
  await expect.poll(() => pauseCommand(page, 'snapshot')).toMatchObject({ requested: 1, rendererAttached: true, protected: true })
  await expect.poll(async () => (await pauseCommand(page, 'snapshot') as { frames: number }).frames).toBeGreaterThan(1)
  if (start) {
    await pauseCommand(page, 'start')
    await expect(page.getByTestId('skewer-coop')).toHaveAttribute('data-phase', 'PLAYING')
  }
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
  expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: 0, progress: 50 })
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

test('VR 인사는 양쪽 모두 방향을 바꾼 지점부터 360도를 돌아 한 번만 전송한다', async ({ page }) => {
  const verify = health(page)
  await page.goto('/tests/skewer-coop/fixtures/greeting-turn.html')
  await expect(page.locator('#host')).toHaveAttribute('data-fixture-ready', 'true')
  await turnCommand(page, 'enter')
  for (const [index, direction] of [1, -1].entries()) {
    await turnCommand(page, 'start', index)
    await turnCommand(page, 'turn', direction * 270)
    expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: index, progress: 75 })
    await turnCommand(page, 'turn', -direction * 180)
    expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: index, progress: 50 })
    await turnCommand(page, 'turn', -direction * 180)
    expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: index + 1, progress: 100 })
    await turnCommand(page, 'turn', -direction * 360)
    expect(await turnCommand(page, 'snapshot')).toMatchObject({ count: index + 1 })
  }
  await capture(page, 'vr-greeting-direction-reversal')
  await verify()
})

test('상위 exit 입력은 준비·영업·일시정지·연결 차단에서 무시하고 종료 후 복귀만 허용한다', async ({ page }) => {
  const verify = health(page)
  await enterKitchenVR(page, false)
  for (const phase of ['WAITING', 'COUNTDOWN', 'PLAYING']) {
    await pauseCommand(page, 'phase', phase)
    await expect(page.getByTestId('skewer-coop')).toHaveAttribute('data-phase', phase)
    const before = await pauseCommand(page, 'snapshot') as { calls: string[] }
    await pauseCommand(page, 'dispatch', { type: 'exit' })
    expect((await pauseCommand(page, 'snapshot') as { calls: string[] }).calls).toEqual(before.calls)
  }
  await pauseCommand(page, 'select', 'pause')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-pause-open', 'true')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-pause-busy', 'false')
  const paused = await pauseCommand(page, 'snapshot') as { calls: string[] }
  await pauseCommand(page, 'dispatch', { type: 'exit' })
  expect((await pauseCommand(page, 'snapshot') as { calls: string[] }).calls).toEqual(paused.calls)
  await pauseCommand(page, 'select', 'resume')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-pause-open', 'false')
  await pauseCommand(page, 'friend', false)
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-runtime-notice', 'connection')
  const disconnected = await pauseCommand(page, 'snapshot') as { calls: string[] }
  await pauseCommand(page, 'dispatch', { type: 'exit' })
  expect((await pauseCommand(page, 'snapshot') as { calls: string[] }).calls).toEqual(disconnected.calls)
  await pauseCommand(page, 'friend', true)
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-runtime-notice', '')
  await pauseCommand(page, 'finish')
  await expect(page.getByTestId('skewer-coop')).toHaveAttribute('data-phase', 'FINISHED')
  await capture(page, 'vr-finished-before-exit')
  await pauseCommand(page, 'dispatch', { type: 'exit' })
  await expect(page.getByRole('status')).toContainText('공원으로 돌아왔어요')
  const finished = await pauseCommand(page, 'snapshot') as { calls: string[] }
  expect(finished.calls.filter(call => call === 'LEAVE')).toHaveLength(1)
  expect(finished.calls).not.toContain('FORFEIT')
  await verify()
})

test('VR 인사는 실제 한 바퀴 이후 실패한 전송만 트리거로 재시도하며 중복 누름은 한 번 처리한다', async ({ page }) => {
  const verify = health(page)
  await enterKitchenVR(page)
  await pauseCommand(page, 'greeting')
  await pauseCommand(page, 'select', 'coop')
  expect((await pauseCommand(page, 'snapshot') as { calls: string[] }).calls).not.toContain('GREET')
  await pauseCommand(page, 'failGreeting')
  await pauseCommand(page, 'turn', 360)
  const stage = page.locator('.chef-stage')
  await expect(stage).toHaveAttribute('data-greeting-turn', '100')
  await expect(stage).toHaveAttribute('data-greeting-delivery', 'retry')
  await expect(stage).toHaveAttribute('data-runtime-notice', '') // 카드의 재시도 버튼을 다른 오류 패널로 가리지 않는다.
  await capture(page, 'vr-greeting-retry')
  await pauseCommand(page, 'hold', true)
  await pauseCommand(page, 'select', 'coop')
  await expect(stage).toHaveAttribute('data-greeting-delivery', 'pending')
  await pauseCommand(page, 'select', 'coop')
  expect((await pauseCommand(page, 'snapshot') as { calls: string[] }).calls.filter(call => call === 'GREET')).toHaveLength(2)
  await pauseCommand(page, 'release')
  await expect(stage).toHaveAttribute('data-greeting-delivery', 'confirmed')
  await capture(page, 'vr-greeting-retry-confirmed')
  await pauseCommand(page, 'select', 'coop')
  expect((await pauseCommand(page, 'snapshot') as { calls: string[] }).calls.filter(call => call === 'GREET')).toHaveLength(2)
  await verify()
})

test('VR 인사의 응답만 유실됐으면 재시도에서 서버 확인만 하고 GREET를 다시 보내지 않는다', async ({ page }) => {
  const verify = health(page)
  await enterKitchenVR(page)
  await pauseCommand(page, 'greeting')
  await pauseCommand(page, 'loseGreetingReply')
  await pauseCommand(page, 'turn', -360)
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-greeting-delivery', 'retry')
  await pauseCommand(page, 'select', 'coop')
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-greeting-delivery', 'confirmed')
  expect((await pauseCommand(page, 'snapshot') as { calls: string[] }).calls.filter(call => call === 'GREET')).toHaveLength(1)
  await verify()
})

test('VR 요리 오류와 친구·내 연결 안내는 헤드셋 안에 표시되고 복구 후 사라진다', async ({ page }) => {
  const verify = health(page)
  await enterKitchenVR(page)
  const stage = page.locator('.chef-stage')
  await pauseCommand(page, 'failCooking')
  await page.locator('.chef-stage canvas').focus()
  await page.keyboard.press('Space')
  await expect(stage).toHaveAttribute('data-runtime-notice', 'error')
  await expect(stage).toHaveAttribute('data-runtime-message', /주문표를 다시 확인해 주세요/)
  await capture(page, 'vr-cooking-error')
  await pauseCommand(page, 'friend', false)
  await expect(stage).toHaveAttribute('data-runtime-notice', 'connection')
  await expect(stage).toHaveAttribute('data-runtime-message', /친구와 다시 연결.*영업 시간이 멈췄어요/)
  const before = (await pauseCommand(page, 'snapshot') as { calls: string[] }).calls.length
  await page.keyboard.press('Space')
  await pauseCommand(page, 'select', 'submit')
  expect((await pauseCommand(page, 'snapshot') as { calls: string[] }).calls).toHaveLength(before)
  await capture(page, 'vr-friend-disconnected')
  await pauseCommand(page, 'friend', true)
  await expect(stage).toHaveAttribute('data-runtime-notice', 'error')
  await page.keyboard.press('Space')
  await expect(stage).toHaveAttribute('data-runtime-notice', '')
  await pauseCommand(page, 'connection', false)
  await expect(stage).toHaveAttribute('data-runtime-message', /서버와 다시 연결.*연결 상태를 확인/)
  await pauseCommand(page, 'connection', true)
  await expect(stage).toHaveAttribute('data-runtime-notice', '')
  expect(await pauseCommand(page, 'snapshot')).toMatchObject({ modalCalls: 0, protected: true })
  await verify()
})

test('VR 일시정지 메뉴 안에서도 친구 연결 끊김 안내를 확인하고 복구 후 재개한다', async ({ page }) => {
  const verify = health(page)
  await enterKitchenVR(page)
  await pauseCommand(page, 'b', true)
  const stage = page.locator('.chef-stage')
  await expect(stage).toHaveAttribute('data-pause-open', 'true')
  await expect(stage).toHaveAttribute('data-pause-busy', 'false')
  await pauseCommand(page, 'friend', false)
  await expect(stage).toHaveAttribute('data-runtime-message', /친구와 다시 연결/)
  await capture(page, 'vr-pause-friend-disconnected')
  await pauseCommand(page, 'friend', true)
  await expect(stage).toHaveAttribute('data-runtime-notice', '')
  expect(await pauseCommand(page, 'snapshot')).toMatchObject({ paused: true })
  await pauseCommand(page, 'select', 'resume')
  await expect(stage).toHaveAttribute('data-pause-open', 'false')
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
