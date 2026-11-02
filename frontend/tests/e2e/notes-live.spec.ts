import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { createNotesFixtureStore, notesFixture } from './notesFixture'
import { NOTES_BOX } from '../../src/config/notes'

const near = { x: NOTES_BOX.x - 1.5, y: NOTES_BOX.y + .8, z: NOTES_BOX.z, yaw: 0 }
const dialog = (page: Page) => page.getByRole('dialog', { name: '전망대 익명 메모', exact: true })
const area = (page: Page) => dialog(page).getByLabel('새 메모', { exact: true })
const wall = (page: Page) => dialog(page).getByRole('region', { name: '익명 메모 목록' })
async function open(page: Page) {
  await page.getByLabel('가까운 상호작용').getByRole('button', { name: /익명 메모 소리함 열기/ }).click()
  await expect(wall(page)).toHaveAttribute('aria-busy', 'false')
}
async function loaded(page: Page, positionSelf?: () => void) {
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  positionSelf?.()
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).orbit(0, .35, 6.8))
  await open(page)
}

test('notes changes reach a second session while preserving its draft, category and caret', async ({ page, browser }, info) => {
  const otherContext = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: 1440, height: 1000 } })
  try {
    const other = await otherContext.newPage(), errors: string[] = []
    for (const tab of [page, other]) tab.on('pageerror', error => errors.push(error.message))
    const writer = await fixture(page, { manualMovement: true, position: near })
    const reader = await fixture(other, { manualMovement: true, position: near, ownUserId: '102' })
    const store = createNotesFixtureStore()
    const writes = await notesFixture(page, store), reads = await notesFixture(other, store)
    store.changed = revision => { writer.notesChanged(revision); reader.notesChanged(revision) }
    await loaded(page); await loaded(other, () => reader.remotePose(near))
    const idleReads = [writes.reads, reads.reads]
    await page.waitForTimeout(2200)
    expect([writes.reads, reads.reads]).toEqual(idleReads)
    await dialog(other).getByRole('button', { name: /메모 작성하기/ }).click()
    await dialog(other).getByRole('button', { name: /고민/ }).click()
    const draft = '작성 중인 마음은 그대로 남아 있어야 해요.'
    await area(other).fill(draft)
    const originalInput = await area(other).elementHandle()
    await area(other).evaluate((input: HTMLTextAreaElement) => { input.focus(); input.setSelectionRange(4, 11) })

    await dialog(page).getByRole('button', { name: /메모 작성하기/ }).click()
    await dialog(page).getByRole('button', { name: /응원/ }).click()
    const text = '오늘도 응원해요! '.repeat(40).slice(0, 299) + '!'
    await area(page).fill(text)
    await dialog(page).getByRole('button', { name: /메모 남기기/ }).click()
    await expect(dialog(page).getByRole('heading', { name: '메모가 등록되었어요!' })).toBeVisible()
    expect(writes.requests[0]).toMatchObject({ text, category: 'cheer' })
    expect(writes.acceptedCount).toBe(1)
    await expect.poll(() => reads.reads).toBe(idleReads[1]! + 1)
    await expect(area(other)).toHaveValue(draft)
    await expect(area(other)).toBeFocused()
    expect(await originalInput!.evaluate(input => input === document.getElementById('anonymous-note-text'))).toBe(true)
    expect(await area(other).evaluate((input: HTMLTextAreaElement) => [input.selectionStart, input.selectionEnd])).toEqual([4, 11])
    await expect(dialog(other).getByRole('button', { name: /고민/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(area(other)).toHaveAttribute('maxlength', '300')
    await dialog(other).getByRole('button', { name: '메모함으로 돌아가기', exact: false }).click()
    await dialog(other).getByRole('button', { name: '응원', exact: true }).click()
    await expect(wall(other).getByText(text, { exact: true })).toHaveCount(1)
    await screenshot(other, 'notes-live-category-reader')
    const finalReads = [writes.reads, reads.reads]
    await page.waitForTimeout(2300)
    expect([writes.reads, reads.reads]).toEqual(finalReads)
    expect(writer.maxActive).toBe(1); expect(reader.maxActive).toBe(1)
    expect(JSON.stringify([...writer.sent, ...reader.sent])).not.toContain(text)
    expect(errors).toEqual([])
  } finally { await otherContext.close() }
})

test('notes revisions coalesce during a slow read, ignore duplicates and stop when the board closes', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true, position: near })
  const rest = await notesFixture(page)
  rest.add('이미 읽던 메모', 'daily')
  await loaded(page)
  const initialReads = rest.reads
  rest.readMode('holdRead')
  rest.add('다른 사용자가 추가한 메모', 'cheer')
  server.notesChanged('9007199254740992')
  await expect.poll(() => rest.reads).toBe(initialReads + 1)
  server.notesChanged('9007199254740993')
  server.notesChanged('9007199254740993')
  server.notesChanged('9007199254740992')
  await expect(wall(page)).toContainText('이미 읽던 메모')
  await page.waitForTimeout(1300)
  expect(rest.reads).toBe(initialReads + 1)
  rest.readMode('normal'); await rest.release()
  await expect.poll(() => rest.reads).toBe(initialReads + 2)
  await expect(wall(page)).toContainText('다른 사용자가 추가한 메모')
  server.notesChanged('9007199254740993'); server.notesChanged('invalid'); server.notesChanged(1)
  await page.waitForTimeout(2100)
  expect(rest.reads).toBe(initialReads + 2)
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  rest.add('닫힌 동안 추가된 메모', 'free')
  server.notesChanged('9007199254740994')
  await page.waitForTimeout(1300)
  expect(rest.reads).toBe(initialReads + 2)
  await open(page)
  await expect(wall(page)).toContainText('닫힌 동안 추가된 메모')
})

test('notes reconnect reloads the list and accepts a fresh revision stream', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true, position: near })
  const rest = await notesFixture(page)
  await loaded(page)
  server.notesChanged('100')
  await expect.poll(() => rest.reads).toBe(2)
  server.close(1013)
  await expect(dialog(page)).toBeHidden()
  await expect.poll(() => server.connections).toBe(2)
  await open(page)
  const before = rest.reads
  rest.add('재접속 후 새 메모', 'recommend')
  server.notesChanged('1')
  await expect.poll(() => rest.reads).toBe(before + 1)
  await expect(wall(page)).toContainText('재접속 후 새 메모')
  expect(server.maxActive).toBe(1)
})
