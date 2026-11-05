import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

async function loaded(page: Page) {
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
    mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
    version: 1, updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(),
  } }))
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 90_000 })
  await expect(page.locator('.avatar-overhead').first()).toBeAttached({ timeout: 90_000 })
}
async function watch(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const s = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    return s.status === 'connected' && s.mapCompatible && s.bindings.length > 0 && s.tables.length > 0 && !s.pending
  })).toBe(true)
  expect(await page.evaluate(async () => {
    const { parkRuntime: runtime } = await import('/src/park/runtime/runtime.ts' as string)
    const { TABLES } = await import('/src/park/mapConfig.ts' as string)
    if (!await runtime.watchTable(TABLES[0].id, false)) return false
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    const s = useSession.getState()
    const { publicMatchService } = await import('/src/features/tableLobby/publicMatch.ts' as string)
    const ref = publicMatchService.find({ channelId: s.roomId, tableId: s.watchedTableId })
    return ref ? runtime.watchGame(ref.gameId) : false
  })).toBe(true)
}

test('Enter sends once, releases chat controls, Escape preserves draft and focus returns to canvas', async ({ page }) => {
  const server = await fixture(page)
  await loaded(page)
  await page.locator('canvas').focus()
  await page.keyboard.press('Enter')
  const input = page.getByRole('textbox', { name: '주변 채팅 메시지', exact: true })
  await input.fill('한 번만 전송')
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 })
  expect(server.sent.filter(m => m.type === 'WORLD_CHAT_SEND')).toHaveLength(0)
  await input.press('Enter')
  await expect(input).toHaveCount(0)
  expect(server.sent.filter(m => m.type === 'WORLD_CHAT_SEND')).toHaveLength(1)
  await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.press('Enter')
  await input.fill('보관할 초안')
  await input.press('Escape')
  await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('보관할 초안')
  server.rejectChat()
  await input.press('Enter')
  await expect(input).toHaveValue('보관할 초안')
  await expect(input).toBeEditable()
  await expect(page.locator('.park-chat__notice')).toContainText('내용을 보관')
  await input.press('Escape')
  await expect(page.locator('canvas')).toBeFocused()
})

test('spectator Enter finishes editing, exit releases table focus and G opens the fart wheel again', async ({ page }) => {
  const server = await fixture(page, { omok: true, publicSpectator: true, ownUserId: '505', spectatorEvents: true, emoteBindings: 'development' })
  await loaded(page)
  await watch(page)
  await page.locator('canvas').focus()
  await page.keyboard.press('Enter')
  const input = page.locator('.park-chat input')
  await input.fill('관전 중 전송')
  await input.press('Enter')
  await expect(page.locator('canvas')).toBeFocused()
  expect(server.sent.filter(m => m.type === 'GAME_SPECTATOR_CHAT_SEND')).toHaveLength(1)
  expect(server.sent.some(m => m.type === 'WORLD_CHAT_SEND')).toBe(false)
  await screenshot(page, 'chat-spectator-sent')
  await page.locator('.game-hud-menu summary').click()
  await page.getByRole('button', { name: '관전 종료', exact: true }).click()
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().focusedAnchorId)).toBe('')
  await page.keyboard.down('KeyG')
  await expect(page.getByRole('dialog', { name: '감정표현 선택' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.up('KeyG')
  await page.getByRole('button', { name: '감정표현 열기' }).click()
  await page.getByRole('button', { name: /방귀 뿡/ }).click()
  await expect.poll(() => server.sent.some(m => m.type === 'WORLD_EMOTE_SEND' && m.payload.emoteCode === 'FART')).toBe(true)
  await screenshot(page, 'chat-after-watch-fart')
})

test('exiting a standing watch releases the hidden table focus without opening chat', async ({ page }) => {
  await fixture(page, { omok: true, publicSpectator: true, ownUserId: '505', spectatorEvents: true, emoteBindings: 'development' })
  await loaded(page)
  await watch(page)
  await page.locator('.game-hud-menu summary').click()
  await page.getByRole('button', { name: '관전 종료', exact: true }).click()
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().focusedAnchorId)).toBe('')
  await page.keyboard.down('KeyG')
  await expect(page.getByRole('dialog', { name: '감정표현 선택' })).toBeVisible()
  await page.keyboard.press('Escape'); await page.keyboard.up('KeyG')
})
