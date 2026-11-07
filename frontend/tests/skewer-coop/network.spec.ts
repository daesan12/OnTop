import { test, expect, type Browser, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const evidence = process.env.SKEWER_COOP_EVIDENCE
const latest = new WeakMap<Page, any>()
const actions = new WeakMap<Page, unknown[]>()
test.beforeAll(async ({ request }) => {
  await expect.poll(async () => {
    try { return (await request.get('http://127.0.0.1:19185/actuator/health')).ok() } catch { return false }
  }, { timeout: 60000 }).toBe(true)
})
async function capture(page: Page, name: string) { if (evidence && !page.isClosed()) { await mkdir(evidence, { recursive: true }); await page.screenshot({ path: path.join(evidence, name + '.png') }) } }
async function login(browser: Browser, role: 'red' | 'green', fresh = true) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await context.newPage()
  const errors: string[] = []
  actions.set(page, [])
  page.on('pageerror', error => errors.push(error.message))
  page.on('websocket', socket => { socket.on('framesent', event => { try { const m = JSON.parse(String(event.payload)); if (m.type === 'GAME_ACTION_SEND' && m.payload.input.type !== 'MOVE') actions.get(page)!.push(m.payload.input) } catch {} }); socket.on('framereceived', event => {
    try {
      const m = JSON.parse(String(event.payload))
      if (m.type === 'ERROR') actions.get(page)!.push({ code: m.payload.code })
      if (m.type === 'GAME_STATE' && m.payload.publicState?.gameCode === 'SKEWER_COOP') latest.set(page, m.payload)
      if (m.type === 'GAME_CONNECTION_STATE' && m.payload.state?.publicState?.gameCode === 'SKEWER_COOP') latest.set(page, { ...m.payload.state, gameId: m.payload.gameId, version: m.payload.version })
    } catch { /* 바이너리 ping 등은 게임 상태가 아니다. */ }
  }) })
  const response = await page.request.post('http://127.0.0.1:19185/dev/alkkagi-park/session', { data: { role } })
  expect(response.ok()).toBe(true)
  const code = (await response.json()).exchangeCode
  await page.goto('/auth/callback#exchange_code=' + code)
  console.info('[coop] 로그인 후 채널 선택:', role, fresh)
  const channel = page.getByRole('button', { name: /^연동 테스트 A/ })
  // 최신 공원은 로그인 후 이전/기본 채널에 바로 연결될 수도 있다.
  await expect.poll(async () => await channel.isVisible() || await page.evaluate(async () => {
    const url = '/src/network/worldClient.ts', world = await import(/* @vite-ignore */ url)
    return world.useSession.getState().status === 'connected'
  }), { timeout: 60000 }).toBe(true)
  if (await channel.isVisible()) await channel.click()
  else {
    await page.getByRole('button', { name: '현재 공원과 접속 인원', exact: true }).click()
    await page.getByRole('region', { name: '채널 선택', exact: true }).getByRole('button', { name: /^연동 테스트 A/ }).click()
  }
  await expect.poll(() => page.evaluate(async () => {
    const url = '/src/network/worldClient.ts', m = await import(/* @vite-ignore */ url)
    const state = m.useSession.getState()
    return { status: state.status, room: state.roomId, map: state.mapCompatible }
  }), { timeout: 60000 }).toMatchObject({ status: 'connected', room: 'channel-1', map: true })
  const placed = await page.evaluate(async () => {
    const url = '/src/auth/authFlow.ts', m = await import(/* @vite-ignore */ url)
    return (await fetch('/local/skewer/entrance', { method: 'POST', headers: { Authorization: 'Bearer ' + m.getAuthSession().accessToken } })).status
  })
  expect(placed).toBe(200)
  let inputStable = 0
  await expect.poll(async () => {
    const ready = await page.evaluate(async () => {
    const url = '/src/features/vrZone/parkBridge.ts', bridge = await import(/* @vite-ignore */ url)
    const worldUrl = '/src/network/worldClient.ts', world = await import(/* @vite-ignore */ worldUrl)
    const gameUrl = '/src/game/store.ts', game = await import(/* @vite-ignore */ gameUrl)
    const inputUrl = '/src/world/inputOwnership.ts', input = await import(/* @vite-ignore */ inputUrl)
    const s = world.useSession.getState(), avatar = world.avatars.get(s.sessionId)
    return !!avatar && !s.pending && !game.tableBusy() && !input.panelOwnsKeys() && bridge.canReachParkVr(avatar.current)
    })
    inputStable = ready ? inputStable + 1 : 0
    return inputStable
  }, { timeout: 15000, intervals: [150] }).toBeGreaterThanOrEqual(2)
  await page.keyboard.press('e')
  try { await expect(page.getByTestId('skewer-coop')).toBeVisible({ timeout: 10000 }) }
  catch (error) {
    await capture(page, 'coop-entry-failure-' + role)
    console.info('[coop] 진입 상태:', await page.evaluate(async () => { const url = '/src/network/worldClient.ts', m = await import(/* @vite-ignore */ url); const g = '/src/game/store.ts', game = await import(/* @vite-ignore */ g); const s = m.useSession.getState(); return { status: s.status, pending: s.pending, channel: s.roomId, recovery: game.useGame.getState().recovery } }))
    throw error
  }
  console.info('[coop] 공원 입장과 VR 존 진입 완료:', role)
  await page.waitForTimeout(1100)
  if (fresh && await page.getByTestId('skewer-coop').getAttribute('data-phase') === 'WAITING') {
    await page.getByRole('button', { name: '방 나가기 · 다른 방 선택', exact: true }).click()
    await page.getByRole('button', { name: '← 처음으로', exact: true }).click()
  }
  if (fresh && await page.getByTestId('skewer-coop').getAttribute('data-phase') !== 'ROOMS') {
    if (['PLAYING', 'COUNTDOWN'].includes(await page.getByTestId('skewer-coop').getAttribute('data-phase') ?? '')) {
      await page.keyboard.press('Escape')
      await page.getByRole('dialog', { name: '공원으로 나갈까요?' }).getByRole('button', { name: '나가기', exact: true }).click()
    } else await page.getByRole('button', { name: /공원으로 (나가기|돌아가기)/ }).click()
    await expect(page.getByTestId('skewer-coop')).not.toBeVisible()
    await page.keyboard.press('e')
    await expect(page.getByRole('dialog', { name: '온탑 꼬치왕', exact: true })).toBeVisible()
  }
  return { context, page, errors }
}
async function createRoom(page: Page) {
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
}
async function joinRoom(page: Page) {
  await page.getByRole('button', { name: '참가하기', exact: true }).click()
  await page.locator('.coop-room-cards').getByRole('button', { name: /참가하기/ }).click()
}
async function walk(page: Page, name: string, action: RegExp) {
  await page.getByRole('button', { name, exact: true }).click()
  await expect(page.locator('.service-action')).toHaveAccessibleName(action, { timeout: 20000 })
  let last = '', stable = 0
  await expect.poll(() => {
    const position = JSON.stringify(latest.get(page)?.privateState.hall.position)
    stable = position === last ? stable + 1 : 0; last = position
    return stable
  }, { timeout: 20000, intervals: [200] }).toBeGreaterThanOrEqual(2)
}
test('독립 로그인 두 명이 최신 공원에서 만나 무료 방·역할·실제 주문·제작·반납·서빙·재접속을 공유한다', async ({ browser }) => {
  const first = await login(browser, 'red'), second = await login(browser, 'green')
  const server = first.page, chef = second.page
  console.info('[coop] 두 계정 준비')
  try {
    await createRoom(server)
    await joinRoom(chef)
    console.info('[coop] 동일 방 입장')
    await expect(server.getByRole('region', { name: '역할 선택과 준비' })).toBeVisible()
    await server.getByRole('button', { name: '서빙 담당', exact: true }).click()
    await chef.getByRole('button', { name: '요리사', exact: true }).click()
    await chef.getByRole('button', { name: 'PC로 요리하기', exact: true }).click()
    await expect(chef.getByRole('img', { name: /주문 그림/ })).toHaveCount(0)
    await expect(chef.getByRole('heading', { name: 'PC 요리사 준비하기', exact: true })).toBeVisible()
    await capture(server, 'coop-server-ready'); await capture(chef, 'coop-chef-ready')
    await server.getByRole('button', { name: '준비 완료', exact: true }).click()
    await chef.getByRole('button', { name: '준비 완료', exact: true }).click()
    await expect(server.locator('[data-testid="skewer-coop"]')).toHaveAttribute('data-phase', 'COUNTDOWN')
    await expect(chef.locator('[data-testid="skewer-coop"]')).toHaveAttribute('data-phase', 'PLAYING', { timeout: 10000 })
    await expect(server.locator('[data-table="1"]')).toHaveAttribute('data-status', 'unreceived', { timeout: 10000 })
    expect(latest.get(chef).privateState.chef.visible).toEqual([])
    expect(JSON.stringify(latest.get(chef))).not.toContain('"recipe"')
    await expect(chef.locator('.chef-stage')).toHaveAttribute('data-park-source', 'current-park-geometry', { timeout: 30000 })
    await chef.locator('.chef-stage canvas').evaluate(el => el.setAttribute('data-session-view', 'chef-through-gameplay'))
    // 실제 서버 스냅샷을 표시하는 프레임에서 전진 중 뒤로 보정/반전되는지 확인한다.
    await server.evaluate(async () => {
      const url = '/src/features/skewer/serviceHall/rendering/HallMotion.ts'
      const { HallMotion } = await import(/* @vite-ignore */ url)
      const update = HallMotion.prototype.update
      const samples: { x: number; yaw: number; moving: boolean }[] = []
      HallMotion.prototype.update = function (...args: unknown[]) {
        update.apply(this, args)
        samples.push({ x: this.position.x, yaw: this.yaw, moving: this.moving })
      }
      Reflect.set(window, 'skewerMotionSamples', samples)
      Reflect.set(window, 'stopSkewerMotionCapture', () => { HallMotion.prototype.update = update })
    })
    await server.keyboard.down('d'); await server.waitForTimeout(900); await server.keyboard.up('d')
    const motion = await server.evaluate(() => {
      return Reflect.get(window, 'skewerMotionSamples') as { x: number; yaw: number }[]
    })
    expect(motion.length).toBeGreaterThan(10)
    console.info('[coop] 전진 프레임:', motion.length, '이동 거리:', motion.at(-1)!.x - motion[0].x)
    expect(motion.at(-1)!.x - motion[0].x).toBeGreaterThan(1)
    for (let frame = 1; frame < motion.length; frame++) {
      expect(motion[frame].x).toBeGreaterThanOrEqual(motion[frame - 1].x - .000001)
      if (motion[frame].x - motion[frame - 1].x > .005) expect(Math.sin(motion[frame].yaw)).toBeGreaterThanOrEqual(0)
    }
    await capture(server, 'coop-forward-motion')
    await server.evaluate(() => { Reflect.get(window, 'skewerMotionSamples').length = 0 })
    await server.keyboard.down('a'); await server.waitForTimeout(650); await server.keyboard.up('a')
    await server.waitForTimeout(450)
    const reversed = await server.evaluate(() => {
      Reflect.get(window, 'stopSkewerMotionCapture')()
      return Reflect.get(window, 'skewerMotionSamples') as { x: number; yaw: number; moving: boolean }[]
    })
    expect(reversed[0].x - reversed.at(-1)!.x).toBeGreaterThan(.7)
    expect(Math.sin(reversed.at(-1)!.yaw)).toBeLessThan(-.99)
    expect(reversed.at(-1)!.moving).toBe(false)
    expect(Math.abs(reversed.at(-1)!.x - latest.get(server).privateState.hall.position.x)).toBeLessThan(.03)
    await capture(server, 'coop-reverse-stop-motion')
    await walk(server, '1번 1인 테이블로 이동', /E 1번 주문 받기/)
    await server.keyboard.press('e')
    await expect(server.locator('[data-table="1"]')).toHaveAttribute('data-status', 'collected')
    expect(latest.get(chef).privateState.chef.visible).toEqual([])
    await walk(server, '주문 전달대로 이동', /E 주문표 전달/)
    await server.locator('.service-action').click()
    await expect(chef.locator('.chef-world-order-hit')).toHaveCount(1, { timeout: 12000 })
    const job = latest.get(chef).privateState.chef.visible[0]
    expect(job.table).toBe(1)
    for (let index = 0; index < job.recipe.length; index++) {
      const ingredient = ['tomato', 'pepper', 'shrimp', 'beef', 'cheese', 'bacon'].indexOf(job.recipe[index])
      const key = (await chef.locator('.chef-ingredient-hit').nth(ingredient).getAttribute('aria-label'))!.split(' ')[0]
      await chef.keyboard.press(key)
      await chef.keyboard.press('Space')
      await expect(chef.locator('[data-testid="chef-app"]')).toHaveAttribute('data-stack', job.recipe.slice(0, index + 1).join(','))
    }
    await chef.keyboard.press('r')
    console.info('[coop] 요리사 제출')
    await expect(chef.getByTestId('cooking-completed')).toHaveText('1개')
    await expect.poll(() => latest.get(chef).privateState.chef.pass.length).toBe(1)
    await expect(server.getByRole('button', { name: '음식 수령대로 이동', exact: true })).toContainText('1')
    await capture(chef, 'coop-chef-submitted')
    await walk(server, '음식 수령대로 이동', /E 완성 접시 받기/)
    await server.keyboard.press('e')
    await expect(server.getByRole('img', { name: '1번 운반 접시', exact: true })).toHaveCount(1)
    await walk(server, '꼬치 임시 보관대로 이동', /E 꼬치 1접시 맡기기/)
    await server.keyboard.press('e')
    await expect(server.locator('.service-stage')).toHaveAttribute('data-stored-count', '1')
    await server.keyboard.press('e')
    const picker = server.getByRole('dialog', { name: '보관한 꼬치 선택' })
    await expect(picker).toBeVisible()
    await picker.getByRole('button', { name: '1번 보관 접시 1 받기', exact: true }).click()
    await expect(server.getByRole('img', { name: '1번 운반 접시', exact: true })).toHaveCount(1)
    const sake = latest.get(server).privateState.hall.tables[0].bill.sake
    await walk(server, '사케 냉장고로 이동', /E 사케 꺼내기/)
    await server.keyboard.press('e')
    await expect(server.locator('.service-bottle-slots .is-full')).toHaveCount(1)
    await server.keyboard.press('r')
    await expect(server.locator('.service-bottle-slots .is-full')).toHaveCount(0)
    if (sake) { await server.keyboard.press('e'); await expect(server.locator('.service-bottle-slots .is-full')).toHaveCount(1) }
    await walk(server, '1번 1인 테이블로 이동', /E 1번 음식 전달/)
    console.info('[coop] 서빙 직전:', JSON.stringify({ position: latest.get(server).privateState.hall.position, carry: latest.get(server).privateState.hall.carry.map((dish: any) => dish.id), sake: latest.get(server).privateState.hall.sake }))
    await server.keyboard.press('e')
    await expect(server.locator('[data-table="1"]')).toHaveAttribute('data-status', 'eating', { timeout: 10000 })
    await expect.poll(() => latest.get(chef).publicState.score).toBeGreaterThan(0)
    expect(latest.get(server).publicState.score).toBe(latest.get(chef).publicState.score)
    expect(latest.get(chef).publicState.rankingEligible).toBe(true)
    await capture(server, 'coop-server-served')
    const greeting = server.getByRole('region', { name: '함께 인사하기', exact: true })
    await expect(greeting).toBeVisible({ timeout: 90000 })
    const businessTime = latest.get(server).publicState.remaining, scoreBeforeGreeting = latest.get(server).publicState.score
    await greeting.getByRole('button', { name: '함께 인사하기', exact: true }).click()
    await expect(greeting.getByRole('button')).toBeDisabled()
    await expect.poll(() => latest.get(server).publicState.remaining, { timeout: 2000 }).toBeLessThan(businessTime)
    await capture(server, 'coop-greeting')
    await chef.keyboard.press('g')
    await expect(greeting).not.toBeVisible({ timeout: 8000 })
    await expect.poll(() => latest.get(chef).publicState.score).toBeGreaterThan(scoreBeforeGreeting)
    await expect(chef.getByTestId('skewer-coop')).toHaveAttribute('data-role', 'chef')
    await expect(chef.locator('.chef-stage canvas')).toHaveAttribute('data-session-view', 'chef-through-gameplay')
    await expect(server.getByRole('region', { name: '인사 결과' })).toContainText('보너스 +')
    await expect(server.getByRole('region', { name: '인사 결과' })).not.toBeVisible({ timeout: 4000 })
    await second.context.close()
    console.info('[coop] 친구 연결 끊기')
    await expect(server.getByText('친구와 다시 연결하고 있어요', { exact: true })).toBeVisible({ timeout: 12000 })
    const paused = latest.get(server).publicState.remaining
    await server.waitForTimeout(1600)
    expect(latest.get(server).publicState.remaining).toBe(paused)
    await capture(server, 'coop-shared-pause')
    const returned = await login(browser, 'green', false)
    try {
      await expect(returned.page.locator('[data-testid="chef-app"]')).toBeVisible({ timeout: 15000 })
      await expect(server.getByText('친구와 다시 연결하고 있어요', { exact: true })).not.toBeVisible({ timeout: 12000 })
      expect(latest.get(returned.page).gameId).toBe(latest.get(server).gameId)
      await server.keyboard.press('Escape')
      await expect(returned.page.getByText('친구가 잠시 쉬고 있어요', { exact: true })).toBeVisible()
      const beforeExit = latest.get(server).publicState.remaining
      await server.waitForTimeout(1200)
      expect(latest.get(server).publicState.remaining).toBe(beforeExit)
      await server.getByRole('dialog', { name: '공원으로 나갈까요?' }).getByRole('button', { name: '나가기', exact: true }).click()
      await expect(returned.page.getByRole('dialog', { name: '공동 경기 결과' })).toBeVisible({ timeout: 12000 })
      await capture(returned.page, 'coop-team-result')
      const previousId = latest.get(server).gameId
      await returned.page.getByRole('button', { name: '공원으로 돌아가기', exact: true }).click()
      await expect(returned.page.getByTestId('skewer-coop')).not.toBeVisible()
      await expect(server.getByTestId('skewer-coop')).not.toBeVisible()
      await server.keyboard.press('e')
      await createRoom(server)
      await returned.page.keyboard.press('e')
      await joinRoom(returned.page)
      await expect.poll(() => latest.get(server).gameId).not.toBe(previousId)
      await expect(server.getByRole('button', { name: '요리사', exact: true })).toBeVisible()
      await server.getByRole('button', { name: '방 나가기 · 다른 방 선택', exact: true }).click()
      await expect(returned.page.getByRole('dialog', { name: '어느 가게에 함께할까요?' })).toBeVisible()
      await expect(returned.page.getByRole('dialog', { name: '공동 경기 결과' })).not.toBeVisible()
      expect(returned.errors).toEqual([])
    } finally { await returned.context.close() }
    expect(first.errors).toEqual([]); expect(second.errors).toEqual([])
  } catch (error) {
    await capture(server, 'coop-failure-server'); await capture(chef, 'coop-failure-chef')
    console.info('[coop] 실패 시 입력·위치:', JSON.stringify({ actions: actions.get(server), position: latest.get(server)?.privateState.hall?.position, phase: latest.get(server)?.publicState.phase, version: latest.get(server)?.version }))
    throw error
  } finally { await first.context.close(); await second.context.close() }
})
