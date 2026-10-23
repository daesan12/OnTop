import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { NOTES_BOX } from '../../src/config/notes'

const near = { x: NOTES_BOX.x - 1.5, y: NOTES_BOX.y + .8, z: NOTES_BOX.z, yaw: 0 }
const body = '오늘도 잘하고 있어요! 이곳에서 잠시 쉬어가요.'
const dialog = (page: Page) => page.getByRole('dialog', { name: '전망대 익명 메모', exact: true })
const area = (page: Page) => dialog(page).getByLabel('새 메모', { exact: true })
const wall = (page: Page) => dialog(page).getByRole('region', { name: '익명 메모 목록' })
const hint = (page: Page) => page.getByLabel('가까운 상호작용').getByRole('button', { name: /익명 메모 소리함 열기/ })
async function probe(page: Page): Promise<ReturnType<typeof import('./sceneProbe').notesProbe>> {
  return page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).notesProbe())
}
async function fault(page: Page, mode: Parameters<typeof import('./sceneProbe').fixtureNotes>[0]) {
  await page.evaluate(async mode => (await import('/tests/e2e/sceneProbe.ts' as string)).fixtureNotes(mode), mode)
}
async function loaded(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).orbit(0, .35, 6.8))
  await page.locator('canvas').focus()
}
async function opened(page: Page) {
  await expect(hint(page)).toBeEnabled(); await hint(page).click()
  await expect(dialog(page)).toBeVisible()
  await expect(wall(page)).toHaveAttribute('aria-busy', 'false')
}

test('M08 uses the summit E target, protects typing and retains failed drafts before one anonymous acknowledgement', async ({ page }) => {
  const errors: string[] = [], consoleErrors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  const server = await fixture(page, { manualMovement: true, position: near })
  await loaded(page); await expect(hint(page)).toBeEnabled()
  const before = (await probe(page)).controls
  await page.keyboard.press('KeyE')
  await expect(dialog(page)).toBeVisible(); await expect(area(page)).toBeFocused()
  await expect(wall(page)).toContainText('아직 메모가 없어요')
  await expect(dialog(page)).toContainText('개발 목업')
  await area(page).fill('   ')
  await expect(dialog(page).getByRole('button', { name: '익명으로 붙이기', exact: true })).toBeDisabled()
  await page.keyboard.press('KeyW'); await page.keyboard.press('KeyG'); await page.keyboard.press('Enter')
  await page.keyboard.press('F1')
  await expect(page.getByRole('dialog', { name: '감정표현 선택' })).toBeHidden()
  await expect(page.getByLabel('주변 채팅 메시지')).toBeHidden()
  const box = await area(page).boundingBox()
  await page.mouse.move(box!.x + 20, box!.y + 20); await page.mouse.down()
  await page.mouse.move(box!.x + 100, box!.y + 40); await page.mouse.up(); await page.mouse.wheel(0, -300)
  expect((await probe(page)).controls).toEqual(before)
  expect(server.sent.some(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz || m.payload.jump))).toBe(false)
  await area(page).fill(body); await fault(page, 'reject')
  await dialog(page).getByRole('button', { name: '익명으로 붙이기', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('저장 실패')
  await expect(area(page)).toHaveValue(body)
  const key = (await probe(page)).operationId
  await screenshot(page, 'm08-failure-retains-draft')
  await fault(page, 'normal')
  await dialog(page).getByRole('button', { name: '같은 메모 다시 붙이기', exact: true }).click()
  await expect(dialog(page).getByRole('status')).toContainText('개발 목업에 메모를 붙였어요')
  await expect(area(page)).toHaveValue(''); await expect(wall(page).getByText(body, { exact: true })).toHaveCount(1)
  const after = await probe(page)
  expect(after.calls.map(c => c.operationId)).toEqual([key, key])
  expect(Object.keys(after.notes[0]!).sort()).toEqual(['createdAt', 'id', 'text'])
  expect(after.publicData).not.toContain(body); expect(JSON.stringify(server.sent)).not.toContain(body)
  await expect(dialog(page).getByRole('button', { name: /초 후 붙이기/ })).toBeDisabled()
  await screenshot(page, 'm08-posted')
  await page.keyboard.press('Escape'); await expect(dialog(page)).toBeHidden()
  await opened(page); await expect(wall(page).getByText(body, { exact: true })).toHaveCount(1)
  await page.keyboard.press('Escape'); await page.keyboard.down('KeyW')
  await expect.poll(() => server.sent.some(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz))).toBe(true)
  await page.keyboard.up('KeyW')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([]); expect(consoleErrors).toEqual([])
})

test('M08 rejects ground bypass, separates read failure from empty and refreshes a nearby mock writer', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true, position: { ...near, y: .8 } })
  await loaded(page); await expect(hint(page)).toBeHidden()
  expect(await page.evaluate(async () => (await import('/src/features/notes/controller.ts' as string)).openNotes())).toBe(false)
  const direct = await page.evaluate(async () => {
    const { notesService } = await import('/src/features/notes/service.ts' as string)
    const { NOTES_BOX } = await import('/src/config/notes.ts' as string)
    const scope = { userId: '101', channelId: 'fixture-channel', position: { x: NOTES_BOX.x, y: .8, z: NOTES_BOX.z, yaw: 0 } }
    const results = await Promise.allSettled([notesService.read(scope, new AbortController().signal),
      notesService.submit(scope, { text: '지상 우회', operationId: 'ground' }, new AbortController().signal)])
    return results.map(r => r.status)
  })
  expect(direct).toEqual(['rejected', 'rejected'])
  server.pose(near); await expect(hint(page)).toBeEnabled()
  await fault(page, 'readReject'); await hint(page).click()
  await expect(dialog(page).getByRole('alert')).toContainText('목록 조회 실패')
  await expect(wall(page)).not.toContainText('아직 메모가 없어요')
  await fault(page, 'normal'); await dialog(page).getByRole('button', { name: '새로고침', exact: true }).click()
  await expect(wall(page)).toContainText('아직 메모가 없어요')
  const text = '다른 이웃의 익명 메모'
  await page.evaluate(async text => (await import('/tests/e2e/sceneProbe.ts' as string)).fixtureNearbyNote(text), text)
  await expect(wall(page).getByText(text, { exact: true })).toBeVisible()
  expect((await probe(page)).notes).toHaveLength(1)
  await screenshot(page, 'm08-nearby-refresh')
})

test('M08 recovers an accepted but lost response using one intent and one note', async ({ page }) => {
  await fixture(page, { manualMovement: true, position: near }); await loaded(page); await opened(page)
  await area(page).fill(body); await fault(page, 'acceptThenLose')
  await dialog(page).getByRole('button', { name: '익명으로 붙이기', exact: true }).click()
  await expect.poll(async () => (await probe(page)).accepted.length).toBe(1)
  await expect(dialog(page).getByRole('alert')).toContainText('응답 시간이 초과', { timeout: 15_000 })
  await expect(area(page)).toHaveValue(body)
  const before = await probe(page)
  await dialog(page).getByRole('button', { name: '새로고침', exact: true }).click()
  await expect(wall(page).getByText(body, { exact: true })).toHaveCount(1)
  await dialog(page).getByRole('button', { name: '같은 메모 다시 붙이기', exact: true }).click()
  await expect(area(page)).toHaveValue('')
  const after = await probe(page)
  expect(after.accepted).toEqual([before.accepted[0], before.accepted[0]])
  expect(after.calls.map(c => c.operationId)).toEqual([before.operationId, before.operationId])
  await expect(wall(page).getByText(body, { exact: true })).toHaveCount(1)
})

test('M08 cancels closed/disconnected visits, restores same-user drafts and clears them on auth end', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true, position: near })
  await loaded(page); await opened(page); await area(page).fill(body); await fault(page, 'hold')
  await dialog(page).getByRole('button', { name: '익명으로 붙이기', exact: true }).click()
  await expect.poll(async () => (await probe(page)).pending).toBe(true)
  await page.keyboard.press('Escape'); await expect(dialog(page)).toBeHidden()
  const previous = await probe(page); expect(previous.pending).toBe(false)
  await opened(page); await expect(area(page)).toHaveValue(body)
  await dialog(page).getByRole('button', { name: '같은 메모 다시 붙이기', exact: true }).click()
  await expect.poll(async () => (await probe(page)).pending).toBe(true)
  server.close(1012); await expect(dialog(page)).toBeHidden()
  await expect.poll(() => server.connections, { timeout: 15_000 }).toBe(2)
  await opened(page); await expect(area(page)).toHaveValue(body)
  expect((await probe(page)).operationId).toBe(previous.operationId)
  server.endSession(); await expect(page.locator('.login-page')).toBeVisible()
  expect((await probe(page)).draft).toBe(''); expect((await probe(page)).ownerId).toBe('')
})

test('M08 keeps mobile controls and focus usable and closes a forced ground approach', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true, position: near })
  await loaded(page); await page.setViewportSize({ width: 390, height: 844 }); await opened(page)
  await area(page).fill('작은 화면에서도 마음 한 장 남겨요.')
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).fixtureNearbyNote('오늘의 전망도 참 좋아요.'))
  await expect(wall(page).getByText('오늘의 전망도 참 좋아요.')).toBeVisible()
  const box = await dialog(page).boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(844)
  await page.keyboard.press('Tab')
  expect(await dialog(page).evaluate(node => node.contains(document.activeElement))).toBe(true)
  await screenshot(page, 'm08-mobile')
  server.pose({ ...near, y: .8 }); await expect(dialog(page)).toBeHidden()
  expect((await probe(page)).draft).toBe('작은 화면에서도 마음 한 장 남겨요.')
  expect(await page.evaluate(async () => (await import('/src/features/notes/controller.ts' as string)).openNotes())).toBe(false)
})
