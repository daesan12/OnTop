import { expect, test } from '@playwright/test'
import { fixture } from './contractFixture'
import { NOTES_BOX } from '../../src/config/notes'

test('M08 keeps the compose UI but no fake list or submission outside facility-preview', async ({ page }) => {
  const writes: string[] = []
  page.on('request', r => { if (/notes|memo/i.test(new URL(r.url()).pathname) && r.method() !== 'GET') writes.push(r.url()) })
  const server = await fixture(page, { manualMovement: true,
    position: { x: NOTES_BOX.x - 1.5, y: NOTES_BOX.y + .8, z: NOTES_BOX.z, yaw: 0 } })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).orbit(0, .35, 6.8))
  await page.getByLabel('가까운 상호작용').getByRole('button', { name: /익명 메모 소리함 열기/ }).click()
  const dialog = page.getByRole('dialog', { name: '전망대 익명 메모', exact: true })
  await expect(dialog).toBeVisible(); await expect(dialog).toContainText('서버 연결 준비 중')
  await expect(dialog).not.toContainText('아직 메모가 없어요')
  await dialog.getByLabel('새 메모', { exact: true }).fill('서버 연결 후 게시할 글')
  await expect(dialog.getByRole('button', { name: '익명으로 붙이기', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '새로고침', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden()
  await page.keyboard.down('KeyW')
  await expect.poll(() => server.sent.some(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz))).toBe(true)
  await page.keyboard.up('KeyW')
  expect(writes).toEqual([]); expect(server.sent.some(m => /NOTES|notes-read|note-submit/i.test(m.type))).toBe(false)
})
