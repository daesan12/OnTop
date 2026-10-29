import { expect, test, type Page, type Route } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

const chat = (page: Page) => page.getByRole('region', { name: '주변 채팅', exact: true })
const input = (page: Page) => page.getByRole('textbox', { name: '주변 채팅 메시지', exact: true })
const balance = (page: Page) => page.getByLabel('보유 엽전', { exact: true })
async function loaded(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().status)).toBe('connected')
  await page.locator('canvas').focus()
}
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', error => list.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource:.*status of (401|409|503)/.test(message.text())) list.push(message.text())
  })
})
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0) })

test('prototype transparent chat keeps 100 messages, Z toggles history and incoming messages preserve the reading position', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true }); await loaded(page)
  for (let i = 0; i < 22; i++) server.chatFrom('102', `산책 이야기 ${i}`)
  await expect(chat(page).locator('.park-chat__message')).toHaveCount(2)
  await expect(chat(page).locator('.park-chat__message').last()).toContainText('산책 이야기 21')
  await page.keyboard.press('KeyZ'); await expect(chat(page)).toHaveAttribute('data-history', 'true')
  await expect(chat(page).locator('.park-chat__message')).toHaveCount(22)
  await expect(chat(page).locator('.park-chat__messages')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  const log = chat(page).getByRole('log')
  await log.evaluate(el => { el.scrollTop = 0 })
  await expect.poll(() => log.evaluate(el => el.scrollTop)).toBe(0)
  server.chatFrom('102', '읽는 중에 온 새 이야기')
  await expect(chat(page).locator('.park-chat__message')).toHaveCount(23)
  expect(await log.evaluate(el => el.scrollTop)).toBe(0)
  await screenshot(page, 'chat-wallet-history-transparent')
  for (let i = 0; i < 85; i++) server.chatFrom('102', `추가 이야기 ${i}`)
  await expect(chat(page).locator('.park-chat__message')).toHaveCount(100)
  await page.keyboard.press('KeyZ'); await expect(chat(page).locator('.park-chat__message')).toHaveCount(2)
  server.close(1013)
  await expect.poll(() => server.connections).toBe(2)
  await expect(chat(page).locator('.park-chat__message')).toHaveCount(0)
})

test('sending or empty Enter shows six messages for twenty seconds, then collapses to two', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true }); await loaded(page)
  for (let i = 0; i < 8; i++) server.chatFrom('102', `이웃 ${i}`)

  await page.keyboard.press('Enter'); await input(page).fill('내 이야기'); await input(page).press('Enter')
  await expect(input(page)).toHaveCount(0)
  await expect(chat(page).locator('.park-chat__message')).toHaveCount(6)
  await page.waitForTimeout(19_000); await expect(chat(page)).toHaveAttribute('data-expanded', 'true')
  await page.waitForTimeout(1_100); await expect(chat(page).locator('.park-chat__message')).toHaveCount(2)
  await page.locator('canvas').focus(); await page.keyboard.press('Enter'); await input(page).press('Enter')
  await expect(chat(page).locator('.park-chat__message')).toHaveCount(6)
  expect(server.sent.filter(m => m.type === 'WORLD_CHAT_SEND')).toHaveLength(1)
  await page.waitForTimeout(20_100); await expect(chat(page).locator('.park-chat__message')).toHaveCount(2)
})

test('masking covers outbound and approved incoming text; only server echoes display and bubbles expire after ten seconds', async ({ page }) => {
  const server = await fixture(page); await loaded(page);
  await page.keyboard.press('Enter'); await input(page).fill('씨.발 ＦＵＣＫ <b>일반</b>'); await input(page).press('Enter')
  await expect(chat(page).locator('.park-chat__message')).toContainText('** ** <b>일반</b>')
  expect(server.sent.filter(m => m.type === 'WORLD_CHAT_SEND').at(-1)?.payload).toEqual({ text: '** ** <b>일반</b>' })
  expect(await chat(page).locator('b').count()).toBe(0)
  server.chatFrom('102', '병  신 시발점과 시발역')
  const bubble = page.locator('.avatar-overhead[data-player-id="102"] .avatar-speech')
  await expect(bubble).toHaveText('** 시발점과 시발역')
  await page.waitForTimeout(9_000); await expect(bubble).toHaveCount(1)
  await page.waitForTimeout(1_100); await expect(bubble).toHaveCount(0)
  await expect(chat(page)).toContainText('** 시발점과 시발역')
})

test('IME/Z typing, F1 ownership and rejected drafts keep the existing input gates', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true }); server.rejectChat(); await loaded(page)
  await page.keyboard.press('F1'); const manual = page.getByRole('dialog', { name: '게임 설명서', exact: true })
  await expect(manual).toHaveAttribute('data-phase', 'open')
  await manual.focus(); await page.keyboard.press('KeyZ'); await expect(chat(page)).toHaveAttribute('data-history', 'false')
  await page.keyboard.press('Escape'); await expect(manual).toHaveCount(0)
  await page.locator('canvas').focus(); await page.keyboard.press('Enter'); await input(page).fill('z 한글 입력')
  await input(page).dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 })
  expect(server.sent.filter(m => m.type === 'WORLD_CHAT_SEND')).toHaveLength(0)
  await input(page).press('KeyZ'); await expect(chat(page)).toHaveAttribute('data-history', 'false')
  await input(page).fill('재시도할 원문 씨발'); await input(page).press('Enter')
  await expect(input(page)).toHaveValue('재시도할 원문 씨발')
  await expect(chat(page).getByRole('status')).toContainText('내용을 보관')
  await expect(chat(page).locator('.park-chat__message')).toHaveCount(0)
  await input(page).press('Escape'); await expect(input(page)).toHaveCount(0)
  await page.locator('canvas').focus(); await page.keyboard.down('KeyW')
  await expect.poll(() => server.sent.some(m => m.type === 'WORLD_MOVE' && m.payload.dz)).toBe(true)
  await page.keyboard.up('KeyW')
})

test('entry fetches the existing wallet API once without blocking the park, and stale GET cannot overwrite newer settlement', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true }); let held: Route | undefined, calls = 0
  await page.route('**/api/v1/wallets/me', route => {
    calls++
    expect(route.request().method()).toBe('GET'); expect(route.request().postData()).toBeNull()
    expect(route.request().headers().authorization).toBe('Bearer fixture-access')
    if (calls === 1) { held = route; return }
    return route.fulfill({ json: { balance: 75, reservedBalance: 5, availableBalance: 70 } })
  })
  await loaded(page); await expect.poll(() => calls).toBe(1)
  await expect(balance(page)).toHaveText('잔액 조회 중')
  await expect(page.getByRole('button', { name: '공원 잔액 다시 확인', exact: true })).toHaveCount(0)
  await page.keyboard.down('KeyW'); await expect.poll(() => server.sent.some(m => m.type === 'WORLD_MOVE' && m.payload.dz)).toBe(true); await page.keyboard.up('KeyW')
  // Existing shop/minigame paths publish approved balances into this same account store.
  await page.evaluate(async () => { const { useSession } = await import('/src/network/worldClient.ts' as string); const s = useSession.getState(); useSession.setState({ account: { ...s.account!, balance: 80 } }) })
  await held!.fulfill({ json: { balance: 100, reservedBalance: 0, availableBalance: 100 } })
  await expect(page.locator('.park-wallet')).toHaveAttribute('aria-busy', 'false')
  await expect(balance(page)).toHaveText('80냥')
  // Returning online and focusing together still issue only one current GET.
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')) })
  await expect(balance(page)).toHaveText('75냥'); expect(calls).toBe(2)
  expect(server.connections).toBe(1)
  await screenshot(page, 'chat-wallet-entry-balance')
})

test('uninitialized wallet never invents zero and recovers automatically on returning to the park', async ({ page }) => {
  await fixture(page); let ready = false, calls = 0
  await page.route('**/api/v1/wallets/me', route => { calls++; return route.fulfill(ready
    ? { json: { balance: 0, reservedBalance: 0, availableBalance: 0 } }
    : { status: 409, json: { code: 'WALLET_NOT_READY', message: '초기화 필요' } }) })
  await loaded(page); await expect(balance(page)).toHaveText('지갑 준비 필요')
  await expect(page.locator('.park-wallet__notice')).toContainText('운영 담당자')
  await page.waitForTimeout(300); expect(calls).toBe(1)
  await screenshot(page, 'chat-wallet-uninitialized')
  await expect(page.getByRole('button', { name: '공원 잔액 다시 확인', exact: true })).toHaveCount(0)
  ready = true; await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(balance(page)).toHaveText('0냥'); await expect(page.locator('.park-wallet__notice')).toHaveCount(0)
  expect(calls).toBe(2)
})

test('wallet outage automatically retries server reads and invalid responses cannot invent a balance', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await fixture(page); let calls = 0
  const responses = [
    { status: 503, json: { code: 'WALLET_UNAVAILABLE', message: '서비스 점검' } },
    { json: { balance: 42, reservedBalance: 12, availableBalance: 30 } },
    { status: 503, json: { code: 'WALLET_UNAVAILABLE', message: '서비스 점검' } },
    { json: { balance: 100, reservedBalance: 10, availableBalance: 100 } }, // inconsistent: reject, never manufacture money
    { json: { balance: 0, reservedBalance: 0, availableBalance: 0 } },
  ]
  await page.route('**/api/v1/wallets/me', route => {
    expect(route.request().method()).toBe('GET'); expect(route.request().postData()).toBeNull()
    return route.fulfill(responses[calls++])
  })
  await loaded(page); await expect(balance(page)).toHaveText('잔액 조회 실패')
  await expect(page.locator('.park-wallet__notice')).toContainText('지갑 서비스에 연결하지 못했어요')
  await page.waitForTimeout(300); expect(calls).toBe(1)
  await expect(page.getByRole('button', { name: '공원 잔액 다시 확인', exact: true })).toHaveCount(0)
  await expect(balance(page)).toHaveText('42냥', { timeout: 10000 })
  await expect(page.locator('.park-wallet__notice')).toHaveCount(0)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.locator('.park-wallet__notice')).toContainText('마지막 확인 잔액')
  await expect(balance(page)).toHaveText('42냥')
  await screenshot(page, 'chat-wallet-last-confirmed')
  await expect(page.locator('.park-wallet__notice')).toContainText('잔액을 확인하지 못했어요', { timeout: 10000 })
  await expect(balance(page)).toHaveText('42냥')
  await expect(balance(page)).toHaveText('0냥', { timeout: 10000 })
  await expect(page.locator('.park-wallet__notice')).toHaveCount(0)
  expect(calls).toBe(5)
})

test('a stalled wallet read times out and recovers automatically without a refresh control', async ({ page }) => {
  await fixture(page); let calls = 0
  await page.route('**/api/v1/wallets/me', route => {
    calls++
    expect(route.request().method()).toBe('GET')
    if (calls === 1) return
    return route.fulfill({ json: { balance: 64, reservedBalance: 4, availableBalance: 60 } })
  })
  await loaded(page)
  await expect(balance(page)).toHaveText('잔액 조회 실패', { timeout: 14000 })
  await expect(page.getByRole('button', { name: '공원 잔액 다시 확인', exact: true })).toHaveCount(0)
  await expect(balance(page)).toHaveText('64냥', { timeout: 10000 })
  expect(calls).toBe(2)
})

test('wallet 401 follows existing refresh and logout discards a late pending balance', async ({ page }) => {
  const server = await fixture(page); let calls = 0, held: Route | undefined
  await page.route('**/api/v1/wallets/me', route => {
    calls++
    if (calls === 1) return route.fulfill({ status: 401, json: { code: 'AUTH_INVALID_ACCESS_TOKEN' } })
    if (calls === 2) return route.fulfill({ json: { balance: 120, reservedBalance: 20, availableBalance: 100 } })
    held = route
  })
  await loaded(page); await expect(balance(page)).toHaveText('120냥'); expect(calls).toBe(2)
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await expect.poll(() => !!held).toBe(true)
  server.endSession(); await expect(page.locator('.login-page')).toBeVisible()
  await held!.fulfill({ json: { balance: 999, reservedBalance: 0, availableBalance: 999 } }).catch(() => {})
  expect(await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().account)).toBeNull()
})

test('transparent history and balance controls fit a small PC viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 })
  const server = await fixture(page); await loaded(page); await expect(balance(page)).toHaveText('100냥')
  await expect(page.getByRole('button', { name: '공원 잔액 다시 확인', exact: true })).toHaveCount(0)
  for (let i = 0; i < 10; i++) server.chatFrom('102', '긴 이름과 긴 채팅 메시지를 확인합니다. '.repeat(4))
  await page.keyboard.press('KeyZ'); await expect(chat(page)).toHaveAttribute('data-history', 'true')
  const box = await chat(page).boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(1000); expect(box!.y + box!.height).toBeLessThanOrEqual(700)
  await screenshot(page, 'chat-wallet-small-pc')
})
