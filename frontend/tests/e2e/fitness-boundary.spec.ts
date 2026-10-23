import { expect, test } from '@playwright/test'
import { fixture } from './contractFixture'
import { FITNESS_STATIONS } from '../../src/config'
import { fitnessAnchors } from '../../src/features/fitness/anchors'

test('M05 normal development keeps unavailable fitness disabled and preserves the existing park connection', async ({ page }) => {
  const station = FITNESS_STATIONS[0]!
  const server = await fixture(page, { manualMovement: true, position: fitnessAnchors(station.id).exit })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  const hint = page.getByLabel('가까운 상호작용')
  await expect(hint).toHaveAttribute('data-fitness-id', station.id)
  await expect(hint.getByRole('button', { name: /운동기구 서버 연결 필요/ })).toBeDisabled()
  await page.locator('canvas').focus()
  await page.keyboard.press('KeyE')
  expect(await page.evaluate(async id => (await import('/tests/e2e/sceneProbe.ts' as string)).fitnessProbe(id).fitnessId, station.id)).toBe('')
  await page.keyboard.press('Enter')
  await page.getByLabel('주변 채팅 메시지').fill('기존 채팅 연결 유지')
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('주변 채팅')).toContainText('기존 채팅 연결 유지')
  expect(server.sent.some(message => /FITNESS|use-fitness|leave-fitness/.test(message.type))).toBe(false)
  expect(server.maxActive).toBe(1)
})
