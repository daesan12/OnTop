import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot, tableId } from './contractFixture'
import { TABLES, tableSeats } from '../../src/config'

async function loaded(page: Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
}
const seat = (page: Page, id = '101') => page.evaluate(async id =>
  (await import('/tests/e2e/sceneProbe.ts' as string)).publicSeatProbe(id), id)
const emote = (page: Page) => page.evaluate(async () =>
  (await import('/tests/e2e/sceneProbe.ts' as string)).emoteProbe())

test('public seat snapshot renders the actor seated for a bystander before the bystander joins or watches', async ({ page, context }) => {
  const errors: string[] = []
  const observe = (p: Page) => {
    p.on('pageerror', e => errors.push(e.message))
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  }
  observe(page)
  const actor = await fixture(page, { omok: true, m09: true })
  await loaded(page)
  const observer = await context.newPage(); observe(observer)
  const bystander = await fixture(observer, { ownUserId: '102', manualMovement: true })
  await loaded(observer)
  expect((await seat(observer)).seatIndex).toBe(-1)
  await page.locator('canvas').focus(); await page.keyboard.press('KeyE')
  const lobby = page.getByRole('dialog', { name: '테이블 정보', exact: true })
  await expect(lobby).toBeVisible()
  await lobby.getByRole('button', { name: '앉기', exact: true }).click()
  await expect.poll(async () => (await seat(page)).ownTable).toBe(tableId)
  // Proposed BE WORLD_STATE extension, independently delivered to the bystander.
  bystander.tableSeat('101', { tableId, seatNumber: 1 })
  await expect.poll(async () => (await seat(observer)).seatIndex).toBe(0)
  await expect.poll(async () => (await seat(observer)).thigh!).toBeLessThan(-1.5)
  await expect.poll(async () => (await seat(observer)).knee!).toBeGreaterThan(1.5)
  expect(await seat(observer)).toMatchObject({ visible: true, ownTable: '', watchedTable: '' })
  expect(bystander.sent.some(m => ['TABLE_JOIN', 'TABLE_WATCH', 'GAME_WATCH'].includes(m.type))).toBe(false)
  const anchor = TABLES[0]!, placement = tableSeats(anchor)[0]!
  bystander.remotePose({ x: anchor.position[0] + placement.x + 5, y: anchor.position[1] + .8,
    z: anchor.position[2] + placement.z + 4 })
  await observer.evaluate(async () => {
    const controls = await import('/src/world/cameraPerspective.ts' as string)
    controls.setCameraPerspective('first-person')
    Object.assign(controls.viewControls, { yaw: Math.atan2(5, 4), pitch: .15 })
    await new Promise(resolve => setTimeout(resolve, 350))
  })
  await screenshot(observer, 'avatar-feedback-public-seated')
  await lobby.getByRole('button', { name: '테이블 정보 닫기' }).click()
  await page.locator('canvas').focus(); await page.keyboard.press('KeyW')
  await expect.poll(() => actor.sent.some(m => m.type === 'TABLE_LEAVE')).toBe(true)
  bystander.tableSeat('101', null)
  await expect.poll(async () => (await seat(observer)).seatIndex).toBe(-1)
  await expect.poll(async () => Math.abs((await seat(observer)).thigh!)).toBeLessThan(.05)
  await expect(observer.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
  await observer.close()
})

test('moving cancels a wave and a different emote can be selected immediately after stopping', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const server = await fixture(page, { emoteBindings: 'development', manualMovement: true,
    position: { x: 0, y: .8, z: 34, yaw: 0 } })
  await loaded(page)
  await page.getByRole('button', { name: '감정표현 열기' }).click()
  await page.getByRole('dialog', { name: '감정표현 선택' }).getByRole('button', { name: '손 인사', exact: true }).click()
  await expect.poll(async () => (await emote(page)).avatars[0]!.emote).toBe('EMOTE_WAVE')
  await page.locator('canvas').focus(); await page.keyboard.down('KeyW')
  await expect.poll(async () => (await emote(page)).avatars[0]!.emote).toBe('')
  expect((await emote(page)).readyAt).toBe(0)
  await page.keyboard.up('KeyW'); server.pose({ moving: false })
  await page.getByRole('button', { name: '감정표현 열기' }).click()
  await page.getByRole('dialog', { name: '감정표현 선택' }).getByRole('button', { name: '박수', exact: true }).click()
  await expect.poll(async () => (await emote(page)).avatars[0]!.emote).toBe('EMOTE_CLAP')
  expect(server.sent.filter(m => m.type === 'WORLD_EMOTE_SEND').map(m => m.payload.emoteCode)).toEqual(['WAVE', 'CLAP'])
  await screenshot(page, 'avatar-feedback-immediate-emote')
  expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

