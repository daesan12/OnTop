import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parkFixture, identity } from './fixture'
import { disabledJumpmapStatus } from '../fixtures/jumpmap'
import { COURSE, START, COURSE_VERSION, RULES_VERSION, REWARDS, kstDate } from '../../src/features/jumpmap/course'

const xr = '/tests/park-xr/syntheticXR.ts', coop = '/tests/park-xr/flowPreview.tsx'
const folder = process.env.VR_FLOW_EVIDENCE
test('전체 VR 화면 검토: 공원 진입부터 점프맵 결과·종료와 꼬치왕 준비·종료까지', async ({ page }) => {
  test.skip(!folder, 'Explicit screenshot-review run only')
  test.setTimeout(240000)
  await mkdir(folder!, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('response', response => { if (response.status() >= 400) console.info('[flow HTTP]', response.status(), response.url()) })
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const server = await parkFixture(page, { carrySupported: true })
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
    mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
    version: 1, updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(),
  } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: {
    serverTime: new Date().toISOString(), refreshAt: new Date(Date.now() + 10000).toISOString(), announcements: [],
  } }))
  await page.route('**/api/v1/minigames/jumpmap/status?**', route => route.fulfill({ json: {
    ...disabledJumpmapStatus('channel-1'), enabled: true,
  } }))
  const screenshot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready)
    await expect.poll(() => page.evaluate(() => [...document.images]
      .filter(img => img.getClientRects().length > 0)
      .every(img => img.complete && img.naturalWidth > 0))).toBe(true)
    await page.screenshot({ path: path.join(folder!, `${name}.png`), animations: 'disabled' })
  }
  const saveData = (name: string, png: string) => writeFile(path.join(folder!, `${name}.png`), Buffer.from(png.split(',')[1]!, 'base64'))
  const frame = async (name: string) => saveData(name, await page.evaluate(async p => (await import(p)).sceneFramePNG(), xr))
  const snapshot = () => page.evaluate(async p => (await import(p)).snapshot(), xr)
  const input = (jump = false, exit = false) => page.evaluate(async ({ p, jump, exit }) => (await import(p)).input(0, jump, 0, exit), { p: xr, jump, exit })
  const button = (guide: boolean) => page.evaluate(async ({ p, guide }) => (await import(p)).buttons({ guide }), { p: xr, guide })
  const select = async (action: string) => {
    await page.evaluate(async ({ p, action }) => { const mod = await import(p); mod.aim(action); mod.buttons({ trigger: false }) }, { p: xr, action })
    await page.waitForTimeout(100)
    await page.evaluate(async p => (await import(p)).buttons({ trigger: true }), xr)
  }
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…', { exact: true })).toBeHidden({ timeout: 90000 })
  await expect(page.getByRole('button', { name: '공원 VR 시작', exact: true })).toBeEnabled()
  server.place({ x: START.x, y: START.y + .8, z: START.z })
  await expect(page.getByRole('button', { name: '돌탑 점프맵 VR 시작', exact: true })).toBeEnabled()
  await screenshot('park-01-entry')
  await page.getByRole('button', { name: 'VR 조작 안내', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '돌탑 점프맵 VR 조작 안내' })).toBeVisible()
  await screenshot('park-02-before-guide')
  await page.getByRole('button', { name: '안내 닫기', exact: true }).click()
  await page.evaluate(async p => (await import(p)).install(), xr)
  await page.getByRole('button', { name: '돌탑 점프맵 VR 시작', exact: true }).click()
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  await page.waitForTimeout(150); await frame('park-03-roaming')
  await button(true); await expect.poll(async () => (await snapshot()).view?.key).toBe('guide')
  await frame('park-04-jump-guide')
  await input(true); await expect.poll(async () => (await snapshot()).view?.key).toBe('roaming')
  await input(); await button(false)
  const scope = { channelId: 'channel-1', mapVersion: identity.mapVersion }
  const money = { earningsDate: kstDate(), todayEarned: 0, dailyCap: 1000 }
  const runId = 'flow-preview-run'
  server.place({ x: COURSE[0]!.x, y: COURSE[0]!.top + .8, z: COURSE[0]!.z })
  server.emit('JUMPMAP_STARTED', { ...scope, ...money, revision: 1, runId, courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, serverTime: Date.now() })
  await expect.poll(async () => (await snapshot()).view?.title).toContain('석탑')
  await frame('park-05-playing')
  const last = COURSE.at(-1)!, total = REWARDS.reduce((sum, n) => sum + n, 0)
  server.place({ x: last.x, y: last.top + .8, z: last.z })
  server.emit('JUMPMAP_ENDED', { ...scope, ...money, revision: 2, runId, reason: 'FINISH', gatesPassed: 7,
    maxHeight: 46.5, runCoins: total, todayEarned: total, elapsedMs: 125400, finishMs: 125400, bestFinishMs: 125400, newBest: true })
  await expect.poll(async () => (await snapshot()).view?.title).toBe('돌탑 도전 완료')
  await frame('park-06-result')
  const item = { rank: 1, userId: '101', nickname: '미리보기 도전자', finishMs: 125400, finishedAt: '2026-11-05T03:00:00Z' }
  await page.route('**/api/v1/minigames/jumpmap/rankings', route => route.fulfill({ json: { items: [item], me: item } }))
  await select('ranking'); await expect.poll(async () => (await snapshot()).view?.lines.join()).toContain('미리보기 도전자')
  await frame('park-07-ranking')
  await input(true); await expect.poll(async () => (await snapshot()).view?.title).toBe('돌탑 도전 완료')
  await input(); await page.waitForTimeout(100); await input(true)
  await expect.poll(async () => (await snapshot()).view?.key).toBe('roaming')
  expect((await snapshot()).active).toBe(true)
  await input(); await page.waitForTimeout(100); await input(false, true)
  await expect.poll(async () => (await snapshot()).active).toBe(false)
  await screenshot('park-08-continue')
  server.place({ x: START.x, y: START.y + .8, z: START.z })
  await input()
  await page.getByRole('button', { name: '돌탑 점프맵 VR 시작', exact: true }).click()
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  await page.waitForTimeout(100)
  await input(false, true); await expect.poll(async () => (await snapshot()).active).toBe(false)
  await expect(page.getByRole('button', { name: '돌탑 점프맵 VR 시작', exact: true })).toBeVisible()
  await screenshot('park-09-exit')

  await page.evaluate(async p => (await import(p)).mount(), coop)
  await expect(page.getByRole('button', { name: /^방 만들기/ })).toBeVisible()
  await screenshot('chef-01-entry')
  await page.getByRole('button', { name: /^방 만들기/ }).click()
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await expect(page.getByText('친구를 기다리고 있어요', { exact: true })).toBeVisible()
  await screenshot('chef-02-waiting')
  await page.evaluate(async p => (await import(p)).joinFriend(), coop)
  await expect(page.getByRole('button', { name: '요리사', exact: true })).toBeVisible()
  await screenshot('chef-03-role')
  await page.getByRole('button', { name: '요리사', exact: true }).click()
  await expect(page.getByRole('button', { name: 'VR로 요리하기', exact: true })).toBeVisible()
  await screenshot('chef-04-mode')
  await page.getByRole('button', { name: 'VR로 요리하기', exact: true }).click()
  await expect(page.getByRole('button', { name: /헤드셋 연결하기/ })).toBeVisible()
  await screenshot('chef-05-ready-guide')
  await page.getByRole('button', { name: '주방 화면 미리 보기', exact: true }).click()
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-ready', 'true')
  await screenshot('chef-06-equipment')
  await page.getByRole('button', { name: '요리사 이용 안내', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '요리사 이용 안내' })).toBeVisible()
  await screenshot('chef-07-controls')
  await page.getByRole('button', { name: '주방으로 돌아가기', exact: true }).click()
  await page.evaluate(async p => (await import(p)).headsetPreviewConnected(), coop)
  await page.getByRole('button', { name: '← 역할·준비 화면으로', exact: true }).click()
  await page.getByRole('button', { name: '준비 완료', exact: true }).click()
  await expect(page.locator('.coop-countdown')).toBeVisible(); await screenshot('chef-08-countdown')
  await page.evaluate(async p => (await import(p)).playing(), coop)
  await expect(page.getByTestId('chef-app')).toHaveAttribute('data-stack', 'tomato,cheese,pepper')
  await saveData('chef-09-playing', await page.evaluate(async p => (await import(p)).captureKitchenFrame(), coop))
  await page.evaluate(async p => (await import(p)).finish(), coop)
  await expect(page.getByLabel('공동 경기 결과 요약')).toHaveAttribute('data-settlement', 'SETTLED')
  await screenshot('chef-10-result')
  await saveData('chef-11-spatial-end', await page.evaluate(async p => (await import(p)).captureKitchenFrame(), coop))
  await page.getByRole('button', { name: '공원으로 돌아가기', exact: true }).click()
  await expect(page.getByTestId('skewer-coop')).toHaveCount(0)
  await screenshot('chef-12-return')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
