import { test, expect, type Page } from '@playwright/test'
import { TABLES } from '../../src/config'
import { fixture, screenshot, tableId } from './contractFixture'
import os from 'node:os'
import path from 'node:path'

async function loaded(page: Page) {
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => {
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    return useSession.getState().status === 'connected' && !!useSession.getState().roomId
  })).toBe(true)
}
const menu = (page: Page) => page.getByRole('menu', { name: '내 메뉴' })
async function openMenu(page: Page) {
  await page.getByRole('button', { name: '내 메뉴', exact: true }).click()
  await expect(menu(page)).toBeVisible()
}
/** Later routes win over the shared fixture, so only the profile endpoints are replaced here. */
async function profileRoutes(page: Page, options: { taken?: string[]; patch?: number; remove?: number } = {}) {
  const calls: { method: string; path: string; body: unknown }[] = []
  await page.route(/\/api\/v1\/users\/(me|nickname-availability)(\?.*)?$/, async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname === '/api/v1/users/me' && request.method() === 'GET') return route.fallback()
    expect(request.headers().authorization).toBe('Bearer fixture-access')
    calls.push({ method: request.method(), path: url.pathname + url.search, body: request.postDataJSON() ?? null })
    if (url.pathname === '/api/v1/users/nickname-availability') {
      const nickname = url.searchParams.get('nickname')!
      return route.fulfill({ json: { nickname, available: !options.taken?.includes(nickname) } })
    }
    if (request.method() === 'PATCH')
      return options.patch === 409
        ? route.fulfill({ status: 409, json: { code: 'USER_NICKNAME_ALREADY_EXISTS', message: 'taken' } })
        : route.fulfill({ json: { userId: 101, nickname: (request.postDataJSON() as { nickname: string }).nickname, characterGender: 'MALE' } })
    if (request.method() === 'DELETE')
      return options.remove === 503
        ? route.fulfill({ status: 503, json: { code: 'USER_WITHDRAWAL_UNAVAILABLE', message: 'down' } })
        : route.fulfill({ status: 204 })
    return route.fallback()
  })
  return calls
}

test('channel dropdown shows current and full channels and keeps the seated-table rule', async ({ page }) => {
  await fixture(page, { channelName: '개발 공원' })
  let showSpare = false
  await page.route('**/api/v1/channels', route => route.fulfill({ json: { items: [
    { channelId: 'fixture-channel', name: '개발 공원', currentUsers: 2, capacity: 16, joinable: true },
    { channelId: 'full-channel', name: '공원 03', currentUsers: 16, capacity: 16, joinable: false },
    ...(showSpare ? [{ channelId: 'spare-channel', name: '공원 04', currentUsers: 0, capacity: 16, joinable: true }] : []),
  ] } }))
  await page.goto('/park')
  const dropdown = page.getByRole('region', { name: '채널 선택' })
  // Several channels: the first entry still asks for a choice, but the chip folds and unfolds it.
  await expect(dropdown).toBeVisible({ timeout: 90000 })
  const chip = page.getByRole('button', { name: '현재 공원과 접속 인원' })
  await chip.click(); await expect(dropdown).toBeHidden(); await expect(chip).toHaveAttribute('aria-expanded', 'false')
  showSpare = true
  await chip.click(); await expect(dropdown).toBeVisible()
  await expect(dropdown.getByRole('button', { name: /공원 04/ })).toBeVisible()
  await dropdown.getByRole('button', { name: /온탑 공원/ }).click()
  await expect(dropdown).toBeHidden()
  await chip.click()
  await expect(chip).toHaveAttribute('aria-expanded', 'true')
  await expect(chip).toContainText('온탑 공원')
  await expect(chip.getByAltText('온탑 로고')).toBeVisible()
  await expect.poll(() => chip.getByAltText('온탑 로고').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(dropdown.getByRole('button', { name: /온탑 공원/ })).toContainText('현재')
  await expect(dropdown.getByRole('button', { name: /공원 03/ })).toContainText('가득 참')
  await expect(dropdown.getByRole('button', { name: /공원 03/ })).toBeDisabled()
  await expect(dropdown).toContainText('테이블에 앉아 있을 때는 채널을 바꿀 수 없어요')
  await screenshot(page, 'park-menus-channel')
  await page.keyboard.press('Escape')
  await expect(dropdown).toBeHidden()
  await screenshot(page, 'ontop-park-chip')
  await chip.screenshot({ path: path.join(process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-fe-qa'), 'ontop-park-chip-detail.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(chip).toBeInViewport()
  await screenshot(page, 'ontop-park-chip-mobile')
  expect(await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().channelName)).toBe('개발 공원')
})

test('table placement uses the live channel response when static bindings are absent', async ({ page }) => {
  await fixture(page, { bindings: false })
  await page.route(/\/api\/v1\/tables\?/, route => route.fulfill({ json: { tables: [{
    tableId, anchorId: TABLES[0]!.id, capacity: 2, minimumPlayers: 2,
    occupiedSeats: 0, availableSeats: 2, readyCount: 0, allReady: false,
    status: 'WAITING', joinable: true, gameCode: null, targetScore: null, betAmountPerPlayer: null,
  }] } }))
  await loaded(page)
  await expect.poll(() => page.evaluate(async () => {
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    return useSession.getState().bindings
  })).toEqual([{ channelId: 'fixture-channel', tableId, anchorId: TABLES[0]!.id }])
})

test('profile menu lists 내 정보 · 내 전적 · 로그아웃 · 회원 탈퇴 and the dock 설정 opens settings', async ({ page }) => {
  await fixture(page); await loaded(page)
  await openMenu(page)
  await expect(menu(page)).toContainText('공원 산책자')
  await expect(menu(page)).toContainText('100냥')
  for (const name of ['내 정보', '내 전적', '로그아웃', '회원 탈퇴']) await expect(menu(page).getByRole('menuitem', { name: new RegExp(name) })).toBeVisible()
  // 설정 moved to the 빠른 메뉴 dock (S15P31B105-256).
  await expect(menu(page).getByRole('menuitem', { name: /설정/ })).toHaveCount(0)
  await screenshot(page, 'park-menus-profile')
  await page.keyboard.press('Escape'); await expect(menu(page)).toBeHidden()
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(page.getByRole('region', { name: '설정', exact: true })).toBeVisible()
})

test('내 정보 checks availability before saving, shows the result and updates the park name', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true }); await loaded(page)
  const calls = await profileRoutes(page, { taken: ['온탑고수'] })
  await openMenu(page); await menu(page).getByRole('menuitem', { name: /내 정보/ }).click()
  const dialog = page.getByRole('dialog', { name: '내 정보' })
  const input = dialog.getByRole('textbox', { name: '닉네임' })
  const save = dialog.getByRole('button', { name: '저장', exact: true }), check = dialog.getByRole('button', { name: '중복 확인' })
  await expect(input).toHaveValue('공원 산책자')
  await expect(dialog).toContainText('남자 캐릭터 · 공원 01에서 산책 중')
  await expect(save).toBeDisabled(); await expect(check).toBeDisabled()
  // Typing WASD into the field must not move the avatar behind the dialog.
  const moves = server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length
  await input.fill(''); await input.pressSequentially('wasd!')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(dialog).toContainText('2~8자 한글, 영문, 숫자만 쓸 수 있어요.')
  expect(server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz))).toHaveLength(moves)
  await input.fill('온탑고수'); await check.click()
  await expect(dialog).toContainText('이미 사용 중인 닉네임이에요.')
  await expect(save).toBeDisabled()
  await screenshot(page, 'park-menus-nickname-taken')
  await input.fill('돼지병아리'); await expect(save).toBeDisabled(); await check.click()
  await expect(dialog).toContainText('사용할 수 있는 닉네임이에요.')
  await save.click()
  const done = page.getByRole('dialog', { name: '닉네임 변경 완료' })
  await expect(done).toContainText('공원 산책자'); await expect(done).toContainText('돼지병아리')
  await screenshot(page, 'park-menus-nickname-done')
  expect(calls.map(c => [c.method, c.path, c.body])).toEqual([
    ['GET', '/api/v1/users/nickname-availability?nickname=' + encodeURIComponent('온탑고수'), null],
    ['GET', '/api/v1/users/nickname-availability?nickname=' + encodeURIComponent('돼지병아리'), null],
    ['PATCH', '/api/v1/users/me', { nickname: '돼지병아리' }],
  ])
  await done.getByRole('button', { name: '확인' }).click()
  await expect(page.locator('.park-account__nickname')).toHaveText('돼지병아리')
})

test('a nickname taken between the check and the save stays in the dialog as a 409', async ({ page }) => {
  await fixture(page); await loaded(page)
  await profileRoutes(page, { patch: 409 })
  await openMenu(page); await menu(page).getByRole('menuitem', { name: /내 정보/ }).click()
  const dialog = page.getByRole('dialog', { name: '내 정보' })
  await dialog.getByRole('textbox', { name: '닉네임' }).fill('먼저간이름')
  await dialog.getByRole('button', { name: '중복 확인' }).click()
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  await expect(dialog).toContainText('이미 사용 중인 닉네임이에요.')
  await expect(page.locator('.park-account__nickname')).toHaveText('공원 산책자')
})

test('logout asks first; cancel keeps the park and confirm returns to login', async ({ page }) => {
  const server = await fixture(page); await loaded(page)
  await openMenu(page); await menu(page).getByRole('menuitem', { name: '로그아웃' }).click()
  const dialog = page.getByRole('dialog', { name: '로그아웃 확인' })
  await expect(dialog).toContainText('로그아웃할까요?')
  await screenshot(page, 'park-menus-logout')
  await dialog.getByRole('button', { name: '취소' }).click()
  await expect(dialog).toBeHidden(); expect(server.active).toBe(1)
  await openMenu(page); await menu(page).getByRole('menuitem', { name: '로그아웃' }).click()
  await dialog.getByRole('button', { name: '로그아웃', exact: true }).click()
  await expect(page.getByRole('button', { name: 'SSAFY로 계속하기', exact: true })).toBeVisible()
  await expect.poll(() => server.active).toBe(0)
})

test('withdrawal needs the agreement, keeps the park on 503 and returns to login after 204', async ({ page }) => {
  await fixture(page); await loaded(page)
  await profileRoutes(page, { remove: 503 })
  await openMenu(page); await menu(page).getByRole('menuitem', { name: '회원 탈퇴' }).click()
  const dialog = page.getByRole('dialog', { name: '회원 탈퇴 확인' })
  const confirm = dialog.getByRole('button', { name: '탈퇴하기' })
  await expect(dialog).toContainText('탈퇴 후 7일 안에 다시 로그인하면 계정을 되살릴 수 있어요')
  await expect(confirm).toBeDisabled()
  await dialog.getByRole('checkbox', { name: '안내를 모두 확인했습니다' }).check()
  await screenshot(page, 'park-menus-withdraw')
  await confirm.click()
  await expect(dialog.getByRole('alert')).toContainText('탈퇴를 처리하지 못했어요.')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await page.unroute(/\/api\/v1\/users\/(me|nickname-availability)(\?.*)?$/)
  const calls = await profileRoutes(page)
  await confirm.click()
  await expect(page.getByRole('button', { name: 'SSAFY로 계속하기', exact: true })).toBeVisible()
  expect(calls.map(c => c.method + ' ' + c.path)).toEqual(['DELETE /api/v1/users/me'])
})
