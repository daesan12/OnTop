import { expect, test, type Page } from '@playwright/test'
import { bungeoppangFixture } from './bungeoppangFixture'
import { screenshot } from './contractFixture'

async function open(page: Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.locator('canvas').focus()
  await expect(page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true })).toBeVisible()
  const before = await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).sceneProbe())
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('region', { name: '붕어빵 굽기 시작' })).toBeVisible()
  return before
}
const state = (page: Page) => page.evaluate(async () => {
  const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
  const { bungeoppangClock: clock } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string)
  const s = useBungeoppang.getState()
  return { phase: s.phase, tool: s.tool, t: clock.t, log: s.grill?.log ?? [], slots: s.grill?.slots, score: s.grill?.score, result: s.result }
})

test('M14 original six-slot controls, actual 60s, same-key/result retries, server reward and abandon restore the park', async ({ page }) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const server = await bungeoppangFixture(page)
  server.loseNextStart(); server.loseNextComplete()
  const before = await open(page)
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('다시 시도')
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 12000 })
  const starts = server.requests.filter(r => r.method === 'POST' && r.path.endsWith('/sessions'))
  expect(starts).toHaveLength(2); expect(starts[0]!.key).toBe(starts[1]!.key)
  await expect(page.locator('.bung-slot-key')).toHaveCount(6)
  const keys = ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD']
  const firstPoint = await page.evaluate(async () => (await import('/src/features/bungeoppang/bungeoppangView.ts' as string)).slotScreen[0])
  await page.mouse.click(firstPoint.x, firstPoint.y)
  await expect.poll(async () => (await state(page)).slots?.[0]?.phase).toBe('batter')
  await page.waitForTimeout(80)
  for (const key of keys.slice(1)) { await page.keyboard.press(key); await page.waitForTimeout(80) }
  const pours = (await state(page)).log.length
  await page.keyboard.press('KeyQ'); expect((await state(page)).log).toHaveLength(pours)
  await page.mouse.move(750, 450); await page.mouse.wheel(0, 100)
  expect((await state(page)).tool).toBe('bean')
  await page.keyboard.press('Space'); await page.keyboard.press('Digit1')
  expect((await state(page)).tool).toBe('bean')
  for (const key of keys) { await page.keyboard.press(key); await page.waitForTimeout(80) }
  await page.keyboard.press('F1')
  await expect(page.getByRole('dialog', { name: '게임 설명서', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', {name: '붕어빵 굽기', exact: true})).toBeVisible()
  await expect(page.locator('.game-manual')).toHaveAttribute('data-phase', 'open')
  const help = await state(page)
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(400)
  expect((await state(page)).log).toHaveLength(help.log.length)
  expect((await state(page)).t).toBeGreaterThan(help.t)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '게임 설명서', exact: true })).toHaveCount(0)
  // Original pointer controls use the projected fixed slot hit boxes.
  const point = await page.evaluate(async () => (await import('/src/features/bungeoppang/bungeoppangView.ts' as string)).slotScreen[5])
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await expect.poll(async () => (await state(page)).log.at(-1)?.action).toBe('DISCARD')
  await page.waitForTimeout(80) // BE's global input minimum is 50ms.
  await page.keyboard.press('Shift+KeyS')
  await expect.poll(async () => (await state(page)).slots?.[4]?.phase).toBe('empty')
  await page.keyboard.press('Space'); expect((await state(page)).tool).toBe('batter')
  let captured = false
  while ((await state(page)).phase === 'play') {
    const s = await state(page)
    for (let i = 0; i < 4; i++) {
      const slot = s.slots?.[i]
      if (!slot || !['front', 'back'].includes(slot.phase)) continue
      const split = Math.min(Math.max(40000, slot.since), s.t)
      const level = Math.floor(((split - slot.since) * 6000 + (s.t - split) * 8000) * slot.heat / (8000 * 6000))
      if (level >= 76) { await page.keyboard.press(keys[i]!); await page.waitForTimeout(70) }
    }
    if (!captured && s.t > 9000) { await screenshot(page, 'm14-original-six-slot-cooking'); captured = true }
    await page.waitForTimeout(100)
  }
  await expect(page.getByRole('region', { name: '결과', exact: true })).toBeVisible({ timeout: 6000 })
  await expect(page.getByRole('button', { name: '다시 시도', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 하기', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page.getByRole('region', { name: '결과', exact: true })).toContainText('서버 정산 완료')
  const completed = server.requests.filter(r => r.path.endsWith('/complete'))
  expect(completed).toHaveLength(2); expect(completed[0]).toEqual(completed[1])
  const result = (await state(page)).result!
  expect(result.made).toBe(4); expect(result.score).toBeGreaterThan(0)
  await expect(page.getByLabel('내 정보')).toContainText(`${100 + result.coinsGranted}냥`)
  await screenshot(page, 'm14-server-result')
  const moving = server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz || m.payload.jump))
  expect(moving).toHaveLength(0)
  await page.getByRole('button', { name: '다시 하기', exact: true }).click()
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'countdown')
  const next = server.requests.filter(r => r.method === 'POST' && r.path.endsWith('/sessions')).at(-1)!
  expect(next.key).not.toBe(starts[0]!.key)
  server.rejectNextAbandon(); await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '그만두기', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText('잠시 사용할 수 없어요')
  await page.getByRole('button', { name: '그만두기', exact: true }).click()
  await expect(page.locator('.bung-root')).toHaveCount(0)
  const after = await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).sceneProbe())
  expect(after.ownVisible).toBe(true); expect(before.ownVisible).toBe(true)
  await expect(page.getByLabel('조작 방법')).toBeVisible()
  await page.locator('canvas').focus(); await page.keyboard.down('KeyS')
  await expect.poll(() => server.sent.some(m => m.type === 'WORLD_MOVE' && Number(m.payload.dz) > 0)).toBe(true)
  await page.keyboard.up('KeyS')
  expect(errors).toEqual([]); expect(await page.locator('vite-error-overlay').count()).toBe(0)
})

test('M14 unavailable BE remains an error, status retry never switches to local settlement', async ({ page }) => {
  const server = await bungeoppangFixture(page)
  server.failStatus(true); await open(page)
  await expect(page.getByRole('alert')).toContainText('서버 설정이 아직 준비되지')
  await expect(page.getByRole('button', { name: '시작', exact: true })).toBeDisabled()
  server.failStatus(false)
  await page.getByRole('button', { name: '상태 다시 확인', exact: true }).click()
  await expect(page.getByRole('button', { name: '시작', exact: true })).toBeEnabled()
  expect(server.games.size).toBe(0)
  await page.getByRole('button', { name: 'ESC 나가기', exact: true }).click()
  await expect(page.locator('.bung-root')).toHaveCount(0)
})
