import { test, expect, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import type { OwnedItem } from '../../src/features/shop/contracts'

// Synthetic inventory confined to the test; the app ships no demo outfits.
const outfit = (userItemId: number, itemId: number, name: string, equipSlot: OwnedItem['item']['equipSlot'], equipped = false): OwnedItem => ({
  userItemId, quantity: 1, equipped,
  item: { itemId, itemCode: 'FIXTURE_' + itemId, name, itemType: 'EQUIPMENT', equipSlot, price: 10, imageKey: 'fixture-' + itemId },
})
async function wardrobeRoutes(page: Page, options: { owned?: OwnedItem[]; disabled?: boolean } = {}) {
  const owned = options.owned ?? [
    outfit(11, 1, '아이보리 맨투맨', 'TOP', true), outfit(12, 2, '밤산책 후드', 'TOP'), outfit(13, 3, '초록 후드', 'TOP'),
    outfit(21, 4, '베이지 카고 팬츠', 'BOTTOM', true), outfit(22, 5, '블랙 팬츠', 'BOTTOM'),
    outfit(31, 6, '화이트 스니커즈', 'SHOES'),
    { userItemId: 41, quantity: 3, equipped: false, item: { itemId: 7, itemCode: 'FIXTURE_BREAD', name: '붕어빵', itemType: 'CONSUMABLE', equipSlot: null, price: 3, imageKey: null } },
  ]
  const calls: { method: string; path: string; body: unknown }[] = []
  await page.route(/\/api\/v1\/(users\/me\/(items|equipment)|wallets\/me)$/, async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    expect(request.headers().authorization).toBe('Bearer fixture-access')
    calls.push({ method: request.method(), path, body: request.postDataJSON() ?? null })
    if (path === '/api/v1/wallets/me') return route.fulfill({ json: { balance: 1240, reservedBalance: 0, availableBalance: 1240 } })
    if (options.disabled) return route.fulfill({ status: 503, json: { code: 'SHOP_NOT_CONFIGURED', message: 'disabled' } })
    if (path === '/api/v1/users/me/items') return route.fulfill({ json: { items: owned } })
    const target = owned.find(item => item.userItemId === (request.postDataJSON() as { userItemId: number }).userItemId)!
    for (const item of owned) if (item.item.equipSlot === target.item.equipSlot) item.equipped = item === target
    return route.fulfill({ json: { equipment: owned.filter(item => item.equipped) } })
  })
  return calls
}
async function loaded(page: Page) {
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => {
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    return useSession.getState().status === 'connected' && !!useSession.getState().roomId
  })).toBe(true)
}
const wardrobe = (page: Page) => page.getByRole('dialog', { name: '마이룸 옷장' })

test('dock 옷장 opens 마이룸: slots, tabs, search, preview and wear call the real equipment API', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true }); await loaded(page)
  const calls = await wardrobeRoutes(page)
  await page.getByRole('button', { name: '옷장', exact: true }).click()
  const dialog = wardrobe(page)
  await expect(dialog.getByRole('heading', { name: '마이룸' })).toBeVisible()
  await expect(dialog.getByLabel('보유 엽전')).toHaveText('1,240냥')
  // Consumables stay in the shop; six wearable outfits are listed.
  await expect(dialog.locator('.wardrobe-card')).toHaveCount(6)
  await expect(dialog.getByRole('navigation', { name: '착용 부위' })).toContainText('아이보리 맨투맨')
  await expect(dialog.getByRole('button', { name: '아이보리 맨투맨 상의 착용 중' })).toBeVisible()
  await dialog.getByRole('group', { name: '부위 분류' }).getByRole('button', { name: '하의' }).click()
  await expect(dialog.locator('.wardrobe-card')).toHaveCount(2)
  await dialog.getByRole('group', { name: '부위 분류' }).getByRole('button', { name: '전체' }).click()
  await dialog.getByRole('searchbox', { name: '아이템 찾기' }).fill('후드')
  await expect(dialog.locator('.wardrobe-card')).toHaveCount(2)
  // Typing in the search box must not move the avatar behind the wardrobe.
  const moves = server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length
  await dialog.getByRole('searchbox', { name: '아이템 찾기' }).press('KeyW')
  expect(server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz))).toHaveLength(moves)
  await dialog.getByRole('searchbox', { name: '아이템 찾기' }).fill('후드')
  await dialog.getByRole('button', { name: '밤산책 후드 상의' }).click()
  await expect(dialog.locator('.wardrobe-detail')).toContainText('밤산책 후드')
  await expect(dialog.locator('.wardrobe-stage')).toContainText('미리보기 · 밤산책 후드')
  await screenshot(page, 'wardrobe-preview')
  await dialog.getByRole('button', { name: '착용하기' }).click()
  await expect(dialog.locator('.wardrobe-detail')).toContainText('밤산책 후드 착용을 확인했어요.')
  await expect(dialog.getByRole('button', { name: '밤산책 후드 상의 착용 중' })).toBeVisible()
  await expect(dialog.getByRole('navigation', { name: '착용 부위' })).toContainText('밤산책 후드')
  expect(calls.filter(c => c.method === 'PATCH')).toEqual([{ method: 'PATCH', path: '/api/v1/users/me/equipment', body: { userItemId: 12 } }])
  await dialog.getByRole('button', { name: '초록 후드 상의' }).click()
  await dialog.getByRole('button', { name: '미리보기 취소' }).click()
  await expect(dialog.locator('.wardrobe-detail')).toContainText('입어 볼 의상을 골라 주세요.')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  expect(calls.filter(c => c.method === 'PATCH')).toHaveLength(1)
})

test('a disabled shop server shows the wardrobe as not ready, and an empty inventory says so', async ({ page }) => {
  await fixture(page); await loaded(page)
  await wardrobeRoutes(page, { disabled: true })
  await page.getByRole('button', { name: '옷장', exact: true }).click()
  await expect(wardrobe(page)).toContainText('옷장이 아직 준비 중이에요')
  await expect(wardrobe(page).locator('.wardrobe-card')).toHaveCount(0)
  await screenshot(page, 'wardrobe-unavailable')
  await wardrobe(page).getByRole('button', { name: '옷장 닫기' }).click()
  await page.unroute(/\/api\/v1\/(users\/me\/(items|equipment)|wallets\/me)$/)
  await wardrobeRoutes(page, { owned: [] })
  await page.getByRole('button', { name: '옷장', exact: true }).click()
  await expect(wardrobe(page)).toContainText('아직 가진 의상이 없어요')
})
