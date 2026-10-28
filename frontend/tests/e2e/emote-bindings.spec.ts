import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

const choices = [
  { motion: 'EMOTE_WAVE', code: 'WAVE', label: '손 인사', cooldown: 5000 },
  { motion: 'EMOTE_CLAP', code: 'CLAP', label: '박수', cooldown: 5000 },
  { motion: 'EMOTE_APPLAUSE_REQUEST', code: 'APPLAUSE_REQUEST', label: '박수 부탁', cooldown: 1800 },
  { motion: 'EMOTE_TSK', code: 'TSK', label: '에잉 쯧쯧', cooldown: 1800 },
  { motion: 'EMOTE_FART', code: 'FART', label: '방귀 뿡', cooldown: 1800 },
] as const
const wheel = (page: Page) => page.getByRole('dialog', { name: '감정표현 선택' })
const probe = (page: Page): Promise<ReturnType<typeof import('./sceneProbe').emoteProbe>> =>
  page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).emoteProbe())
async function loaded(page: Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
}

test('deployed development mapping sends all five codes, waits for approval and renders both clients at server time', async ({ page, context }) => {
  const errors: string[] = [], consoleErrors: string[] = []
  const watch = (p: Page) => {
    p.on('pageerror', e => errors.push(e.message))
    p.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  }
  watch(page)
  // CONNECTED now synchronizes a monotonic server clock. Keep Date/performance
  // and fixture timestamps advancing together and wait for real cooldown deadlines.
  const a = await fixture(page, { emoteBindings: 'development', manualMovement: true, position: { x: 0, y: 0.8, z: 34, yaw: 0 } })
  await loaded(page)
  const observer = await context.newPage()
  watch(observer)
  const b = await fixture(observer, { emoteBindings: 'development', manualMovement: true, ownUserId: '102' })
  await loaded(observer)
  a.emoteResponse('hold')
  for (const choice of choices) {
    await page.getByRole('button', { name: '감정표현 열기' }).click()
    for (const option of choices)
      await expect(wheel(page).getByRole('button', { name: option.label, exact: true })).not.toContainText('서버')
    await expect(wheel(page).getByRole('button', { name: choice.label, exact: true })).toBeEnabled({ timeout: 8000 })
    const before = (await probe(page)).avatars[0]!
    await wheel(page).getByRole('button', { name: choice.label, exact: true }).click()
    await expect.poll(async () => (await probe(page)).pending).toBe(true)
    expect((await probe(page)).avatars[0]!.at).toBe(before.at)
    expect(a.sent.filter(m => m.type === 'WORLD_EMOTE_SEND').at(-1)!.payload).toEqual({ emoteCode: choice.code })
    const event = a.lastEmote()!
    a.completeEmote()
    b.emote(event)
    const cooldown = Date.parse(event.sentAt) + choice.cooldown
    await expect.poll(async () => (await probe(page)).readyAt).toBe(cooldown)
    await page.getByRole('button', { name: '감정표현 열기' }).click()
    await expect(wheel(page).getByRole('button', { name: choice.motion === 'EMOTE_WAVE' ? '박수' : '손 인사', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    for (const client of [page, observer]) {
      await expect.poll(async () => (await probe(client)).avatars[0]!.emote).toBe(choice.motion)
      expect((await probe(client)).avatars[0]!.at).toBe(Date.parse(event.sentAt))
    }
    expect((await probe(page)).readyAt).toBe(cooldown)
    if (choice.motion === 'EMOTE_FART') {
      await expect.poll(async () => (await probe(page)).avatars[0]!.cloudVisible).toBe(true)
      await expect.poll(async () => Math.abs((await probe(page)).avatars[0]!.headYaw ?? 0)).toBeGreaterThan(0.02)
    } else {
      await expect.poll(async () => {
        const arm = (await probe(page)).avatars[0]!.arm
        return arm && before.arm ? Math.hypot(...arm.map((v, i) => v - before.arm![i]!)) : 0
      }).toBeGreaterThan(0.15)
    }
    await screenshot(page, 'm04-server-' + choice.code)
    // The next iteration waits until the server timestamp's actual cooldown ends.
  }
  expect(a.sent.filter(m => m.type === 'WORLD_EMOTE_SEND').map(m => m.payload.emoteCode)).toEqual(choices.map(c => c.code))
  expect(b.sent.some(m => m.type === 'WORLD_EMOTE_SEND')).toBe(false)
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
  await observer.close()
})

test('mobile dev wheel has five server options; rejects stay visible and fart continues through movement', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.setViewportSize({ width: 390, height: 844 })
  const server = await fixture(page, { emoteBindings: 'development', position: { x: 0, y: 0.8, z: 34, yaw: 0 } })
  await loaded(page)
  server.emoteResponse('reject')
  await page.getByRole('button', { name: '감정표현 열기' }).click()
  for (const choice of choices) {
    await expect(wheel(page).getByRole('button', { name: choice.label, exact: true })).toBeEnabled()
    await expect(wheel(page).getByRole('button', { name: choice.label, exact: true })).not.toContainText('서버')
  }
  const box = await wheel(page).boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await screenshot(page, 'm04-five-server-options-mobile')
  await wheel(page).getByRole('button', { name: '박수 부탁', exact: true }).click()
  await expect(page.locator('.emotes').getByRole('alert')).toContainText('등록되지 않은 감정표현')
  expect((await probe(page)).avatars[0]!.emote).toBe('')
  expect((await probe(page)).readyAt).toBe(0)
  server.emoteResponse('approve')
  await page.getByRole('button', { name: '감정표현 열기' }).click()
  await wheel(page).getByRole('button', { name: '방귀 뿡', exact: true }).click()
  await expect.poll(async () => (await probe(page)).avatars[0]!.emote).toBe('EMOTE_FART')
  const cooldown = (await probe(page)).readyAt
  await page.locator('canvas').focus()
  await page.keyboard.down('KeyW')
  await expect.poll(() => server.sent.some(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz))).toBe(true)
  expect((await probe(page)).avatars[0]!.emote).toBe('EMOTE_FART')
  server.pose({ moving: true })
  expect((await probe(page)).avatars[0]!.emote).toBe('EMOTE_FART')
  await page.keyboard.up('KeyW')
  expect((await probe(page)).readyAt).toBe(cooldown)
  expect(server.sent.filter(m => m.type === 'WORLD_EMOTE_SEND').map(m => m.payload)).toEqual([{ emoteCode: 'APPLAUSE_REQUEST' }, { emoteCode: 'FART' }])
  expect(errors).toEqual([])
})

test('normal mode without deployment mappings keeps all five unavailable without mock fallback', async ({ page }) => {
  const server = await fixture(page, { emoteBindings: false })
  await loaded(page)
  await page.getByRole('button', { name: '감정표현 열기' }).click()
  for (const choice of choices) {
    const button = wheel(page).getByRole('button', { name: choice.label, exact: true })
    await expect(button).toBeDisabled()
    await expect(button).not.toContainText('미연결')
  }
  expect(server.sent.some(m => m.type === 'WORLD_EMOTE_SEND')).toBe(false)
})
