import { expect, test } from '@playwright/test'
import { fixture } from './contractFixture'
import { TELESCOPES } from '../../src/config'
import { telescopeAnchors } from '../../src/features/telescopes/anchors'

test('M06 keeps missing telescope service disabled outside facility-preview while Spring movement remains available', async ({ page }) => {
  const id = TELESCOPES[0]!.id
  const server = await fixture(page, { manualMovement: true, position: telescopeAnchors(id).use })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).orbit(0, 0.35, 6.8))
  await expect(page.getByLabel('가까운 상호작용').getByRole('button', { name: /망원경 서버 연결 필요/ })).toBeDisabled()
  await page.locator('canvas').focus()
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('complementary', { name: '전망 망원경', exact: true })).toBeHidden()
  await page.keyboard.down('KeyW')
  await expect.poll(() => server.sent.some(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz))).toBe(true)
  await page.keyboard.up('KeyW')
  expect(server.sent.some(m => /TELESCOPE/.test(m.type))).toBe(false)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
