import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { parkFixture, identity } from './fixture'
import { COURSE, COURSE_VERSION, RULES_VERSION, START, kstDate } from '../../src/features/jumpmap/course'
import { PARK_DATA } from '../../src/map/park'
const scope = { channelId: 'channel-1', mapVersion: identity.mapVersion }
const earnings = { earningsDate: kstDate(), dailyCap: 100, todayEarned: 0 }
const status = { ...scope, ...earnings, revision: 0, enabled: true, courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, isFirstRun: true, seenTips: [], activeRunId: null, bestFinishMs: null }
const probe = (page: Page) => page.evaluate(async () => (await import('/tests/park-integration/jumpmapProbe.ts' as string)).jumpmapProbe())
async function shot(page: Page, name: string) {
  const dir = process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-jumpmap-qa'); await fs.mkdir(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, name + '.png') })
}
async function setup(page: Page, response: object | null = status) {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && /THREE|WebGL|shader|React/.test(m.text())) errors.push(m.text()) })
  const server = await parkFixture(page), tips: object[] = []
  await page.route('**/api/v1/minigames/jumpmap/status?*', r => r.fulfill(response ? { json: response } : { status: 404, json: {} }))
  await page.route('**/api/v1/minigames/jumpmap/tips', r => { tips.push(r.request().postDataJSON()); return r.fulfill({ status: 204 }) })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page).toHaveURL(/\/park$/)
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length), { timeout: 90000 }).toBeGreaterThan(0)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden()
  await expect.poll(async () => (await probe(page)).state.checked).toBe(true)
  expect((await probe(page)).session.mapVersion).toBe(identity.mapVersion)
  expect((await probe(page)).identity).toEqual(identity)
  expect((await probe(page)).session.mapContractStatus).toBe('verified')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  const emit = (type: string, revision: number, p: object = {}) => server.emit(type, { ...scope, ...earnings, revision, runId: 'run-a', ...p })
  const start = () => emit('JUMPMAP_STARTED', 1, { courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, serverTime: Date.now() })
  return { server, tips, errors, emit, start }
}
test('reuses the new-map assets, shows authoritative progress and settles pending coins once', async ({ page }) => {
  const { server, errors, emit, start } = await setup(page)
  server.place({ x: START.x, y: START.y + .8, z: START.z })
  await expect(page.getByText('첫 발판을 밟으면 시작해요', { exact: true })).toBeVisible()
  await expect.poll(async () => (await probe(page)).geometryMatches).toBeGreaterThan(8)
  expect((await probe(page)).padsDrawn).toBe(113)
  await shot(page, 'jumpmap-start-desktop')
  start(); const pad = COURSE[26]!; server.place({ x: pad.x, y: pad.top + .8, z: pad.z })
  await expect.poll(async () => (await probe(page)).ownPosition?.[1]).toBeCloseTo(pad.top, 1)
  await expect.poll(async () => Math.abs((await probe(page)).camera![1]! - pad.top)).toBeLessThan(12)
  await expect(page.getByLabel('도전 현황')).toBeVisible()
  emit('JUMPMAP_GATE', 2, { gate: 1, elapsedMs: 15000, coinsCalculated: 2, coinsGranted: null, pending: true, runCoins: 0 })
  await expect(page.getByText('정산 중…', { exact: false }).last()).toBeVisible()
  await expect.poll(async () => (await probe(page)).state.run.gatesPassed).toBe(1)
  expect((await probe(page)).state.run.runCoins).toBe(0)
  const before = (await probe(page)).wallet.revision
  emit('JUMPMAP_GATE_SETTLED', 3, { gate: 1, coinsGranted: 2, runCoins: 2, todayEarned: 2 })
  await expect.poll(async () => (await probe(page)).wallet.revision).toBe(before + 1)
  emit('JUMPMAP_GATE_SETTLED', 3, { gate: 1, coinsGranted: 2, runCoins: 2, todayEarned: 2 })
  await expect(page.getByText('1구간 · 지급 완료', { exact: true })).toBeVisible()
  await shot(page, 'jumpmap-playing-desktop')
  await page.keyboard.press('F1'); await expect(page.locator('dialog[open], [role="dialog"]').filter({ hasText: '돌탑 점프맵' }).first()).toBeVisible({ timeout: 15000 })
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await probe(page)).wallet.revision).toBe(before + 1)
  expect(server.requests.filter(r => r.type.startsWith('JUMPMAP_'))).toEqual([])
  expect(errors).toEqual([])
})
test('fall results guide walking back, late settlement updates the result and cannot teleport', async ({ page }) => {
  const { server, errors, emit, start } = await setup(page)
  start(); const pad = COURSE[0]!; server.place({ x: pad.x, y: pad.top + .8, z: pad.z })
  emit('JUMPMAP_ENDED', 2, { reason: 'FALL', gatesPassed: 2, maxHeight: 28, elapsedMs: 50000, runCoins: 2, todayEarned: 2 })
  await expect(page.getByLabel('점프맵 결과')).toContainText('아쉽게 떨어졌어요')
  emit('JUMPMAP_GATE_SETTLED', 3, { gate: 2, coinsGranted: 4, runCoins: 6, todayEarned: 6 })
  await expect(page.getByLabel('점프맵 결과')).toContainText('이번 도전 6냥')
  const count = server.requests.length
  await page.getByRole('button', { name: '돌탑 길 안내', exact: true }).click()
  await expect(page.getByRole('region', { name: '내 길 안내', exact: true })).toBeVisible()
  expect(server.requests.slice(count).some(r => /TELEPORT|RESPAWN|JUMPMAP/.test(r.type))).toBe(false)
  await shot(page, 'jumpmap-fall-return')
  expect(errors).toEqual([])
})
test('finish, daily cap and recovered run remain readable at 740px', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 900 })
  const activeRun = { runId: 'run-a', elapsedMs: 123000, gatesPassed: 6, finalReached: true, maxHeight: 47, runCoins: 64 }
  const { server, errors, emit } = await setup(page, { ...status, todayEarned: 64, revision: 5, activeRunId: 'run-a', activeRun })
  const pad = COURSE.at(-1)!; server.place({ x: pad.x, y: pad.top + .8, z: pad.z })
  await expect.poll(async () => (await probe(page)).ownPosition?.[1]).toBeCloseTo(pad.top, 1)
  await expect.poll(async () => Math.abs((await probe(page)).camera![1]! - pad.top)).toBeLessThan(12)
  await expect(page.getByLabel('도전 현황')).toContainText('연잎')
  await shot(page, 'jumpmap-playing-narrow')
  emit('JUMPMAP_ENDED', 6, { reason: 'FINISH', gatesPassed: 7, maxHeight: 47, elapsedMs: 145321, runCoins: 100, todayEarned: 100, finishMs: 145321, bestFinishMs: 145321, newBest: true })
  await expect(page.getByLabel('점프맵 결과')).toContainText('7구간 완주!')
  await expect(page.getByLabel('점프맵 결과')).toContainText('2:25.32')
  await expect(page.getByRole('button', { name: '돌탑 길 안내', exact: true })).toBeInViewport()
  await shot(page, 'jumpmap-finish-narrow')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
test('missing backend keeps the park usable, hides unsupported course and still exposes directions', async ({ page }) => {
  const { server, errors } = await setup(page, null)
  server.place({ x: START.x, y: START.y + .8, z: START.z })
  await expect(page.getByText('점프맵 준비 중', { exact: true })).toBeVisible()
  expect((await probe(page)).state.available).toBe(false)
  expect((await probe(page)).padsDrawn).toBe(0)
  const [x,y,z] = PARK_DATA.physics.spawn.position; server.place({ x,y,z })
  await page.getByRole('button', { name: '공원 지도', exact: true }).click()
  await page.getByRole('button', { name: '돌탑 점프맵 길 안내', exact: true }).click()
  await expect(page.locator('.navigation-map-route')).toHaveCount(1, { timeout: 15000 })
  await shot(page, 'jumpmap-map-unavailable')
  await page.keyboard.press('Escape')
  expect(server.requests.filter(r => r.type.startsWith('JUMPMAP_'))).toEqual([])
  expect(errors).toEqual([])
})

test('stale course versions and a changed server map never activate jump platforms', async ({ page }) => {
  const { server, errors, emit } = await setup(page, { ...status, courseVersion: 'retired-course' })
  server.place({ x: START.x, y: START.y + .8, z: START.z })
  await expect(page.getByText('점프맵 버전이 달라요. 새로고침 후 다시 확인해 주세요.', { exact: true })).toBeVisible()
  expect((await probe(page)).padsDrawn).toBe(0)
  emit('JUMPMAP_STARTED', 1, { courseVersion: 'retired-course', rulesVersion: RULES_VERSION, serverTime: Date.now() })
  await expect.poll(async () => (await probe(page)).state.error).toBe('점프맵 버전이 달라요. 새로고침해 주세요.')
  expect((await probe(page)).state.available).toBe(false)
  server.mismatch()
  await expect.poll(async () => (await probe(page)).session.mapContractStatus).toBe('mismatch')
  expect((await probe(page)).state.available).toBe(false)
  expect((await probe(page)).padsDrawn).toBe(0)
  await shot(page, 'jumpmap-stale-map-blocked')
  expect(errors).toEqual([])
})

test('landing pressure, rebound and recovery render for all seven materials and respect reduced motion', async ({ page }) => {
  const { server, errors, emit, start } = await setup(page)
  start()
  const pad = COURSE[0]!
  server.place({ x: pad.x, y: pad.top + .8, z: pad.z })
  const power = () => page.evaluate(async () => (await import('/tests/park-integration/landingMotionProbe.ts' as string)).landingPower(0))
  emit('JUMPMAP_STEP', 2, { playerId: '101', block: pad.block })
  await expect.poll(power).toBe(1)
  const samples = await page.evaluate(async () => (await import('/tests/park-integration/landingMotionProbe.ts' as string)).sampleLandingMotion())
  for (const sample of samples.result) {
    expect(sample.pressed, `${sample.theme} visibly compresses`).toBeGreaterThan(60)
    expect(sample.release, `${sample.theme} visibly rebounds`).toBeGreaterThan(20)
    expect(sample.settled, `${sample.theme} recovers its silhouette`).toBe(0)
    expect(sample.reduced, `${sample.theme} stays still at zero motion power`).toBe(0)
    expect(sample.maxVertices, `${sample.theme} stays within the shared geometry budget`).toBeLessThan(40000)
  }
  const dir = process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-jumpmap-qa')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'landing-material-motion.png'), Buffer.from(samples.image.split(',')[1]!, 'base64'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(power).toBe(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(power).toBe(1)
  expect((await probe(page)).state.run?.gatesPassed).toBe(0)
  await shot(page, 'jumpmap-tactile-in-park')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
