import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import { parkFixture } from '../park-integration/fixture'
import { screenshot } from '../e2e/contractFixture'

test('컴플레인은 붉은 말풍선과 경고로 표시하고 원래 주문으로 돌아온다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const server = await parkFixture(page)
  await page.goto('/park')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  const stand = await page.evaluate(async () => {
    const { bungeoppangService } = await import('/src/features/bungeoppang/service.ts' as string)
    const { createV5PreviewService } = await import('/src/features/bungeoppang/serviceV5Preview.ts' as string)
    Object.assign(bungeoppangService, createV5PreviewService(() => .5))
    const { bungeoppangView: view } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string)
    return { x: view.standX, y: .8, z: view.standZ, yaw: Math.PI }
  })
  server.place(stand)
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click()
  await expect(page.getByRole('button', { name: '시작', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await expect(page.locator('.bung25-order[data-stage="request"]')).toBeVisible({ timeout: 15000 })
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
    const grill = useBungeoppang.getState().grill
    useBungeoppang.setState({ grill: { ...grill, score: grill.score - 5, complainedOrderIds: [grill.activeOrders[0].orderId] } })
  })
  const warning = page.locator('.bung25-order[data-complaint="true"]')
  await expect(warning.getByRole('alert')).toContainText('컴플레인 −5점')
  await expect(warning.locator('.bung25-cloud-body')).toHaveCSS('fill', 'rgb(133, 46, 37)')
  await screenshot(page, 'bungeoppang-polish-complaint')
  await expect(warning).toHaveCount(0, { timeout: 5000 })
  await expect(page.getByLabel('주문 요약', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('지급음은 결과 화면의 지급 문구가 보일 때 한 번만 재생한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const bytes = (await fs.stat(new URL('../../public/audio/bgm/coin-gain.ogg', import.meta.url))).size
  await page.addInitScript(bytes => {
    const buffers = new WeakSet<AudioBuffer>(), decode = AudioContext.prototype.decodeAudioData
    const events: { result: boolean; arrived: string | null }[] = []
    ;(window as unknown as { coinEvents: typeof events }).coinEvents = events
    AudioContext.prototype.decodeAudioData = async function(data: ArrayBuffer) {
      const coin = data.byteLength === bytes, buffer = await decode.call(this, data)
      if (coin) buffers.add(buffer)
      return buffer
    }
    const create = AudioContext.prototype.createBufferSource
    AudioContext.prototype.createBufferSource = function() {
      const source = create.call(this), start = source.start.bind(source)
      source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
        if (source.buffer && buffers.has(source.buffer)) events.push({
          result: !!document.querySelector('[aria-label="붕어빵 결과"]'),
          arrived: document.querySelector('.reward-coin-flight')?.getAttribute('data-arrived') ?? null })
        return start(...args)
      }
      return source
    }
  }, bytes)
  await parkFixture(page)
  await page.route('**/api/v1/minigames/bungeoppang/rankings?**', route => route.fulfill({ json: {
    rulesVersion: 'v5', durationMs: 120000, period: 'ALL_TIME', basis: 'PERSONAL_BEST', snapshotId: 'polish-ranking',
    updatedAt: '2026-11-01T00:00:00Z', totalParticipants: 1, nextCursor: null,
    items: [{ rank: 1, userId: '101', nickname: '붕어빵 장인', score: 120, maxCombo: 4, completedAt: '2026-11-01T00:00:00Z' }],
    me: { rank: 1, userId: '101', nickname: '붕어빵 장인', score: 120, maxCombo: 4, completedAt: '2026-11-01T00:00:00Z' } } }))
  await page.goto('/park')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.locator('canvas').click()
  const sounds = () => page.evaluate(() => (window as unknown as { coinEvents: { result: boolean; arrived: string | null }[] }).coinEvents)
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
    const { createGrill } = await import('/src/features/bungeoppang/rulesV5.ts' as string)
    const { BUNGEOPPANG_V5: rules } = await import('/src/features/bungeoppang/config.ts' as string)
    const grill = { ...createGrill(Array(rules.heatListLength).fill(100), [{ orderId: '1', orderIndex: 0, customerSlot: 0,
      availableAfterSeq: 0, items: { bean: 2, custard: 0, pizza: 0, chocolate: 0 } }], rules), made: 8, score: 120 }
    useBungeoppang.setState({ phase: 'ending', gameId: 'coin-polish-qa', rules, grill, submitting: false,
      result: { score: 120, maxCombo: 4, made: 8, golden: 6, failed: 0, wasted: 0,
        coinsCalculated: 8, coinsGranted: 8, todayEarned: 8, dailyCap: 500, capReached: false } })
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    const session = useSession.getState()
    useSession.setState({ account: { ...session.account!, balance: session.account!.balance + 8 } })
  })
  await page.waitForTimeout(350)
  expect(await sounds()).toEqual([])
  await page.evaluate(async () => (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.setState({ phase: 'result' }))
  await expect(page.getByRole('dialog', { name: '붕어빵 결과', exact: true })).toBeVisible()
  await expect.poll(async () => (await sounds()).length).toBe(1)
  expect((await sounds())[0]!.result).toBe(true)
  await screenshot(page, 'bungeoppang-polish-reward-medal')
  await page.getByRole('button', { name: '랭킹 보기', exact: true }).click()
  await expect(page.getByText(/서버 확정 기록 기준/)).toHaveCount(0)
  await expect(page.locator('.bung-ranking-fish')).toBeVisible()
  await screenshot(page, 'bungeoppang-polish-ranking-medal', 'disabled')
  await page.getByRole('button', { name: '랭킹 닫기', exact: true }).click()
  await page.waitForTimeout(1300)
  expect((await sounds()).length).toBe(1)
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
    const result = useBungeoppang.getState().result!
    useBungeoppang.setState({ gameId: 'coin-polish-zero', result: { ...result, coinsCalculated: 0, coinsGranted: 0 } })
  })
  await expect(page.getByText('받은 엽전 0냥', { exact: true })).toBeVisible()
  await page.waitForTimeout(350)
  expect((await sounds()).length).toBe(1)
  expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
