import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

const state = (page: Page) => page.evaluate(async () => ({ ...(await import('/src/features/follow/state.ts' as string)).useFollow.getState() }))
const own = (page: Page) => page.evaluate(async () => ({ ...(await import('/src/network/worldClient.ts' as string)).avatars.get('101')!.current }))
const vertices = (page: Page) => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).followRenderProbe().vertices)
async function loaded(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.locator('canvas').focus()
}
async function choose(page: Page, rightClick = false) {
  if (rightClick) {
    await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).avatarMenuPoint('102').worldX)).toBe(3)
    const point = await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).avatarMenuPoint('102'))
    await page.mouse.click(point.x, point.y, { button: 'right' })
  } else {
    // The 이웃 메뉴 launcher is gone; open the menu the way an avatar right-click does.
    await page.evaluate(async () => {
      const { openAvatarMenu } = await import('/src/features/follow/FollowMenu.tsx' as string)
      const { useSession } = await import('/src/network/worldClient.ts' as string)
      const state = useSession.getState()
      openAvatarMenu({ id: state.ids.find((id: string) => id !== state.sessionId), x: 600, y: 300 })
    })
  }
  await page.getByRole('menuitem', { name: '따라가기', exact: true }).click()
}
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', e => list.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource:.*status of (401|403|404|503)/.test(m.text())) list.push(m.text()) })
})
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0) })

test('right-click follows only after approval, renders the rope and follows server poses; zero heartbeats retain it and manual input releases it', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true, position: { x: 0, y: .8, z: 34, yaw: 0 } })
  await loaded(page); server.remotePose({ x: 3, y: .8, z: 33, yaw: 0 })
  await expect.poll(async () => (await state(page)).ready).toBe(true)
  server.follow.mode('hold'); const before = await own(page)
  await choose(page, true)
  await expect.poll(async () => (await state(page)).pending).toBe(true)
  expect(await vertices(page)).toBe(0); expect(await own(page)).toEqual(before)
  server.follow.late()
  await expect(page.getByRole('complementary', { name: '따라가기 상태', exact: true })).toBeVisible()
  await expect.poll(() => vertices(page)).toBe(48)
  expect(server.sent.filter(m => m.type === 'WORLD_FOLLOW_START').at(-1)!.payload).toEqual({ targetId: '102' })
  server.pose({ x: 1, moving: true }); await expect.poll(async () => (await own(page)).x).toBe(1)
  await page.evaluate(async () => (await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.move(0, 0, false))
  expect((await state(page)).links).toHaveLength(1)
  await screenshot(page, 'follow-approved-rope')
  server.pose({ moving: false }); await page.locator('canvas').focus(); await page.keyboard.down('KeyW')
  await expect.poll(async () => (await state(page)).links.length).toBe(0)
  await page.keyboard.up('KeyW'); await expect.poll(() => vertices(page)).toBe(0)
  expect(server.sent.filter(m => m.type === 'WORLD_FOLLOW_STOP')).toHaveLength(0)
})

test('explicit STOP uses the approved UUID, rejects stay visible, and an auto-release push defeats a delayed START ACK', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true }); await loaded(page)
  await choose(page); await expect.poll(async () => (await state(page)).links.length).toBe(1)
  const id = server.follow.links()[0]!.followId
  server.follow.mode('reject'); await page.getByRole('button', { name: '따라가기 종료', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('가까운 이용자')
  expect((await state(page)).links).toHaveLength(1)
  server.follow.mode('normal'); await page.getByRole('button', { name: '따라가기 종료', exact: true }).click()
  await expect.poll(async () => (await state(page)).links.length).toBe(0)
  expect(server.sent.filter(m => m.type === 'WORLD_FOLLOW_STOP').at(-1)!.payload).toEqual({ followId: id })
  server.follow.mode('hold'); await choose(page)
  await expect.poll(async () => (await state(page)).pending).toBe(true)
  server.follow.release(); server.follow.late()
  await expect.poll(async () => (await state(page)).pending).toBe(false)
  expect((await state(page)).links).toHaveLength(0)
  server.follow.push({ version: 0, links: [{ followId: id, followerId: '101', targetId: '102' }] })
  expect((await state(page)).links).toHaveLength(0)
})

test('lost approval recovers through CHECK without replay and reconnect queries afresh without restarting follow', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true }); await loaded(page)
  server.follow.mode('lost'); await choose(page)
  await expect.poll(async () => (await state(page)).pending, { timeout: 12000 }).toBe(false)
  expect(server.sent.filter(m => m.type === 'WORLD_FOLLOW_START')).toHaveLength(1)
  expect(server.sent.filter(m => m.type === 'WORLD_FOLLOW_CHECK')).toHaveLength(2)
  expect((await state(page)).links).toHaveLength(1)
  server.close(1012)
  await expect.poll(() => server.connections, { timeout: 12000 }).toBe(2)
  await expect.poll(async () => (await state(page)).ready).toBe(true)
  expect((await state(page)).links).toHaveLength(0)
  expect(server.sent.filter(m => m.type === 'WORLD_FOLLOW_START')).toHaveLength(1)
  expect(server.sent.filter(m => m.type === 'WORLD_FOLLOW_CHECK')).toHaveLength(3)
})

test('CHECK rejection disables follow and provides a scoped retry without changing the park connection', async ({ page }) => {
  const server = await fixture(page); server.follow.failCheck(true); await loaded(page)
  await expect(page.getByRole('alert')).toContainText('다시 조회')
  expect((await state(page)).ready).toBe(false)
  server.follow.failCheck(false)
  await page.getByRole('button', { name: '따라가기 상태 재조회', exact: true }).click()
  await expect.poll(async () => (await state(page)).ready).toBe(true)
  await choose(page); await expect.poll(async () => (await state(page)).links.length).toBe(1)
  expect(server.connections).toBe(1)
})

test('distance release uses the authoritative snapshot, preserves other followers, and jump releases the own link at laptop size', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  const server = await fixture(page, { manualMovement: true, position: { x: 0, y: .8, z: 34, yaw: 0 } })
  await loaded(page); server.remotePose({ x: 3, y: .8, z: 33, yaw: 0 })
  await choose(page); await expect.poll(() => vertices(page)).toBe(48)
  server.remotePose({ x: 25 })
  await expect.poll(() => vertices(page)).toBe(0)
  expect((await state(page)).links).toHaveLength(1) // Distance alone never authors an FE release.
  server.follow.release(); await expect.poll(async () => (await state(page)).links.length).toBe(0)
  server.remotePose({ x: 3 }); await choose(page)
  await expect.poll(() => vertices(page)).toBe(48)
  await screenshot(page, 'follow-laptop-approved')
  await page.locator('canvas').focus(); await page.keyboard.press('Space')
  await expect.poll(async () => (await state(page)).links.length).toBe(0)
  expect(server.sent.some(m => m.type === 'WORLD_MOVE' && m.payload.jump)).toBe(true)
  const remote = { followId: '00000000-0000-4000-8000-000000000099', followerId: '102', targetId: '101' }
  server.follow.push({ version: 50, links: [remote] })
  await expect.poll(async () => (await state(page)).links).toEqual([remote])
  server.follow.push({ channelId: 'elsewhere', version: 51, links: [] })
  expect((await state(page)).links).toEqual([remote])
})

test('server cancellation clears only the matching animation and releases its cooldown', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true, position: { x: 0, y: .8, z: 34, yaw: 0 } }); await loaded(page)
  await page.getByRole('button', { name: '감정표현 열기' }).click()
  await page.getByRole('dialog', { name: '감정표현 선택' }).getByRole('button', { name: '손 인사', exact: true }).click()
  const emote = () => page.evaluate(async () => {
    const w = await import('/src/network/worldClient.ts' as string), e = await import('/src/features/emotes/state.ts' as string)
    return { own: w.avatars.get('101')!.emote, remote: w.avatars.get('102')!.emote, cooldown: e.useEmoteState.getState().readyAt }
  })
  await expect.poll(async () => (await emote()).own).toBe('EMOTE_WAVE')
  const approved = server.lastEmote()!
  const cancel = { eventId: 'fixture-cancellation', emoteEventId: approved.eventId, channelId: 'fixture-channel', userId: '101', reason: 'ACTIVITY_STARTED', sentAt: new Date().toISOString() }
  server.cancelEmote({ ...cancel, emoteEventId: 'wrong' })
  expect((await emote()).own).toBe('EMOTE_WAVE')
  server.cancelEmote(cancel); await expect.poll(async () => (await emote()).own).toBe('')
  expect((await emote()).cooldown).toBe(0)
  await expect(page.locator('.emote-feedback[role="status"]')).toHaveCount(0)
  await page.getByRole('button', { name: '감정표현 열기' }).click()
  await page.getByRole('dialog', { name: '감정표현 선택' }).getByRole('button', { name: '박수', exact: true }).click()
  await expect.poll(async () => (await emote()).own).toBe('EMOTE_CLAP')
  await expect(page.locator('.emote-feedback[role="status"]')).toHaveCount(0)
  await screenshot(page, 'emote-switch-without-notice')
  const first = { ...approved, userId: '102', eventId: 'remote-a', sentAt: new Date().toISOString() }
  server.emote(first); await expect.poll(async () => (await emote()).remote).toBe('EMOTE_WAVE')
  const second = { ...first, eventId: 'remote-b', sentAt: new Date(Date.parse(first.sentAt) + 1).toISOString() }
  server.emote(second)
  server.cancelEmote({ ...cancel, eventId: 'late-a', userId: '102', emoteEventId: first.eventId })
  expect((await emote()).remote).toBe('EMOTE_WAVE')
  const matching = { ...cancel, eventId: 'matching-b', userId: '102', emoteEventId: second.eventId }
  server.cancelEmote(matching); server.cancelEmote(matching)
  await expect.poll(async () => (await emote()).remote).toBe('')
})
