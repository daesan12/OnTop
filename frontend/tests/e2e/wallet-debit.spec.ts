import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

for (const outcome of ['loss', 'win', 'refund', 'missed-loss'] as const) {
test(`판돈 예약과 ${outcome} 정산을 새로고침 없이 잔액에 반영한다`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`) })
  const server = await fixture(page, { omok: true })
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: {
    serverTime: new Date().toISOString(), refreshAt: new Date(Date.now() + 10000).toISOString(), announcements: [],
  } }))
  let total = 100, reserved = 0
  await page.route('**/api/v1/wallets/me', route => route.fulfill({ json: {
    balance: total, reservedBalance: reserved, availableBalance: total - reserved,
  } }))
  await page.goto('/park')
  await expect(page).toHaveTitle(/OnTop/)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  const balance = page.getByLabel('보유 엽전', { exact: true })
  await expect(balance).toHaveText('100냥')
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  // 공통 지갑 검증에서는 서버 fixture로 판돈 설정을 확정한다.
  server.configureTablet({ gameCode: 'OMOK', playerCount: 2, betAmountPerPlayer: 30 })
  reserved = 30
  server.confirmStart()
  // 경기 화면이 공원 HUD를 숨겨도 예약 조회는 계속 동작해야 한다.
  await expect.poll(() => page.evaluate(async () => {
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    return (useSession.getState().account as { reservedBalance?: number })?.reservedBalance
  })).toBe(30)
  server.finishGame('NORMAL', outcome === 'win' ? '101' : '102')
  await expect(balance).toHaveText('70냥')
  await expect(balance).toHaveAttribute('title', /30냥 예약 중/)
  total = outcome === 'win' ? 130 : outcome === 'refund' ? 100 : 70; reserved = 0
  if (outcome === 'refund') server.notifyResult(server.storeInvalidResult('SETTLED'))
  else if (outcome === 'missed-loss') server.nextRound() // 정산 push를 놓쳐도 WAITING 전환에서 복구한다.
  else { server.settle(); server.settle() } // 중복 영수증도 금액을 재계산하지 않는다.
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/network/worldClient.ts' as string)).useSession.getState().account?.balance)).toBe(total)
  await expect(balance).toHaveText(`${total}냥`) // 예약 해제 때 이중 차감하지 않는다.
  await expect(balance).not.toHaveAttribute('title', /예약 중/)
  await screenshot(page, `wallet-debit-${outcome}`)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
}
