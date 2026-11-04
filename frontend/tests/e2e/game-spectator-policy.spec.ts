import { test, expect } from '@playwright/test'
import { fixture } from './contractFixture'
import { facilityCatalog } from '../fixtures/facilityCatalog'
import { benchTable } from '../../src/features/interactions/benchSpectator'

for (const kind of ['omok', 'onecard', 'dice', 'bridge'] as const) test(`${kind}: spectators lock park menus, keep chat private and exit with Escape`, async ({ page }) => {
  const bench = facilityCatalog.facilities.find(f => f.kind === 'BENCH' && benchTable(f.facilityId)?.pavilionId === 'P1')!
  const anchor = benchTable(bench.facilityId)!, errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const server = await fixture(page, { omok: true, ownUserId: '505', players: 4, publicSpectator: true,
    onecard: kind === 'onecard' ? 4 : undefined, bridge: kind === 'bridge' ? 4 : undefined,
    dice: kind === 'dice', spectatorEvents: true, manualMovement: true, position: bench.center, anchorId: anchor.id })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => {
    const session = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    return session.status === 'connected' && session.bindings.length > 0
  }), { timeout: 20000 }).toBe(true)
  await expect.poll(() => page.evaluate(async () => (await import('/src/features/facilities/state.ts' as string)).useFacilityState.getState().ready)).toBe(true)
  expect(await page.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id, 0), bench.facilityId)).toBe(true)
  await page.getByRole('button', { name: '가까이 관전', exact: true }).click()
  await expect.poll(() => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game?.role)).toBe('SPECTATOR')
  for (const name of ['공원 지도', '옷장']) {
    const button = page.getByRole('button', { name, exact: true })
    if (await button.count()) await expect(button).toBeDisabled()
  }
  expect(await page.evaluate(async () => {
    const map = await import('/src/features/navigation/navigationState.ts' as string)
    const wardrobe = await import('/src/features/wardrobe/state.ts' as string)
    map.openParkMap(); wardrobe.openWardrobe()
    return { map: map.useParkMap.getState().open, wardrobe: wardrobe.useWardrobe.getState().open }
  })).toEqual({ map: false, wardrobe: false })
  await expect(page.getByRole('region', { name: '주변 채팅', exact: true })).toHaveCount(0)
  const text = `이 경기만 ${kind}`
  await page.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
  await page.getByRole('textbox', { name: '경기 채팅 메시지', exact: true }).fill(text)
  await page.keyboard.press('Enter')
  if (kind === 'omok') await expect(page.locator('.omok-floating-chat')).toContainText(text)
  else await expect(page.getByRole('region', { name: '경기 채팅', exact: true }).getByText(text, { exact: true })).toBeVisible()
  expect(server.sent.filter(message => message.type === 'GAME_SPECTATOR_CHAT_SEND')).toHaveLength(1)
  expect(server.sent.filter(message => message.type === 'WORLD_CHAT_SEND')).toHaveLength(0)
  await page.keyboard.press('Escape') // Editing/history closes before the spectator session.
  await expect.poll(() => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game?.role)).toBe('SPECTATOR')
  await page.locator('canvas').focus(); await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().watchedGameId)).toBe('')
  await expect(page.getByText(text, { exact: true })).toHaveCount(0)
  expect(server.sent.filter(message => message.type === 'GAME_UNWATCH')).toHaveLength(1)
  expect(errors).toEqual([])
})
