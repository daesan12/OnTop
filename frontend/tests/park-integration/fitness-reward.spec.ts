import { expect, test } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
import { parkFixture, identity } from './fixture'
import { PARK_DATA } from '../../src/map/park'

test('latest-map fitness entry shows reward terms, refreshes confirmed money once, and permits exit', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const server = await parkFixture(page, { fitnessRewardsEnabled: true })
  // 실제 Web Audio 재생 경로를 관찰하며 네이티브 연결·재생은 그대로 실행한다.
  await page.addInitScript(() => {
    const gains = new WeakMap<AudioBufferSourceNode, GainNode>()
    const samples: number[] = []
    Object.assign(window, { rewardSoundGains: samples })
    const connect = AudioNode.prototype.connect, start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.connect = function(destination: AudioNode, ...args: number[]) {
      if (destination instanceof GainNode) gains.set(this, destination)
      return Reflect.apply(connect, this, [destination, ...args])
    }
    AudioBufferSourceNode.prototype.start = function(...args: Parameters<typeof start>) {
      const gain = gains.get(this)
      if (!this.loop && gain) samples.push(gain.gain.value)
      return Reflect.apply(start, this, args)
    }
  })
  let balance = 100
  await page.route('**/api/v1/wallets/me', route => route.fulfill({ json: {
    balance, reservedBalance: 0, availableBalance: balance,
  } }))
  let earned = 12
  await page.route('**/api/v1/world/fitness/rewards/status', async route => {
    const leaseId = await page.evaluate(async () => (await import('/src/features/facilities/state.ts' as string)).useFacilityState.getState().occupancies['101']?.leaseId ?? null)
    await route.fulfill({ json: { enabled: true, earningsDate: new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10),
      todayEarned: earned, dailyCap: 300, rewardIntervalSeconds: 60, serverNow: Date.now(),
      nextRewardAt: earned >= 300 ? null : Date.now() + 37000, activeLeaseId: leaseId } })
  })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length), { timeout: 90000 }).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(async () => (await import('/src/features/facilities/state.ts' as string)).useFacilityState.getState().ready)).toBe(true)
  expect(await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().mapVersion)).toBe(identity.mapVersion)
  const station = PARK_DATA.interactions.fitness[0]!
  server.place({ x: station.position[0], y: station.position[1] + .8, z: station.position[2] })
  const hint = page.getByRole('complementary', { name: '가까운 상호작용' })
  await expect(hint).toHaveAttribute('data-target-id', station.id)
  await hint.getByRole('button').click()
  await expect(hint).toContainText('실제 1분당 1냥')
  await expect(hint.getByLabel('운동기구 수입')).toContainText('12 / 300냥')
  await expect(hint.getByLabel('운동기구 수입')).toHaveText('실제 1분당 1냥12 / 300냥')
  const revision = () => page.evaluate(async () => (await import('/src/features/wallet/settlementRefresh.ts' as string)).useWalletSettlement.getState().revision)
  const before = await revision()
  const receipt = { userId: '101', receipt: 'fitness:01234567-89ab-cdef-0123-456789abcdef:1' }
  const soundGains = () => page.evaluate(() => (window as unknown as { rewardSoundGains: number[] }).rewardSoundGains)
  const quietCount = async () => (await soundGains()).filter(gain => Math.abs(gain - .35) < .00001).length
  const quietBefore = await quietCount()
  earned = 13
  balance = 101
  server.emit('FITNESS_REWARD', receipt)
  await expect.poll(revision).toBe(before + 1)
  await expect(hint.getByLabel('운동기구 수입')).toContainText('13 / 300냥')
  await expect(hint.getByLabel('운동기구 수입')).toHaveText('실제 1분당 1냥13 / 300냥')
  await expect.poll(quietCount).toBe(quietBefore + 1)
  server.emit('FITNESS_REWARD', receipt)
  await expect.poll(revision).toBe(before + 1)
  expect(await quietCount()).toBe(quietBefore + 1)
  const normalBefore = (await soundGains()).filter(gain => Math.abs(gain - .5) < .00001).length
  balance = 102
  await page.evaluate(async () => (await import('/src/features/wallet/settlementRefresh.ts' as string))
    .refreshWalletAfterSettlement('101', 'jumpmap:audio-regression:1'))
  await expect.poll(async () => (await soundGains()).filter(gain => Math.abs(gain - .5) < .00001).length).toBe(normalBefore + 1)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.screenshot({ path: path.join(process.env.QA_ARTIFACT_DIR ?? os.tmpdir(), 'fitness-reward.png') })
  await page.setViewportSize({ width: 740, height: 900 })
  await expect(hint).toBeInViewport()
  expect(await hint.evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(290)
  expect(await hint.evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(130)
  const rewardText = hint.getByText('실제 1분당 1냥', { exact: true })
  expect(await rewardText.evaluate(element => {
    const box = element.getBoundingClientRect()
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
  })).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: path.join(process.env.QA_ARTIFACT_DIR ?? os.tmpdir(), 'fitness-reward-narrow.png') })
  for (const viewport of [{ width: 390, height: 844 }, { width: 800, height: 450 }]) {
    await page.setViewportSize(viewport)
    await expect(hint).toBeInViewport()
    expect(await hint.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    const total = hint.locator('.fitness-reward-total strong')
    await total.scrollIntoViewIfNeeded()
    expect(await total.evaluate(element => {
      const box = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
    })).toBe(true)
    await hint.getByLabel('운동기구 수입').focus()
    await page.keyboard.press('End')
    await expect(rewardText).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ animations: 'disabled', path: path.join(process.env.QA_ARTIFACT_DIR ?? os.tmpdir(), `fitness-reward-${viewport.width}.png`) })
  }
  await page.setViewportSize({ width: 740, height: 900 })
  earned = 300
  server.emit('FITNESS_REWARD', { ...receipt, receipt: 'fitness:01234567-89ab-cdef-0123-456789abcdef:2' })
  await expect(hint.getByLabel('운동기구 수입')).toHaveText('실제 1분당 1냥300 / 300냥')
  await expect(hint).not.toContainText('다음 1냥까지')
  await hint.getByLabel('운동기구 수입').blur()
  await page.keyboard.press('KeyW')
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().fitnessId)).toBe('')
  expect(errors).toEqual([])
})

test('운동 수입은 조회 중 알림을 모아 재조회하고 30초 백업으로 누락을 복구한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const server = await parkFixture(page, { fitnessRewardsEnabled: true })
  let earned = 12, active = 0, maxActive = 0, holdNext = false, failNext = false
  let release: (() => void) | undefined
  const requests: number[] = []
  await page.route('**/api/v1/world/fitness/rewards/status', async route => {
    requests.push(Date.now())
    maxActive = Math.max(maxActive, ++active)
    const captured = earned, fail = failNext
    failNext = false
    if (holdNext) {
      holdNext = false
      await new Promise<void>(resolve => { release = resolve })
    }
    try {
      const leaseId = await page.evaluate(async () => (await import('/src/features/facilities/state.ts' as string))
        .useFacilityState.getState().occupancies['101']?.leaseId ?? null)
      await route.fulfill(fail ? { status: 503, json: { code: 'FITNESS_UNAVAILABLE' } } : { json: {
        enabled: true, earningsDate: new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10),
        todayEarned: captured, dailyCap: 300, rewardIntervalSeconds: 60, serverNow: Date.now(),
        nextRewardAt: Date.now() + 60000, activeLeaseId: leaseId,
      } })
    } finally { active-- }
  })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length), { timeout: 90000 }).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(async () => (await import('/src/features/facilities/state.ts' as string)).useFacilityState.getState().ready)).toBe(true)
  const station = PARK_DATA.interactions.fitness[0]!
  server.place({ x: station.position[0], y: station.position[1] + .8, z: station.position[2] })
  const hint = page.getByRole('complementary', { name: '가까운 상호작용' })
  await expect(hint).toHaveAttribute('data-target-id', station.id)
  await hint.getByRole('button').click()
  const total = hint.getByLabel('운동기구 수입')
  await expect(total).toContainText('12 / 300냥')
  // 개발 모드 StrictMode의 초기 마운트·취소 요청은 갱신 경쟁 측정에서 제외한다.
  await expect.poll(() => active).toBe(0)
  const initialRequests = requests.length
  maxActive = 0
  const notify = (interval: number) => server.emit('FITNESS_REWARD', {
    userId: '101', receipt: `fitness:01234567-89ab-cdef-0123-456789abcdef:${interval}`,
  })
  const revision = () => page.evaluate(async () => (await import('/src/features/wallet/settlementRefresh.ts' as string)).useWalletSettlement.getState().revision)
  const before = await revision()
  earned = 13; holdNext = true
  notify(1)
  await expect.poll(() => requests.length).toBe(initialRequests + 1)
  await expect.poll(() => !!release).toBe(true)
  earned = 15
  notify(2); notify(3)
  await expect.poll(revision).toBe(before + 3)
  expect(requests).toHaveLength(initialRequests + 1)
  release!(); release = undefined
  await expect(total).toContainText('15 / 300냥')
  expect(requests).toHaveLength(initialRequests + 2)
  expect(maxActive).toBe(1)

  // 지급 알림이 누락되어도 5초·15초가 아닌 30초 백업 조회가 수입을 복구한다.
  earned = 16
  await expect.poll(() => requests.length, { timeout: 35000 }).toBe(initialRequests + 3)
  expect(requests[initialRequests + 2]! - requests[initialRequests - 1]!).toBeGreaterThanOrEqual(29000)
  await expect(total).toContainText('16 / 300냥')

  // 실패하는 요청 중 받은 알림도 버리지 않고 요청 종료 후 다시 확인한다.
  holdNext = true; failNext = true
  notify(4)
  await expect.poll(() => !!release).toBe(true)
  earned = 17
  notify(5)
  await expect.poll(revision).toBe(before + 5)
  release!(); release = undefined
  await expect(total).toContainText('17 / 300냥')
  expect(requests).toHaveLength(initialRequests + 5)
  expect(maxActive).toBe(1)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.screenshot({ path: path.join(process.env.QA_ARTIFACT_DIR ?? os.tmpdir(), 'fitness-reward-refresh.png') })
  await page.keyboard.press('KeyW')
  await expect(total).toHaveCount(0)
  expect(errors).toEqual([])
})
