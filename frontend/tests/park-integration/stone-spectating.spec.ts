import { expect, test } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'
import { PARK_LAYOUT } from '../../src/map/park'
import { PARK_MAP_VERSION } from '../../src/map/park/generated/mapVersion'

const tables = [
  PARK_LAYOUT.DRAFT_TABLES.find(t => t.assetId === 'procedural/stone-game-table')!,
  PARK_LAYOUT.DRAFT_TABLES.find(t => t.picnicId)!,
  ...PARK_LAYOUT.DRAFT_TABLES.filter(t => t.assetId === 'procedural/vr-stone-game-table'),
]

for (const anchor of tables) test(`${anchor.id}: 돌 테이블은 정보 팝업 없이 진행 경기만 관전하고 종료 시 복귀한다`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const server = await fixture(page, { generatedPark: true, anchorId: anchor.id, ownUserId: '505',
    publicSpectator: true, omok: true, spectatorEvents: true, manualMovement: true,
    position: { x: anchor.position[0], y: anchor.position[1] + .8, z: anchor.position[2] + 3, yaw: Math.PI } })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page).toHaveURL(/\/park$/)
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().mapVersion), { timeout: 90000 }).toBe(PARK_MAP_VERSION)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  const hint = page.getByRole('complementary', { name: '가까운 상호작용' })
  await expect(hint).toHaveAttribute('data-target-id', anchor.id)
  await expect(hint.getByRole('button', { name: 'E 관전하기', exact: true })).toBeEnabled()
  await screenshot(page, `stone-entry-${anchor.id}`)
  await page.setViewportSize({ width: 740, height: 900 })
  const entry = hint.getByRole('button', { name: 'E 관전하기', exact: true })
  await expect(entry).toBeInViewport()
  expect(await entry.evaluate(element => {
    const box = element.getBoundingClientRect()
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
  })).toBe(true)
  await screenshot(page, `stone-entry-narrow-${anchor.id}`)
  await page.setViewportSize({ width: 1920, height: 1080 })
  const info = page.getByRole('dialog', { name: '테이블 정보', exact: true })
  expect(server.sent.filter(r => r.type === 'TABLE_JOIN')).toHaveLength(0)
  expect(server.sent.filter(r => r.type === 'GAME_WATCH')).toHaveLength(0)
  let watchRequests = 1
  if (anchor === tables[0]) {
    server.rejectGameWatch(true)
    await entry.click()
    await expect.poll(() => page.evaluate(async () => (await import('/src/features/tableLobby/state.ts' as string)).useTableLobby.getState().spectatorStatus)).toBe('error')
    expect(await page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game?.role)).not.toBe('SPECTATOR')
    server.rejectGameWatch(false)
    // Current runtime clears the rejected table subscription and closes its dialog.
    // Retry through the visible park entry so a new server watch is approved first.
    await expect(info).toBeHidden()
    watchRequests++
  }
  await entry.click()
  await expect(info).toHaveCount(0)
  const role = () => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game?.role)
  await expect.poll(role).toBe('SPECTATOR')
  expect(server.sent.filter(r => r.type === 'GAME_WATCH')).toHaveLength(watchRequests)
  expect(server.sent.filter(r => r.type === 'GAME_ACTION_SEND')).toHaveLength(0)
  const chat = page.getByLabel('경기 채팅 메시지')
  await page.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
  await expect(chat).toBeEnabled()
  await chat.fill('돌 테이블에서도 같이 봐요')
  await page.keyboard.press('Enter')
  expect(server.sent.filter(r => r.type === 'GAME_SPECTATOR_CHAT_SEND')).toHaveLength(1)
  expect(server.sent.filter(r => r.type === 'WORLD_CHAT_SEND')).toHaveLength(0)
  await page.keyboard.press('Escape')
  let previous: number[] | null = null
  await expect.poll(async () => {
    const position: number[] = await page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).cameraPosition())
    const delta = previous ? Math.hypot(...position.map((n, i) => n - previous![i]!)) : Infinity
    previous = position
    return delta
  }).toBeLessThan(.005)
  const point = await page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).omokPlayProbe(7, 7))
  expect(point).not.toBeNull()
  await page.mouse.click(point!.point.x, point!.point.y)
  await expect.poll(() => server.sent.filter(r => r.type === 'OMOK_SPECTATOR_PING_SEND').length).toBe(1)
  expect(server.sent.filter(r => r.type === 'GAME_ACTION_SEND')).toHaveLength(0)
  await screenshot(page, `stone-spectator-${anchor.id}`)
  server.finishGame()
  await expect.poll(() => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().watchedGameId)).toBe('')
  expect(server.sent.filter(r => r.type === 'GAME_UNWATCH')).toHaveLength(watchRequests)
  if (anchor === tables[0]) {
    server.publicMatch(null)
    await entry.click()
    await expect(page.getByRole('button', { name: 'E 관전 대기 취소', exact: true })).toBeVisible()
    await expect(info).toHaveCount(0)
    expect(server.sent.filter(r => r.type === 'GAME_WATCH')).toHaveLength(watchRequests)
  }
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
