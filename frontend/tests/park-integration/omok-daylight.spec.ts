import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fixture, screenshot } from '../e2e/contractFixture'

// Night, dawn, noon and dusk of the shared 30-minute park day (1 in-game hour = 75 s).
const HOURS = [0, 5.5, 6, 6.25, 6.5, 12, 17.5, 18, 18.5]
const FOCUS = { sun: 2.5, fill: 1.7, points: 0 }
type Lighting = { hour: number; night: number; cameraLayers: number; sun: number; sunY: number; fill: number; points: number; visiblePoints: number }
const P = '/tests/park-integration/omokLightingProbe.ts'
const probe = <T,>(page: Page, name: string, arg?: unknown): Promise<T> =>
  page.evaluate(async ([P, name, arg]) => (await import(P as string))[name as string](arg), [P, name, arg] as const)
const lighting = (page: Page) => probe<Lighting>(page, 'lightingState')
const hour = async (page: Page, value: number) => { await probe(page, 'pinParkHour', value); await page.waitForTimeout(1500) }
const omokReady = (page: Page) => expect.poll(() => page.evaluate(async () =>
  (await import('/tests/e2e/sceneProbe.ts' as string)).omokCameraProbe().ready), { timeout: 30000 }).toBe(true)
/** Light values captured at each draw: the omok profile lives only between CameraRig and the render. */
const drawn = async (page: Page) => {
  await probe(page, 'startRenderLog'); await page.waitForTimeout(400)
  return probe<Lighting[]>(page, 'takeRenderLog')
}
/** Spectator view controls live in the collapsible game menu. */
const spectatorButton = async (page: Page, name: string) => {
  const button = page.getByRole('button', { name, exact: true })
  if (!await button.isVisible()) await page.getByRole('navigation', { name: '게임 메뉴', exact: true }).getByText('게임 메뉴').click()
  await button.click()
}
const focused = (state: Lighting) => state.cameraLayers === 2 && Math.abs(state.sun - FOCUS.sun) < .001
  && Math.abs(state.fill - FOCUS.fill) < .001 && state.points === FOCUS.points
const parkNight = (state: Lighting) => state.cameraLayers === 1 && Math.abs(state.sun - .65) < .001 && Math.abs(state.fill - 1.35) < .001

const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  test.setTimeout(240_000)
  const messages: string[] = []; errors.set(page, messages)
  page.on('pageerror', e => messages.push(e.message))
  page.on('console', m => { if (m.type() === 'error') messages.push(m.text() + ' ' + m.location().url) })
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

async function load(page: Page) {
  // Registered after the fixture so it wins over the fixture's /api/v1/** handler (otherwise: maintenance page).
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: { mode: 'NORMAL', notice: '', maintenanceStartedAt: null,
    expectedOpenAt: null, version: 1, updatedAt: new Date().toISOString(), serverTime: new Date().toISOString() } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: { serverTime: new Date().toISOString(),
    refreshAt: new Date(Date.now() + 600_000).toISOString(), announcements: [] } }))
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
}
/** Median sRGB luminance of the inner wood, plus the mean of a white stone centre when one is given. */
async function brightness(page: Page, white?: { x: number; y: number }) {
  const rect = await probe<{ x0: number; y0: number; x1: number; y1: number }>(page, 'boardWoodRect')
  const { data, info } = await sharp(await page.screenshot()).raw().toBuffer({ resolveWithObject: true })
  const luminance = (x: number, y: number) => {
    const i = (Math.round(y) * info.width + Math.round(x)) * info.channels
    return .2126 * data[i]! + .7152 * data[i + 1]! + .0722 * data[i + 2]!
  }
  const wood: number[] = []
  for (let y = rect.y0; y <= rect.y1; y += 2) for (let x = rect.x0; x <= rect.x1; x += 2) wood.push(luminance(x, y))
  wood.sort((a, b) => a - b)
  let stone = NaN
  if (white) {
    let sum = 0
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) sum += luminance(white.x + dx, white.y + dy)
    stone = sum / 49
  }
  return { wood: Math.round(wood[wood.length >> 1]! * 10) / 10, white: Math.round(stone * 10) / 10 }
}
async function sweep(page: Page, label: string, white?: { x: number; y: number }) {
  const rows: (Lighting & { wood: number; white: number; frames: number; allFocused: boolean })[] = []
  for (const value of HOURS) {
    await hour(page, value)
    const frames = await drawn(page)
    rows.push({ ...frames.at(-1)!, frames: frames.length, allFocused: frames.length > 0 && frames.every(focused), ...await brightness(page, white) })
    if ([0, 6.5, 12, 18].includes(value)) await screenshot(page, `omok-daylight-${label}-h${value}`)
  }
  if (process.env.OMOK_DAYLIGHT_OUT) {
    await fs.mkdir(process.env.OMOK_DAYLIGHT_OUT, { recursive: true })
    await fs.writeFile(path.join(process.env.OMOK_DAYLIGHT_OUT, `${label}.json`), JSON.stringify(rows, null, 1))
  }
  return rows
}
function withinThreePercent(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.max(...values.map(v => Math.abs(v - mean) / mean))
}

test('오목 플레이 탑뷰는 공원 시각과 무관하게 같은 조명으로 판·돌 밝기를 유지하고 종료 첫 프레임에 공원 조명으로 돌아간다', async ({ page }) => {
  const server = await fixture(page, { generatedPark: true, omok: true, manualLobby: true, tabletServer: true })
  await load(page)
  await hour(page, 0)
  expect.soft(parkNight(await lighting(page))).toBe(true)
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await tablet.getByLabel('1인 참가비').fill('1')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox', { name: '참가 금액을 확인했어요' }).check()
  await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true)
  await probe(page, 'startRenderLog')
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  await expect(page.getByRole('region', { name: '오목 경기', exact: true })).toBeVisible()
  server.turnTo('101'); await omokReady(page)
  // Entry: every draw is either the untouched night park or the fixed omok profile — never a mixture.
  const entry = await probe<Lighting[]>(page, 'takeRenderLog')
  const firstFocus = entry.findIndex(state => state.cameraLayers === 2)
  expect.soft(firstFocus).toBeGreaterThan(0)
  expect.soft(entry.slice(0, firstFocus).every(parkNight)).toBe(true)
  expect.soft(entry.slice(firstFocus).every(focused)).toBe(true)
  // The night lamp pool keeps its light count, so no material program changes on entry.
  expect.soft(entry[firstFocus]!.visiblePoints).toBe(entry[firstFocus - 1]!.visiblePoints)

  const place = async (x: number, y: number) => {
    const point = await page.evaluate(async ([x, y]) => (await import('/tests/park-integration/probe.ts' as string)).omokPlayProbe(x, y), [x, y] as const)
    await page.mouse.click(point!.point.x, point!.point.y)
    return point!.point
  }
  await place(7, 7)
  await expect.poll(() => server.sent.filter(m => m.type === 'GAME_ACTION_SEND').length).toBe(1)
  server.omokColors('102'); server.turnTo('101'); await omokReady(page)
  const white = await place(8, 7)
  await expect.poll(() => server.sent.filter(m => m.type === 'GAME_ACTION_SEND').length).toBe(2)
  server.turnTo('101'); await omokReady(page)

  const rows = await sweep(page, 'player', white)
  for (const row of rows) expect.soft(row.allFocused, `hour ${row.hour}`).toBe(true)
  expect.soft(withinThreePercent(rows.map(row => row.wood))).toBeLessThanOrEqual(.03)
  expect.soft(withinThreePercent(rows.map(row => row.white))).toBeLessThanOrEqual(.03)

  // Exit: the first park draw already has the current park hour (night lamps at their eased level).
  await hour(page, 0)
  await probe(page, 'startRenderLog')
  server.finishGame()
  await expect.poll(async () => (await lighting(page)).cameraLayers, { timeout: 30000 }).toBe(1)
  await page.waitForTimeout(300)
  const exit = await probe<Lighting[]>(page, 'takeRenderLog')
  const firstPark = exit.findIndex(state => state.cameraLayers === 1)
  expect.soft(firstPark).toBeGreaterThan(0)
  expect.soft(exit.slice(0, firstPark).every(focused)).toBe(true)
  expect.soft(exit.slice(firstPark).every(parkNight)).toBe(true)
  expect.soft(exit[firstPark]!.points).toBeGreaterThan(20)
  await hour(page, 12)
  expect.soft(await lighting(page)).toMatchObject({ cameraLayers: 1, sun: 2.5, points: 0 })
  await hour(page, 6.5)
  expect.soft((await lighting(page)).sun).toBeLessThan(1)
  await probe(page, 'pinParkHour', null)
})

test('오목 관전 판 보기도 고정 조명을 쓰고 주변 보기·관전 종료에서는 공원 낮밤 조명을 그대로 쓴다', async ({ page }) => {
  await fixture(page, { generatedPark: true, omok: true, publicSpectator: true, ownUserId: '505' })
  await load(page)
  await page.getByRole('button', { name: 'E 관전하기', exact: true }).click()
  await expect(page.getByLabel('오목 관전 경기 정보', { exact: true })).toBeVisible(); await omokReady(page)
  const rows = await sweep(page, 'spectator')
  for (const row of rows) expect.soft(row.allFocused, `hour ${row.hour}`).toBe(true)
  expect.soft(withinThreePercent(rows.map(row => row.wood))).toBeLessThanOrEqual(.03)

  await spectatorButton(page, '주변 보기')
  await expect.poll(async () => (await lighting(page)).cameraLayers).toBe(1)
  await hour(page, 0); expect.soft(parkNight(await lighting(page))).toBe(true)
  await hour(page, 12); expect.soft(await lighting(page)).toMatchObject({ cameraLayers: 1, sun: 2.5, fill: 1.7, points: 0 })
  await spectatorButton(page, '판 보기'); await omokReady(page)
  await hour(page, 0); expect.soft((await drawn(page)).every(focused)).toBe(true)
  await spectatorButton(page, '관전 종료')
  await expect.poll(async () => (await lighting(page)).cameraLayers).toBe(1)
  await page.waitForTimeout(300)
  expect.soft(parkNight(await lighting(page))).toBe(true)
  await probe(page, 'pinParkHour', null)
})

test('다른 게임(파클 관전) 화면은 고정 조명 없이 공원 낮밤 조명을 그대로 받는다', async ({ page }) => {
  const server = await fixture(page, { generatedPark: true, omok: true, dice: true, publicSpectator: true, ownUserId: '505', spectatorEvents: true })
  await load(page)
  await page.getByRole('button', { name: 'E 관전하기', exact: true }).click()
  const hud = page.getByRole('region', { name: '주사위 경기', exact: true })
  await expect(hud).toBeVisible()
  server.diceSnapshot({ turnUserId: '101', turnDeadline: new Date(Date.now() + 30000).toISOString(), stage: 'AWAITING_ROLL' }, 'SPECTATOR')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).farkleProbe().cameraReady)).toBe(true)
  await hour(page, 0); expect.soft(parkNight(await lighting(page))).toBe(true)
  await hour(page, 6.5); expect.soft((await lighting(page)).sun).toBeLessThan(1)
  await hour(page, 12); expect.soft(await lighting(page)).toMatchObject({ cameraLayers: 1, sun: 2.5, fill: 1.7, points: 0 })
  await probe(page, 'pinParkHour', null)
})
