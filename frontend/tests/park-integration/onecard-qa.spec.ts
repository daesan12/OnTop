import { expect, test } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'
import { openingDuration } from '../../src/game/onecard/opening'

test('셔플 후 양쪽 손에 일곱 장을 나누고 작은 채팅과 기권 카드 비행·15초 정리를 유지한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const server = await fixture(page, { generatedPark: true, omok: true, onecard: 2, onecardDealMs: openingDuration(2),
    forfeit: true, parkDebris: true, spectatorEvents: true, manualLobby: true, tabletServer: true })
  const opening = () => page.evaluate(async () =>
    (await import('/tests/e2e/onecardSceneProbe.ts' as string)).oneCardOpeningProbe())
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await tablet.getByRole('button', { name: /원카드/ }).click()
  await tablet.getByLabel('1인 참가비').fill('1')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox', { name: '참가 금액을 확인했어요' }).check()
  await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true)
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  await expect.poll(async () => (await opening()).phase).toBe('shuffle')
  await screenshot(page, 'onecard-qa-shuffle')
  await expect.poll(async () => (await opening()).flying).toBeGreaterThan(0)
  await screenshot(page, 'onecard-qa-dealing')
  await expect.poll(async () => (await opening()).visible).toBe(false)
  const hands = await page.evaluate(async () =>
    (await import('/tests/e2e/onecardSceneProbe.ts' as string)).oneCardSceneProbe().players)
  expect(hands.slice(0, 2).map((hand: { displayedCount: number }) => hand.displayedCount)).toEqual([7, 7])
  const chat = page.locator('.park-chat')
  expect((await chat.boundingBox())!.width).toBeLessThanOrEqual(231)
  expect((await chat.boundingBox())!.height).toBeLessThanOrEqual(140)
  await chat.getByRole('button', { name: '채팅 입력창 열기' }).click()
  await chat.locator('input').fill('작은 채팅 확인')
  await chat.locator('input').press('Enter')
  await expect(chat.getByRole('log')).toContainText('작은 채팅 확인')
  await screenshot(page, 'onecard-qa-compact-chat')
  await page.getByRole('button', { name: '기권', exact: true }).click()
  await page.getByRole('button', { name: '기권 확정', exact: true }).click()
  await expect.poll(async () => (await opening()).pieces.length).toBe(1)
  await page.waitForTimeout(1000)
  const flying = (await opening()).pieces[0]!
  expect(flying.visible).toBe(true)
  expect(flying.positions).toHaveLength(14)
  expect(flying.positions.some((p: number[]) => p[1]! > 1.2)).toBe(true)
  await screenshot(page, 'onecard-qa-forfeit-cards')
  await expect.poll(async () => (await opening()).pieces.length, { timeout: 16000 }).toBe(0)
  expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
