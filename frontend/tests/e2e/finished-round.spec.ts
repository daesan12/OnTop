import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

for (const code of ['OMOK', 'DICE', 'ONE_CARD', 'LIAR_BRIDGE'] as const) {
  test(`${code}: delayed completed recovery permits next-round configuration and approved exit`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const server = await fixture(page, { omok: true, manualMovement: true, manualLobby: true, tabletServer: true,
      ...(code === 'DICE' ? { dice: true } : code === 'ONE_CARD' ? { m09: true, onecard: 2 } : code === 'LIAR_BRIDGE' ? { m09: true, bridge: 2 } : {}) })
    await page.goto('/park')
    await expect(page).toHaveTitle('OnTop')
    await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
    await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
    await expect.poll(() => page.evaluate(async () => {
      const { useSession, avatars } = await import('/src/network/worldClient.ts' as string)
      const s = useSession.getState()
      return s.status === 'connected' && s.mapCompatible && avatars.has(s.sessionId) && !s.pending && s.tables.length > 0
    })).toBe(true)
    expect(await page.evaluate(async () => (await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.joinTable('table-1'))).toBe(true)
    const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
    await expect(tablet).toBeVisible({ timeout: 20_000 })
    server.configureTablet({ gameCode: code, playerCount: 2, betAmountPerPlayer: 1, ...(code === 'DICE' ? { targetScore: 4000 } : {}) })
    server.confirmStart()
    await expect.poll(() => page.evaluate(async () => !!(await import('/src/game/store.ts' as string)).useGame.getState().game)).toBe(true)
    server.finishGame()
    const terminal = { status: 'FINISHED' as const, stage: 'FINISHED' as const, turnUserId: null, turnDeadline: null, endedAt: new Date().toISOString() }
    if (code === 'DICE') server.diceSnapshot({ ...terminal, winnerUserId: '101', endReason: 'TARGET_REACHED' })
    if (code === 'ONE_CARD') server.cardSnapshot({ ...terminal, winnerUserIds: ['101'], endReason: 'EMPTY_HAND' })
    if (code === 'LIAR_BRIDGE') server.bridgeSnapshot({ ...terminal, responderUserId: null, winnerUserIds: ['101'], endReason: 'THREE_GOALS' })
    server.settle(); server.nextRound()
    const result = page.getByRole('dialog', { name: '경기 결과', exact: true })
    await expect(result.getByRole('button', { name: '다음 판 준비', exact: true })).toBeEnabled()
    server.restoreGame()
    await expect.poll(() => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().recovery)).toBe('LOBBY')
    await result.getByRole('button', { name: '다음 판 준비', exact: true }).click()
    await expect(tablet).toBeVisible()
    await expect(result).toHaveCount(0)
    await tablet.getByRole('button', { name: '게임·판돈 변경', exact: true }).click()
    const next = code === 'OMOK' ? 'ONE_CARD' : 'OMOK'
    await tablet.locator(`.tablet-game-card:has([data-game="${next}"])`).click()
    await tablet.getByLabel('1인 참가비', { exact: true }).fill('1')
    await tablet.getByRole('button', { name: '선택하고 준비하기', exact: true }).click()
    await expect(tablet).toHaveAttribute('data-stage', 'ready')
    expect(server.sent.filter(message => message.type === 'TABLE_CONFIGURE')).toHaveLength(1)
    expect(server.sent.find(message => message.type === 'TABLE_CONFIGURE')!.payload.gameCode).toBe(next)
    server.restoreGame(); server.settle(); server.flushGame()
    await expect(tablet).toBeVisible()
    await expect(result).toHaveCount(0)
    await expect(tablet.getByRole('alert')).toHaveCount(0)
    await screenshot(page, `finished-round-${code.toLowerCase()}-configured`)
    await tablet.getByRole('button', { name: '일어나기', exact: true }).click()
    await expect(tablet).toBeHidden()
    await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().tableId)).toBe('')
    expect(server.sent.filter(message => message.type === 'TABLE_LEAVE')).toHaveLength(1)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}
