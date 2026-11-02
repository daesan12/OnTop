import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { parkFixture, identity } from './fixture'
import { COURSE, COURSE_VERSION, RULES_VERSION, START, kstDate } from '../../src/features/jumpmap/course'
import { PARK_DATA } from '../../src/map/park'
import selection from '../../public/audio/jumpmap/selection.json' with { type: 'json' }
const scope = { channelId: 'channel-1', mapVersion: identity.mapVersion }
const earnings = { earningsDate: kstDate(), dailyCap: 500, todayEarned: 0 }
const status = { ...scope, ...earnings, revision: 0, enabled: true, courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, isFirstRun: true, seenTips: [], activeRunId: null, bestFinishMs: null }
const probe = (page: Page) => page.evaluate(async () => (await import('/tests/park-integration/jumpmapProbe.ts' as string)).jumpmapProbe())

test('지연된 빈 상태 응답 뒤에도 진행 중인 판과 다음 발판을 유지한다', async ({ page }) => {
  const server = await parkFixture(page)
  let release!: () => Promise<void>
  await page.route('**/api/v1/minigames/jumpmap/status?*', route => {
    release = () => route.fulfill({ json: status })
  })
  await page.goto('/park')
  await expect.poll(() => !!release).toBe(true)
  const pad = COURSE.find(p => p.top >= 18)!
  server.place({ x: pad.x, y: pad.top + .8, z: pad.z, yaw: 0 })
  server.emit('JUMPMAP_STARTED', { ...scope, ...earnings, revision: 1, runId: 'slow-status-run',
    courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, serverTime: Date.now() })
  await expect.poll(async () => (await probe(page)).state.run?.runId).toBe('slow-status-run')
  await release()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.waitForTimeout(400)
  expect((await probe(page)).state.run?.runId).toBe('slow-status-run')
  expect((await probe(page)).padsDrawn).toBe(COURSE.length)
  await shot(page, 'jumpmap-qa-delayed-status')
  const { SITES, SETTINGS } = await import('../../src/layout-preview/layout')
  server.place({ x: SITES.pagoda.x + SETTINGS.pagoda.terraceHalf - 1,
    y: SITES.pagoda.floor + .8, z: SITES.pagoda.z + SETTINGS.pagoda.terraceHalf - 1, yaw: -Math.PI * .75 })
  await page.evaluate(async () => {
    const { viewControls } = await import('/src/world/cameraPerspective.ts' as string)
    viewControls.yaw = -Math.PI * .75; viewControls.pitch = .22
  })
  await page.waitForTimeout(700)
  await shot(page, 'jumpmap-qa-stone-foundation')
})
async function shot(page: Page, name: string, animations: 'allow' | 'disabled' = 'allow') {
  const dir = process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-jumpmap-qa'); await fs.mkdir(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, name + '.png'), animations })
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

test('ducks music and other effects during a run, keeps landings clear, and restores the mix on exit', async ({ page }) => {
  await page.addInitScript(() => {
    const gains: GainNode[] = []
    Object.assign(window, { mixGains: gains })
    const create = AudioContext.prototype.createGain
    AudioContext.prototype.createGain = function() { const gain = create.call(this); gains.push(gain); return gain }
  })
  const { server, start, emit, errors } = await setup(page)
  await page.keyboard.press('Shift')
  await page.evaluate(async () => {
    const a = await import('/src/audio/bgm.ts' as string)
    a.setBgmSettings({ volume: 100, muted: false }); a.setSfxSettings({ volume: 100, muted: false })
  })
  const mix = () => page.evaluate(async () => {
    const a = await import('/src/audio/bgm.ts' as string)
    return { music: (window as unknown as { mixGains: GainNode[] }).mixGains[0]!.gain.value,
      other: (a.effectsOutput()?.bus as GainNode).gain.value,
      landing: (a.effectsOutput('jumpmap')?.bus as GainNode).gain.value,
      settings: [a.useBgmSettings.getState(), a.useSfxSettings.getState()] }
  })
  start()
  await expect.poll(async () => (await mix()).music).toBeCloseTo(.25, 2)
  await expect.poll(async () => (await mix()).other).toBeCloseTo(.2, 2)
  await expect.poll(async () => (await mix()).landing).toBeCloseTo(1, 2)
  emit('JUMPMAP_ENDED', 2, { reason: 'FALL', gatesPassed: 0, maxHeight: 1, elapsedMs: 1000, runCoins: 0 })
  await expect.poll(async () => (await mix()).music).toBeCloseTo(1, 2)
  await expect.poll(async () => (await mix()).other).toBeCloseTo(1, 2)
  emit('JUMPMAP_STARTED', 3, { runId: 'run-b', courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, serverTime: Date.now() })
  await expect.poll(async () => (await mix()).other).toBeCloseTo(.2, 2)
  server.mismatch()
  await expect.poll(async () => (await mix()).other).toBeCloseTo(1, 2)
  await expect.poll(async () => (await mix()).music).toBeCloseTo(1, 2)
  expect((await mix()).settings).toEqual([{ volume: 100, muted: false }, { volume: 100, muted: false }])
  expect(errors).toEqual([])
})
test('plays the eight approved landing clips once through the independent effects bus', async ({ page }) => {
  await page.addInitScript(approved => {
    const trace = { decoded: [] as string[], played: [] as string[], active: 0 }
    Object.assign(window, { jumpAudioTrace: trace })
    const hashes = new WeakMap<AudioBuffer, string>()
    const decode = AudioContext.prototype.decodeAudioData
    AudioContext.prototype.decodeAudioData = async function(data: ArrayBuffer) {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data.slice(0))), b => b.toString(16).padStart(2, '0')).join('')
      const buffer = await decode.call(this, data)
      hashes.set(buffer, hash); trace.decoded.push(hash)
      return buffer
    }
    const start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function(...args: Parameters<typeof start>) {
      const hash = this.buffer && hashes.get(this.buffer)
      if (hash && approved.includes(hash)) {
        trace.played.push(hash); trace.active++
        this.addEventListener('ended', () => trace.active--, { once: true })
      }
      return start.apply(this, args)
    }
  }, selection.sounds.map(s => s.sha256))
  const { errors, emit, start } = await setup(page)
  await page.keyboard.press('Shift')
  const trace = () => page.evaluate(() => (window as unknown as { jumpAudioTrace: { decoded: string[]; played: string[]; active: number } }).jumpAudioTrace)
  const hashes = selection.sounds.map(s => s.sha256)
  await expect.poll(async () => (await trace()).decoded.filter(h => hashes.includes(h)).sort()).toEqual([...hashes].sort())
  start()
  const before = (await trace()).played.length
  let revision = 2
  for (const sound of selection.sounds) {
    const pad = COURSE.find(p => sound.sound.startsWith('gomoku-')
      ? p.theme === 'gomoku' && Boolean(p.ordinal % 2) === (sound.sound === 'gomoku-black')
      : p.theme === sound.sound)!
    emit('JUMPMAP_STEP', revision++, { playerId: '101', block: pad.block })
    await expect.poll(async () => (await trace()).played.at(-1)).toBe(sound.sha256)
    await expect.poll(async () => (await trace()).active).toBe(0)
  }
  expect((await trace()).played.slice(before)).toEqual(hashes)
  const music = await page.evaluate(async () => {
    const audio = await import('/src/audio/bgm.ts' as string)
    const before = audio.useBgmSettings.getState()
    audio.setSfxSettings({ muted: true })
    return { volume: before.volume, muted: before.muted }
  })
  // AudioParam values can remain at their last rendered value while this bus is idle.
  emit('JUMPMAP_STEP', revision++, { playerId: '101', block: COURSE.find(p => p.theme === 'stone')!.block })
  await expect.poll(async () => (await trace()).played.length).toBe(before + 9)
  await expect.poll(() => page.evaluate(async () => {
    const audio = await import('/src/audio/bgm.ts' as string)
    return (audio.effectsOutput('jumpmap')?.bus as GainNode).gain.value
  })).toBeLessThan(.001)
  expect(await page.evaluate(async () => {
    const audio = await import('/src/audio/bgm.ts' as string), value = audio.useBgmSettings.getState()
    audio.setSfxSettings({ muted: false })
    return { volume: value.volume, muted: value.muted }
  })).toEqual(music)
  emit('JUMPMAP_STEP', revision++, { playerId: '101', block: COURSE.find(p => p.theme === 'cloud')!.block })
  await expect.poll(async () => (await trace()).played.length).toBe(before + 10)
  await expect.poll(() => page.evaluate(async () => {
    const audio = await import('/src/audio/bgm.ts' as string)
    return (audio.effectsOutput('jumpmap')?.bus as GainNode).gain.value
  })).toBeGreaterThan(0)
  await shot(page, 'jumpmap-approved-audio')
  expect(errors).toEqual([])
})

test('reuses the new-map assets, shows authoritative progress and settles pending coins once', async ({ page }) => {
  const { server, errors, emit, start } = await setup(page)
  server.place({ x: START.x, y: START.y + .8, z: START.z })
  await expect(page.getByText('첫 발판부터 바로 도전 · 놀이 방법 F1', { exact: true })).toBeVisible()
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
  await expect(page.getByLabel('점프맵 엽전 현황')).toContainText('이번 2냥')
  await shot(page, 'jumpmap-playing-desktop')
  await page.keyboard.press('F1'); await expect(page.locator('dialog[open], [role="dialog"]').filter({ hasText: '돌탑 점프맵' }).first()).toBeVisible({ timeout: 15000 })
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await probe(page)).wallet.revision).toBe(before + 1)
  expect(server.requests.filter(r => r.type.startsWith('JUMPMAP_'))).toEqual([])
  expect(errors).toEqual([])
})
test('fall and late settlement leave the park free for immediate retry', async ({ page }) => {
  const { server, errors, emit, start } = await setup(page)
  start(); const pad = COURSE[0]!; server.place({ x: pad.x, y: pad.top + .8, z: pad.z })
  emit('JUMPMAP_ENDED', 2, { reason: 'FALL', gatesPassed: 2, maxHeight: 28, elapsedMs: 50000, runCoins: 2, todayEarned: 2 })
  await expect.poll(async () => (await probe(page)).state.result?.reason).toBe('FALL')
  await expect(page.getByRole('dialog', { name: '점프맵 결과' })).toHaveCount(0)
  emit('JUMPMAP_GATE_SETTLED', 3, { gate: 2, coinsGranted: 4, runCoins: 6, todayEarned: 6 })
  await expect.poll(async () => (await probe(page)).state.result?.runCoins).toBe(6)
  await shot(page, 'jumpmap-fall-return')
  expect(server.requests.some(r => /TELEPORT|RESPAWN|JUMPMAP_START/.test(r.type))).toBe(false)
  expect(errors).toEqual([])
})

test('finish, daily cap and recovered run remain readable at 740px', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 900 })
  const activeRun = { runId: 'run-a', elapsedMs: 123000, gatesPassed: 6, finalReached: true, maxHeight: 47, runCoins: 64 }
  const { server, errors, emit } = await setup(page, { ...status, todayEarned: 464, revision: 5, activeRunId: 'run-a', activeRun })
  const pad = COURSE.at(-1)!; server.place({ x: pad.x, y: pad.top + .8, z: pad.z })
  await expect.poll(async () => (await probe(page)).ownPosition?.[1]).toBeCloseTo(pad.top, 1)
  await expect.poll(async () => Math.abs((await probe(page)).camera![1]! - pad.top)).toBeLessThan(12)
  await expect(page.getByLabel('도전 현황')).toContainText('연잎')
  await shot(page, 'jumpmap-playing-narrow')
  emit('JUMPMAP_ENDED', 6, { reason: 'FINISH', gatesPassed: 7, maxHeight: 47, elapsedMs: 145321, runCoins: 100, todayEarned: 500, finishMs: 145321, bestFinishMs: 145321, newBest: true })
  await expect.poll(async () => (await probe(page)).state.todayEarned).toBe(500)
  await expect(page.getByRole('dialog', { name: '점프맵 결과' })).toHaveCount(0)
  await expect(page.getByLabel('마지막 발판 완료')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: '점프맵 완료' })).toBeVisible()
  await expect(page.getByLabel('완주 시간')).toHaveText('2분 25초')
  await shot(page, 'jumpmap-finish-narrow')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
test('stone medals and minute records stay readable while wheel scrolling a long ranking on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 })
  const { server, errors, emit, start } = await setup(page)
  const items = Array.from({ length: 50 }, (_, n) => ({ rank: n + 1, userId: n === 0 ? '101' : String(200 + n),
    nickname: n === 0 ? '돌탑을 오르는 산책자' : `도전자 ${n + 1}`, finishMs: 124910 + n * 6000,
    finishedAt: '2026-11-01T01:00:00Z' }))
  let rankingReads = 0
  await page.route('**/api/v1/minigames/jumpmap/rankings', route => { rankingReads++; return route.fulfill({ json: { items, me: items[0] } }) })
  start()
  emit('JUMPMAP_ENDED', 2, { reason: 'FINISH', gatesPassed: 7, maxHeight: 47, elapsedMs: 124910,
    finishMs: 124910, bestFinishMs: 124910, newBest: true, runCoins: 100, todayEarned: 195 })
  const result = page.getByRole('dialog', { name: '점프맵 완료', exact: true })
  await expect(result.getByLabel('완주 시간')).toHaveText('2분 04초')
  await result.getByRole('button', { name: '타임어택 랭킹 보기' }).click()
  const rankingPage = page.getByRole('dialog', { name: '돌탑 타임어택 랭킹', exact: true })
  await expect(result).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(rankingPage.locator('.jm-ranking-heading .jm-ranking-medal[data-tier="1"]')).toHaveCount(1)
  const ranking = rankingPage.getByRole('list', { name: '완주 기록 순위' })
  await expect(ranking.getByRole('listitem')).toHaveCount(50)
  expect(rankingReads).toBe(1)
  await expect(rankingPage.getByLabel('내 최고 기록').locator('time')).toHaveText('2분 04초')
  expect((await probe(page)).state.result?.finishMs).toBe(124910)
  expect(await ranking.locator('time').allTextContents()).toEqual(items.map(item=>`${Math.floor(item.finishMs/60000)}분 ${String(Math.floor(item.finishMs/1000)%60).padStart(2,'0')}초`))
  await expect(rankingPage.getByRole('button',{name:'타임어택 랭킹 접기',exact:true})).toHaveCount(0)
  expect(await ranking.locator('.jm-ranking-medal').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-tier')))).toEqual(['1', '2', '3'])
  await expect(rankingPage.getByText(/서버가 확인/)).toHaveCount(0)
  expect(await rankingPage.evaluate(node => getComputedStyle(node).scrollbarWidth)).toBe('none')
  expect(await rankingPage.evaluate(node => getComputedStyle(node, '::-webkit-scrollbar').display)).toBe('none')
  if (await rankingPage.evaluate(node => node.scrollHeight > node.clientHeight)) {
    const box = await rankingPage.boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 100)
    await page.mouse.wheel(0, 400)
    await expect.poll(() => rankingPage.evaluate(node => node.scrollTop)).toBeGreaterThan(0)
  }
  await ranking.scrollIntoViewIfNeeded()
  const listBox = await ranking.boundingBox()
  await page.mouse.move(listBox!.x + listBox!.width / 2, listBox!.y + listBox!.height / 2)
  await page.mouse.wheel(0, 4000)
  await expect(ranking.getByRole('listitem').last()).toBeInViewport()
  await ranking.evaluate(node => { node.scrollTop = 0 })
  await rankingPage.evaluate(node => { node.scrollTop = 0 })
  await shot(page, 'jumpmap-ranking-mobile')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await rankingPage.evaluate(node => { node.scrollTop = 0 })
  await shot(page, 'jumpmap-ranking-desktop')
  await page.keyboard.press('Escape')
  await expect(rankingPage).toHaveCount(0)
  await expect(result.getByLabel('완주 시간')).toHaveText('2분 04초')
  const openRankings = result.getByRole('button', { name: '타임어택 랭킹 보기' })
  await expect(openRankings).toBeFocused()
  await shot(page, 'jumpmap-ranking-back-to-result', 'disabled')
  await openRankings.click()
  await expect(ranking.getByRole('listitem')).toHaveCount(50)
  expect(rankingReads).toBe(2)
  await rankingPage.getByRole('button', { name: '랭킹 닫기', exact: true }).click()
  await expect(openRankings).toBeFocused()
  await openRankings.click()
  await expect(rankingPage).toBeVisible()
  await rankingPage.getByRole('button', { name: '결과로 돌아가기', exact: true }).click()
  await expect(openRankings).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(result).toHaveCount(0)
  expect(server.requests.some(request => request.type === 'JUMPMAP_START')).toBe(false)
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

test('first pad starts without E or countdown, and a fall never blocks the next attempt', async ({ page }) => {
  const { server, errors, start, emit } = await setup(page)
  const rankings: string[] = []; page.on('request', r => { if (r.url().includes('/jumpmap/rankings')) rankings.push(r.url()) })
  server.place({ x: START.x, y: START.y + .8, z: START.z })
  await expect(page.getByText('첫 발판부터 바로 도전 · 놀이 방법 F1', { exact: true })).toBeVisible()
  await page.keyboard.press('e')
  const guide=page.getByRole('dialog', { name: '돌탑 점프맵 준비 안내', exact:true })
  await expect(guide).toBeVisible()
  await expect(guide).toContainText('매번 확인하지 않고 첫 발판에서 바로 도전해도 돼요.')
  await page.keyboard.press('Escape')
  await expect(guide).toHaveCount(0)
  await expect(page.locator('.jm-countdown')).toHaveCount(0)
  await expect(page.getByLabel('도전 현황')).toHaveCount(0)
  await page.waitForTimeout(1300); await expect(page.locator('.jm-hint')).toHaveCount(0)
  await shot(page, 'jumpmap-repeat-idle')
  start()
  await expect(page.getByLabel('도전 현황')).toBeVisible()
  await expect(page.getByLabel('도전 현황')).not.toContainText(/경과 시간|최고 기록|랭킹/)
  await shot(page, 'jumpmap-repeat-playing')
  emit('JUMPMAP_ENDED', 2, { reason: 'FALL', gatesPassed: 0, maxHeight: 3.1, elapsedMs: 5000, runCoins: 0 })
  await expect(page.getByLabel('도전 현황')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: '점프맵 결과' })).toHaveCount(0)
  await expect(page.getByText('아쉽게 떨어졌어요', { exact: true })).toHaveCount(0)
  await shot(page, 'jumpmap-repeat-fall')
  await page.locator('canvas').focus()
  const beforeMovement = server.requests.length
  await page.keyboard.down('w')
  try {
    await expect.poll(() => server.requests.slice(beforeMovement).some(r => r.type === 'WORLD_MOVE' && !!(r.payload.dx || r.payload.dz))).toBe(true)
  } finally { await page.keyboard.up('w') }
  emit('JUMPMAP_STARTED', 3, { runId: 'run-b', courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, serverTime: Date.now() })
  await expect(page.getByLabel('도전 현황')).toBeVisible()
  expect((await probe(page)).state.run.runId).toBe('run-b')
  expect(server.requests.some(r => /JUMPMAP_START|TELEPORT|RESPAWN/.test(r.type))).toBe(false)
  expect(rankings).toEqual([]); expect(errors).toEqual([])
})

test('final leaf opens a persistent paper completion, locks movement and updates server rewards without reopening', async ({ page }) => {
  const { server, start, emit, errors } = await setup(page)
  start()
  emit('JUMPMAP_GATE', 2, { gate: 6, elapsedMs: 130000, coinsCalculated: 24, coinsGranted: 24, pending: false, runCoins: 64, todayEarned: 64 })
  const last = COURSE.at(-1)!; server.place({ x: last.x, y: last.top + .8, z: last.z })
  emit('JUMPMAP_FINAL_PAD', 3)
  const complete = page.getByRole('dialog', { name: '점프맵 완료', exact: true })
  await expect(complete).toHaveCount(0)
  emit('JUMPMAP_ENDED', 4, { reason: 'FINISH', gatesPassed: 7, maxHeight: 47, elapsedMs: 145321, runCoins: 64, todayEarned: 464, finishMs: 145321, bestFinishMs: 145321, newBest: true })
  await expect(complete).toBeVisible()
  await expect(complete).toContainText('이번 도전 받은 엽전64냥')
  await complete.locator('img').evaluateAll(imgs => Promise.all(imgs.map(i => (i as HTMLImageElement).decode())))
  await complete.evaluate(e => Promise.all(e.getAnimations().map(a => a.finished)))
  await shot(page, 'jumpmap-paper-completion')
  await page.waitForTimeout(1500); await expect(complete).toBeVisible()
  const beforeMovement = server.requests.length
  await page.keyboard.press('w')
  expect(server.requests.slice(beforeMovement).some(r => r.type === 'WORLD_MOVE' && !!(r.payload.dx || r.payload.dz))).toBe(false)
  emit('JUMPMAP_FINAL_PAD', 5)
  await expect(page.getByRole('dialog', { name: '점프맵 완료' })).toHaveCount(1)
  emit('JUMPMAP_GATE_SETTLED', 6, { gate: 7, coinsGranted: 36, runCoins: 100, todayEarned: 500 })
  await expect(complete).toContainText('이번 도전 받은 엽전100냥')
  await expect(complete.getByLabel('완주 시간')).toHaveText('2분 25초')
  await expect(complete.getByRole('button', { name: '타임어택 랭킹 보기', exact: true })).toBeVisible()
  await page.keyboard.press('Escape'); await expect(complete).toBeHidden()
  emit('JUMPMAP_ENDED', 7, { reason: 'FINISH', gatesPassed: 7, maxHeight: 47, elapsedMs: 145321, runCoins: 100, todayEarned: 500, finishMs: 145321, bestFinishMs: 145321, newBest: true })
  await expect(complete).toHaveCount(0)
  await page.locator('canvas').focus()
  const afterClose = server.requests.length
  await page.keyboard.down('w')
  try { await expect.poll(() => server.requests.slice(afterClose).some(r => r.type === 'WORLD_MOVE' && !!(r.payload.dx || r.payload.dz))).toBe(true) }
  finally { await page.keyboard.up('w') }
  expect(errors).toEqual([])
})

test('server finish completion never repeats and fits the narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 900 })
  const { start, emit, errors } = await setup(page)
  start(); emit('JUMPMAP_FINAL_PAD', 2)
  const complete = page.getByRole('dialog', { name: '점프맵 완료', exact: true })
  await expect(complete).toHaveCount(0)
  emit('JUMPMAP_ENDED', 3, { reason: 'FINISH', gatesPassed: 7, maxHeight: 47, elapsedMs: 145321, runCoins: 100, todayEarned: 500, finishMs: 145321, bestFinishMs: 145321, newBest: true })
  await expect(complete).toBeVisible()
  await expect(complete.getByRole('button', { name: '계속하기', exact: true })).toBeInViewport()
  await complete.getByRole('button', { name: '완료 화면 닫기', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(complete.getByRole('button', { name: '계속하기', exact: true })).toBeFocused()
  await complete.evaluate(e => Promise.all(e.getAnimations().map(a => a.finished)))
  await shot(page, 'jumpmap-paper-completion-narrow')
  await complete.getByRole('button', { name: '계속하기', exact: true }).click()
  await expect(complete).toBeHidden()
  expect((await probe(page)).state.run).toBeNull()
  emit('JUMPMAP_FINAL_PAD', 4); await expect(complete).toHaveCount(0)
  emit('JUMPMAP_ENDED', 5, { reason: 'FINISH', gatesPassed: 7, maxHeight: 47, elapsedMs: 145321, runCoins: 100, todayEarned: 500, finishMs: 145321, bestFinishMs: 145321, newBest: true })
  await expect(complete).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
