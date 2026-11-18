import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { parkFixture } from './fixture'
import { ChefPreview } from '../../src/features/skewer/chef/model'
import type { CoopSnapshot } from '../../src/features/skewer/coop/contracts'

const xr = '/tests/park-xr/syntheticXR.ts'
const state = (page: Page) => page.evaluate(async p => (await import(p)).snapshot(), xr)
async function enter(page: Page) {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(`${m.location().url} ${m.text()}`.trim()) })
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const server = await parkFixture(page, { carrySupported: true })
  await page.route('**/api/v1/operations/status', r => r.fulfill({ json: { mode: 'NORMAL', notice: '', version: 1,
    updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(), maintenanceStartedAt: null, expectedOpenAt: null } }))
  await page.route('**/api/v1/announcements', r => r.fulfill({ json: { serverTime: new Date().toISOString(), refreshAt: new Date(Date.now() + 10000).toISOString(), announcements: [] } }))
  await page.route('**/api/v1/minigames/skewer/coop/rooms?**', r => r.fulfill({ json: { mine: null, rooms: [] } }))
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByRole('button', { name: '공원 VR 시작', exact: true })).toBeEnabled({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await page.evaluate(async p => (await import(p)).install(), xr)
  await page.getByRole('button', { name: '공원 VR 시작', exact: true }).click()
  await expect.poll(async () => (await state(page)).active).toBe(true)
  await page.waitForTimeout(120)
  return { server, errors }
}

async function approach(page: Page, server: Awaited<ReturnType<typeof enter>>['server']) {
  const entrance = await page.evaluate(async () => (await import('/src/features/vrZone/parkBridge.ts' as string)).parkVrEntrance)
  const position = { x: entrance.x + Math.sin(entrance.yaw) * 1.4, y: entrance.y,
    z: entrance.z + Math.cos(entrance.yaw) * 1.4 }
  server.place(position)
  await expect.poll(async () => {
    const s = await state(page)
    return Math.max(Math.hypot(s.pose.x - position.x, s.pose.z - position.z),
      Math.hypot(s.position[0] - position.x, s.position[2] - position.z))
  }).toBeLessThan(.01)
  await expect.poll(async () => (await state(page)).skewerEntryVisible).toBe(true)
  await page.evaluate(async p => (await import(p)).faceSkewerEntry(), xr)
  await expect.poll(async () => (await state(page)).entryBounds
    .every((p: number[]) => Math.abs(p[0]!) < 1 && Math.abs(p[1]!) < 1)).toBe(true)
}

test('정면 팁 없이 연속·정밀 회전하고 X 안내를 닫으면 다시 시야를 비운다', async ({ page }, info) => {
  const { errors } = await enter(page)
  expect((await state(page)).statusVisible).toBe(false)
  expect((await state(page)).dialogVisible).toBe(false)
  const offset = await page.evaluate(async p => {
    const xr = await import(p)
    const offset = xr.rotationSamples().length
    xr.input(0, false, .4)
    return offset
  }, xr)
  const sampleCount = 14
  let turns: number[] = []
  // 렌더링이 느리면 500ms 안에 처리되는 프레임 수가 달라진다.
  await expect.poll(async () => {
    turns = (await page.evaluate(async p => (await import(p)).rotationSamples(), xr))
      .slice(offset, offset + sampleCount)
    return turns.length
  }).toBe(sampleCount)
  // 기본 90도/초의 선형 입력: .4 기울기는 약 24도/초다. 예전 제곱 감쇠보다 빠르되
  // 단일 프레임은 50ms 한도 내에서만 회전해 시점이 한꺼번에 튀지 않는다.
  expect(Math.abs(turns.at(-1)! - turns[0]!)).toBeGreaterThan(.1)
  expect(Math.abs(turns.at(-1)! - turns[0]!)).toBeLessThan(.35)
  const maxFrameTurn = 90 * Math.PI / 180 * .05 * (.4 - .18) / (1 - .18)
  expect(turns.slice(1).every((yaw, i) => Math.abs(yaw - turns[i]!) <= maxFrameTurn + 1e-6)).toBe(true)
  await page.evaluate(async p => (await import(p)).input(0), xr)
  await page.waitForTimeout(100)
  const stopped = (await state(page)).rigYaw
  await page.waitForTimeout(200)
  expect((await state(page)).rigYaw).toBeCloseTo(stopped, 5)
  await page.evaluate(async p => (await import(p)).buttons({ guide: true }), xr)
  await expect.poll(async () => (await state(page)).dialogVisible).toBe(true)
  await page.evaluate(async p => (await import(p)).buttons({ guide: false }), xr)
  await page.evaluate(async p => (await import(p)).input(0, true), xr)
  await expect.poll(async () => (await state(page)).dialogVisible).toBe(false)
  await page.evaluate(async p => (await import(p)).input(0), xr)
  await page.waitForTimeout(300)
  expect((await state(page)).statusVisible).toBe(false)
  const frame = await page.evaluate(async p => (await import(p)).sceneFramePNG(), xr)
  await writeFile(info.outputPath('park-vr-clear-view.png'), Buffer.from(frame.split(',')[1]!, 'base64'))
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

async function aimSelect(page: Page, x: number, y: number) {
  await page.evaluate(async ({ p, x, y }) => {
    const helper = await import(p)
    helper.buttons({})
    helper.aimCanvas('park-xr-skewer-lobby', x / 1536, y / 1024)
    await new Promise(resolve => setTimeout(resolve, 130))
    helper.buttons({ trigger: true })
    await new Promise(resolve => setTimeout(resolve, 130))
    helper.buttons({})
  }, { p: xr, x, y })
}

async function openSkewer(page: Page, server: Awaited<ReturnType<typeof enter>>['server']) {
  await approach(page, server)
  await page.evaluate(async p => {
    const helper = await import(p); helper.buttons({}); helper.aim('skewer-entry-edge')
  }, xr)
  await page.waitForTimeout(140)
  await page.evaluate(async p => (await import(p)).buttons({ trigger: true }), xr)
  await expect.poll(() => page.evaluate(async p => (await import(p)).xrCanvasInView('park-xr-skewer-lobby'), xr)).toBe(true)
  await page.evaluate(async p => (await import(p)).buttons({}), xr)
}

test('공원 VR에서 방을 만들고 비밀 가게에 참가해 같은 세션에서 주방 준비를 완료한다', async ({ page }, info) => {
  const { server, errors } = await enter(page)
  expect((await state(page)).skewerEntryVisible).toBe(false)
  const gameId = 'skewer-coop-00000000-0000-4000-8000-000000000001'
  const createdId = 'skewer-coop-00000000-0000-4000-8000-000000000002'
  const room = { gameId, players: 1, locked: true, mine: false, roomName: '친구의 꼬치집', hostNickname: '서빙 친구' }
  const chef = new ChefPreview().view()
  let snapshot: CoopSnapshot | null = null
  const joins: Record<string, unknown>[] = []
  const actions: Record<string, unknown>[] = []
  const make = (id: string): CoopSnapshot => ({
    gameId: id, version: 1, registered: true, privateState: { role: '' },
    publicState: { gameCode: 'SKEWER_COOP', channelId: 'channel-1', roomName: id === gameId ? room.roomName : '함께 여는 꼬치집', phase: 'WAITING',
      remaining: 240, elapsed: 0, countdown: 0, score: 0, served: 0, paused: false, actionVersion: 1, chefVR: false, entryFee: 0,
      rankingEligible: true, rewardStatus: 'SERVER_SETTLEMENT', message: '', endReason: null,
      players: [{ userId: '101', role: '', ready: false, connected: true },
        ...(id === gameId ? [{ userId: '202', role: 'server' as const, ready: true, connected: true }] : [])],
      greeting: { active: false, index: 0, remaining: 0, answered: false, responded: 0, speech: false },
    },
  })
  await page.route('**/api/v1/minigames/skewer/coop/rooms?**', route => route.fulfill({ json: { rooms: [room], mine: snapshot } }))
  await page.route('**/api/v1/minigames/skewer/coop/rooms', route => {
    const payload = route.request().postDataJSON()
    joins.push(payload)
    if (payload.gameId && payload.password !== '123Q') return route.fulfill({ status: 403, json: { code: 'SKEWER_COOP_PASSWORD_INVALID' } })
    snapshot = make(payload.gameId ?? createdId)
    return route.fulfill({ json: snapshot })
  })
  await page.route('**/api/v1/minigames/skewer/coop/leave', route => {
    snapshot = null
    return route.fulfill({ json: {} })
  })
  server.interceptRequest(({ type, payload, requestId }) => {
    const current = snapshot
    if (!current) return false
    if (type === 'GAME_RECONNECT_CHECK') {
      server.emit('GAME_CONNECTION_STATE', { status: 'RESTORED', gameId: current.gameId, version: current.version, state: current }, requestId)
      return true
    }
    if (type === 'GAME_STATE_CHECK') { server.emit('GAME_STATE', current as unknown as Record<string, unknown>, requestId); return true }
    if (type !== 'GAME_ACTION_SEND') return false
    const input = payload.input as Record<string, unknown>
    actions.push(input)
    if (input.type === 'ROLE') {
      current.privateState = { role: 'chef', chef }
      current.publicState.players[0]!.role = 'chef'
    } else if (input.type === 'CHEF_MODE') current.publicState.chefVR = input.vr === true
    else if (input.type === 'READY') {
      current.publicState.players[0]!.ready = input.ready === true
      current.publicState.phase = 'COUNTDOWN'
      current.publicState.countdown = 3
    }
    current.version++; current.publicState.actionVersion++
    server.emit('GAME_ACTION_RESULT', { gameId: current.gameId, actionId: payload.actionId, version: current.version }, requestId)
    server.emit('GAME_STATE', current as unknown as Record<string, unknown>)
    return true
  })
  await openSkewer(page, server)
  const frame = await page.evaluate(async p => (await import(p)).sceneFramePNG(), xr)
  await writeFile(info.outputPath('skewer-coop-from-vr.png'), Buffer.from(frame.split(',')[1]!, 'base64'))
  await aimSelect(page, 1128, 543)
  await aimSelect(page, 1180, 763)
  await expect.poll(() => joins[0]).toMatchObject({ channelId: 'channel-1', roomName: '함께 여는 꼬치집', password: '' })
  await aimSelect(page, 263, 894)
  await expect.poll(() => snapshot).toBeNull()
  await aimSelect(page, 621, 427)
  for (const x of [194, 320, 446]) await aimSelect(page, x, 282)
  await aimSelect(page, 575, 645)
  await aimSelect(page, 194, 375)
  await aimSelect(page, 1180, 763)
  await expect.poll(() => joins[1]).toMatchObject({ channelId: 'channel-1', gameId, password: '123Q' })
  await aimSelect(page, 414, 733)
  await expect.poll(() => actions.at(-1)).toEqual({ type: 'ROLE', role: 'chef' })
  await aimSelect(page, 414, 733)
  await expect.poll(() => actions.at(-1), { timeout: 15000 }).toEqual({ type: 'CHEF_MODE', vr: true })
  await expect.poll(() => page.evaluate(async p => (await import(p)).selectKitchen('coop'), xr)).toBe(true)
  await expect.poll(() => actions.at(-1)).toEqual({ type: 'READY', ready: true })
  expect((await state(page)).active).toBe(true)
  expect(server.requests.filter(r => r.type === 'WORLD_INTERACTION_SET' && r.payload.vrActive === false)).toHaveLength(0)
  await expect(page.getByRole('button', { name: /방 만들기/ })).toHaveCount(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('꼬치왕 로비에서 B를 누르면 공원 VR로 돌아온다', async ({ page }) => {
  const { server, errors } = await enter(page)
  await openSkewer(page, server)
  await page.evaluate(async p => (await import(p)).input(0, false, 0, true), xr)
  await expect.poll(() => page.evaluate(async p => (await import(p)).visibleXRObject('park-xr-skewer-lobby'), xr)).toBe(false)
  expect((await state(page)).active).toBe(true)
  expect(errors).toEqual([])
})
