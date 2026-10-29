import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fixture } from './contractFixture'
import type { Card } from '../../src/game/onecard/protocol'

async function shot(page: Page, name: string) {
  const dir = process.env.ONECARD_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'ontop-onecard-controls')
  await fs.mkdir(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, name + '.png'), animations: 'disabled' })
}
async function start(page: Page, count: 2 | 3 = 2) {
  const server = await fixture(page, { omok: true, m09: true, onecard: count, players: count, forfeit: true, onecardPranks: true, spectatorEvents: true })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => {
    const state = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    return state.status === 'connected' && state.bindings.length > 0
  }), { timeout: 20000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(page.getByRole('button', { name: '공원 지도', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '공원 지도', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '공원 지도창', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /테이블에 앉기/ }).click()
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
  await page.getByLabel('1인 참가비').fill('1'); await page.getByRole('button', { name: '원카드 선택', exact: true }).click()
  await page.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  await expect(page.getByRole('timer', { name: '차례 남은 시간' })).toBeVisible()
  return server
}
async function iconInsideComposer(page: Page, open: boolean) {
  const composer = page.locator('.park-chat__composer')
  const icon = open ? composer.getByRole('button', { name: '메시지 보내기', exact: true }) : composer.locator('.park-chat__send-icon')
  const outer = (await composer.boundingBox())!, inner = (await icon.boundingBox())!
  expect(inner.x).toBeGreaterThanOrEqual(outer.x); expect(inner.y).toBeGreaterThanOrEqual(outer.y)
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + .5)
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + .5)
}

test('game chat keeps long history and both composer states inside the panel on desktop and mobile', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const server = await start(page), chat = page.getByRole('region', { name: '경기 채팅', exact: true })
  await expect(page.getByRole('button', { name: '드로우', exact: true })).toBeEnabled()
  for (let index = 0; index < 20; index++) server.spectatorEvent('chat', {
    senderUserId: '102', text: `대화 ${index + 1} ${'긴 메시지도 채팅창 안에서 줄을 바꾸며 읽을 수 있어야 해요. '.repeat(4)}`.trim(),
  })
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await iconInsideComposer(page, false)
    await chat.getByRole('button', { name: '채팅 기록 보기', exact: true }).click()
    await expect(chat.locator('.park-chat__message')).toHaveCount(viewport.width === 1280 ? 20 : 21)
    await expect.poll(() => chat.getByRole('log').evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true)
    await chat.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
    const input = chat.getByRole('textbox', { name: '경기 채팅 메시지', exact: true })
    await input.fill(`채팅 확인 ${viewport.width}`); await iconInsideComposer(page, true)
    const contained = await chat.evaluate(node => {
      const outer = node.getBoundingClientRect()
      return outer.left >= 0 && outer.right <= innerWidth && outer.top >= 0 && outer.bottom <= innerHeight
        && [...node.querySelectorAll('.park-chat__heading,.park-chat__messages,.park-chat__composer,.park-chat__composer button')].every(child => {
          const rect = child.getBoundingClientRect()
          return rect.left >= outer.left && rect.right <= outer.right && rect.top >= outer.top && rect.bottom <= outer.bottom
        }) && node.scrollWidth <= node.clientWidth
    })
    expect(contained).toBe(true)
    await shot(page, `onecard-chat-open-${viewport.width}`)
    // Respect the real one-second chat send interval across rapid viewport changes.
    if (viewport.width === 390) await page.waitForTimeout(1100)
    await page.keyboard.press('Enter')
    await expect(chat.getByText(`채팅 확인 ${viewport.width}`, { exact: true })).toBeVisible()
    await page.keyboard.press('Escape'); await expect(chat).toHaveAttribute('data-expanded', 'false')
    await iconInsideComposer(page, false); await shot(page, `onecard-chat-closed-${viewport.width}`)
  }
  expect(server.sent.filter(packet => packet.type === 'GAME_SPECTATOR_CHAT_SEND')).toHaveLength(2)
  expect(server.sent.filter(packet => packet.type === 'WORLD_CHAT_SEND')).toHaveLength(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([])
})

test('gameplay map lock, contained chat icons and Escape confirm/cancel send only one explicit forfeit', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  const server = await start(page)
  await expect(page.getByRole('button', { name: '공원 지도', exact: true })).toBeDisabled()
  await expect(page.locator('.onecard-game-hud .mini-tools')).toHaveCount(0)
  for (const name of ['원카드 규칙', '최신 원카드 확인']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '기권', exact: true })).toBeEnabled()
  await page.locator('canvas').focus(); await page.keyboard.press('KeyM')
  await page.evaluate(async () => (await import('/src/features/navigation/navigationState.ts' as string)).openParkMap())
  await expect(page.getByRole('dialog', { name: '공원 지도창', exact: true })).toBeHidden()
  await iconInsideComposer(page, false)
  await page.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
  await iconInsideComposer(page, true)
  await page.getByRole('textbox', { name: '경기 채팅 메시지' }).fill('확인 중')
  await page.keyboard.press('Escape')
  const dialog = page.getByRole('dialog', { name: '기권하시겠습니까?', exact: true })
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '하트 4', exact: true }).click()
  await page.getByRole('button', { name: '기권', exact: true }).click()
  await expect(dialog).toContainText('배팅한 엽전은 모두 잃게 됩니다.')
  await expect(dialog.getByRole('button', { name: '계속 플레이', exact: true })).toBeFocused()
  await shot(page, 'onecard-escape-confirm')
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: '하트 4', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(server.sent.filter(m => m.type === 'GAME_FORFEIT')).toHaveLength(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await iconInsideComposer(page, false)
  await page.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click(); await iconInsideComposer(page, true)
  await page.keyboard.press('Escape'); await page.locator('canvas').focus()
  server.forfeitMode('hold'); await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: '기권 확정', exact: true }).click({ clickCount: 2 })
  await expect(dialog).toContainText('기권 요청 확인 중')
  expect(server.sent.filter(m => m.type === 'GAME_FORFEIT')).toHaveLength(1)
  server.completeForfeit()
  await expect(dialog).toBeHidden()
  await expect.poll(() => server.forfeitApplications).toBe(1)
  expect(server.sent.filter(m => m.type === 'TABLE_LEAVE')).toHaveLength(0)
  expect(errors).toEqual([])
})

test('ability hints cover unplayable cards and both jokers, but never ordinary or flipped cards', async ({ page }) => {
  const server = await start(page)
  const card = (suit: Card['suit'], rank: string): Card => ({ id: suit ? `${suit}-${rank}` : rank, suit, rank })
  const hand = [card('hearts', '4'), card('diamonds', 'K'), card('clubs', '7'), card(null, 'joker-color'), card(null, 'joker-black')]
  server.cardSnapshot({ turnDeadline: new Date(Date.now() + 60000).toISOString(),
    players: server.cardState().players.map(p => p.userId === '101' ? { ...p, cardCount: hand.length } : p) },
    { userId: '101', hand, playableCardIds: ['hearts-4', 'joker-color', 'joker-black'], canDraw: true })
  await page.evaluate(now => { Date.now = () => now }, Date.now())
  const king = page.locator('[data-card-id="diamonds-K"]'), four = page.locator('[data-card-id="hearts-4"]')
  await expect(king).toBeDisabled(); await king.hover()
  await expect(king.getByRole('tooltip')).toBeVisible()
  await expect(king.getByRole('tooltip')).toHaveText('한 장 더 내기')
  await four.hover(); await expect(page.getByRole('tooltip')).toHaveCount(0)
  const color = page.getByRole('button', { name: '컬러 조커 · +7 · 무늬 선택', exact: true })
  const black = page.getByRole('button', { name: '흑백 조커 · +5 · 무늬 선택', exact: true })
  await expect(color.locator('img')).toHaveAttribute('src', '/art/onecard/joker-moon-color.webp')
  await expect(black.locator('img')).toHaveAttribute('src', '/art/onecard/joker-moon-black.webp')
  for (const card of [color, black]) await expect.poll(() => card.locator('img').evaluate(img =>
    (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth === 640)).toBe(true)
  await color.hover(); await expect(color.getByRole('tooltip')).toHaveText('+7 · 무늬 선택')
  await shot(page, 'onecard-qa-jokers-tooltip')
  await black.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab')
  await expect(black.getByRole('tooltip')).toBeVisible()
  server.cardPranks.flip()
  await expect(king).toHaveAttribute('data-flipped', 'true')
  await king.hover(); await expect(king.locator('[role=tooltip]')).toHaveCount(0)
  await page.getByRole('button', { name: '손패 정리 · 2장 복구', exact: true }).click()
  await expect(king).toHaveAttribute('data-flipped', 'false')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: '다음 손패', exact: true })).toHaveCount(0)
  await color.click(); await expect(color).toHaveAttribute('aria-pressed', 'true')
  await shot(page, 'onecard-qa-mobile-jokers')
  const exit = await page.getByRole('button', { name: '기권', exact: true }).boundingBox()
  expect(exit!.x).toBeGreaterThanOrEqual(0); expect(exit!.x + exit!.width).toBeLessThanOrEqual(390)
  await page.getByRole('button', { name: '기권', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '기권하시겠습니까?', exact: true })
  await expect(dialog).toBeVisible(); await dialog.getByRole('button', { name: '계속 플레이', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(server.sent.filter(m => m.type === 'GAME_FORFEIT')).toHaveLength(0)
  const remaining = hand.filter(card => card.id !== 'joker-color')
  server.cardReply({ kind: 'play', cardId: 'joker-color' }, {
    topCard: card(null, 'joker-color'), stage: 'CHOOSE_SUIT', attackTotal: 7, lastAttack: card(null, 'joker-color'),
    players: server.cardState().players.map(p => p.userId === '101' ? { ...p, cardCount: remaining.length } : p),
  }, { userId: '101', hand: remaining, playableCardIds: [], canDraw: false })
  await page.getByRole('button', { name: '컬러 조커 내기', exact: true }).click()
  await expect(page.getByRole('group', { name: '무늬 선택', exact: true })).toBeVisible()
  const publicCard = page.getByLabel('바닥 카드 컬러 조커', { exact: true }).locator('img')
  await expect(publicCard).toHaveAttribute('src', '/art/onecard/joker-moon-color.webp')
  await expect.poll(() => publicCard.evaluate(img => (img as HTMLImageElement).complete)).toBe(true)
  await shot(page, 'onecard-joker-public-mobile')
  await page.setViewportSize({ width: 1280, height: 800 })
  await shot(page, 'onecard-joker-public-desktop')
})

test('an eliminated One Card player can explicitly recover an unconfirmed forfeit receipt', async ({ page }) => {
  const server = await start(page, 3)
  server.forfeitMode('lost-after-apply'); await page.locator('canvas').focus(); await page.keyboard.press('Escape')
  const dialog = page.getByRole('dialog', { name: '기권하시겠습니까?', exact: true })
  await dialog.getByRole('button', { name: '기권 확정', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(async () => (await import('/src/game/forfeit.ts' as string)).useForfeit.getState().attempt))?.status, { timeout: 15000 }).toBe('uncertain')
  await expect(dialog.getByRole('button', { name: '같은 기권 요청 확인', exact: true })).toBeEnabled()
  server.forfeitMode('approve'); await dialog.getByRole('button', { name: '같은 기권 요청 확인', exact: true }).click()
  await expect(dialog).toBeHidden()
  const requests = server.sent.filter(m => m.type === 'GAME_FORFEIT')
  expect(requests).toHaveLength(2); expect(requests[0]!.payload).toEqual(requests[1]!.payload)
  expect(server.forfeitApplications).toBe(1)
})
