import { expect, test } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
import { parkFixture, identity } from './fixture'
import { PARK_DATA } from '../../src/map/park'

test('latest-map fitness entry shows reward terms, refreshes confirmed money once, and permits exit', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const server = await parkFixture(page, { fitnessRewardsEnabled: true })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length), { timeout: 90000 }).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(async () => (await import('/src/features/facilities/state.ts' as string)).useFacilityState.getState().ready)).toBe(true)
  expect(await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().mapVersion)).toBe(identity.mapVersion)
  const station = PARK_DATA.interactions.fitness[0]!
  server.place({ x: station.position[0], y: station.position[1] + .8, z: station.position[2] })
  const hint = page.getByRole('complementary', { name: '가까운 상호작용' })
  await expect(hint).toHaveAttribute('data-target-id', station.id)
  await hint.getByRole('button').click()
  await expect(hint).toContainText('게임 6시간마다 1냥')
  const revision = () => page.evaluate(async () => (await import('/src/features/wallet/settlementRefresh.ts' as string)).useWalletSettlement.getState().revision)
  const before = await revision()
  const receipt = { userId: '101', receipt: 'fitness:01234567-89ab-cdef-0123-456789abcdef:1' }
  server.emit('FITNESS_REWARD', receipt)
  await expect.poll(revision).toBe(before + 1)
  server.emit('FITNESS_REWARD', receipt)
  await expect.poll(revision).toBe(before + 1)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.screenshot({ path: path.join(os.tmpdir(), 'ontop-fitness-reward.png') })
  await page.setViewportSize({ width: 740, height: 900 })
  await expect(hint).toBeInViewport()
  const rewardText = hint.getByText('게임 6시간마다 1냥 · 하차·접속 종료 시 시간 초기화', { exact: true })
  expect(await rewardText.evaluate(element => {
    const box = element.getBoundingClientRect()
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
  })).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: path.join(os.tmpdir(), 'ontop-fitness-reward-narrow.png') })
  await page.keyboard.press('KeyW')
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().fitnessId)).toBe('')
  expect(errors).toEqual([])
})
