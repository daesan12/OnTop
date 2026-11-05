import { expect, test, type Route } from '@playwright/test'
import { fixture } from './contractFixture'

test('루트 지갑 조회는 예약·정산 알림을 합치고 진행 중 응답보다 새 정산을 우선한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await fixture(page)
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: {
    serverTime: new Date().toISOString(), refreshAt: new Date(Date.now() + 10000).toISOString(), announcements: [],
  } }))
  let reads = 0, hold = false, held: Route | undefined, total = 100
  await page.route('**/api/v1/wallets/me', route => {
    reads++
    if (hold) { held = route; return }
    return route.fulfill({ json: { balance: total, reservedBalance: 0, availableBalance: total } })
  })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면', { exact: true })).toBeVisible({ timeout: 90_000 })
  const balance = page.getByLabel('보유 엽전', { exact: true })
  await expect(balance).toHaveText('100냥', { timeout: 30_000 })
  await expect(page.locator('.park-wallet')).toHaveAttribute('aria-busy', 'false')
  const before = reads
  total = 90
  // 승인 상태를 공급하는 store fixture. 시작 상태와 정산 구독이 같은 큐를 쓰는지 확인한다.
  await page.evaluate(async () => {
    const { useGame } = await import('/src/game/store.ts' as string)
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    const { refreshWalletAfterSettlement } = await import('/src/features/wallet/settlementRefresh.ts' as string)
    useGame.setState({ start: { tableId: null, phase: 'NOT_SEATED', revision: 1, startAttemptId: null,
      gameCode: null, gameSessionId: null, code: null, simulation: false } })
    refreshWalletAfterSettlement(useSession.getState().sessionId, 'qa:burst:1')
    refreshWalletAfterSettlement(useSession.getState().sessionId, 'qa:burst:2')
  })
  await expect(balance).toHaveText('90냥')
  await page.waitForTimeout(100) // 25ms 묶음 창 이후 불필요한 추가 조회가 없는지 관찰한다.
  expect(reads - before).toBe(1)

  hold = true
  await page.evaluate(async () => {
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    const { refreshWalletAfterSettlement } = await import('/src/features/wallet/settlementRefresh.ts' as string)
    refreshWalletAfterSettlement(useSession.getState().sessionId, 'qa:held:1')
  })
  await expect.poll(() => !!held).toBe(true)
  total = 70; hold = false
  await page.evaluate(async () => {
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    const { refreshWalletAfterSettlement } = await import('/src/features/wallet/settlementRefresh.ts' as string)
    refreshWalletAfterSettlement(useSession.getState().sessionId, 'qa:held:2')
    refreshWalletAfterSettlement(useSession.getState().sessionId, 'qa:held:3')
  })
  // 느린 이전 GET을 취소하므로 그 응답이 오기 전에도 최신 정산이 반영된다.
  await expect(balance).toHaveText('70냥')
  await held!.fulfill({ json: { balance: 999, reservedBalance: 0, availableBalance: 999 } }).catch(() => {})
  await expect(balance).toHaveText('70냥')
  await page.waitForTimeout(100)
  expect(reads - before).toBe(3) // 진행 중 두 알림도 후속 조회 한 번으로 끝난다.
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
