import { expect, test } from '@playwright/test'
import { fixture } from './contractFixture'
import { MAILBOX } from '../../src/config'

test('M07 exposes the real compose UI but leaves submission unavailable outside facility-preview', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (/feedback|admin/i.test(new URL(request.url()).pathname) && request.method() !== 'GET') requests.push(request.url()) })
  const server = await fixture(page, { manualMovement: true, position: { x: MAILBOX.x - 1.5, y: 0.8, z: MAILBOX.z, yaw: 0 } })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).orbit(0, 0.35, 6.8))
  await page.getByLabel('가까운 상호작용').getByRole('button', { name: /소리함에 의견 쓰기/ }).click()
  const dialog = page.getByRole('dialog', { name: '온탑 소리함' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('서버 연결 준비 중')
  await dialog.getByLabel('의견 내용').fill('아직 연결되지 않은 의견입니다.')
  await expect(dialog.getByRole('button', { name: '의견 보내기', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.keyboard.down('KeyW')
  await expect.poll(() => server.sent.some(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz))).toBe(true)
  await page.keyboard.up('KeyW')
  expect(requests).toEqual([])
  expect(server.sent.some(m => /FEEDBACK|feedback-submit/.test(m.type))).toBe(false)
})
