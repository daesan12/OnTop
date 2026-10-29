import { test, expect } from '@playwright/test'
import { fixture, screenshot, tableId } from './contractFixture'
test('M12 spectator receives only public cards/counts; existing preview reference grants no private/action permissions', async ({ page }) => {
  const server = await fixture(page, { omok: true, onecard: 4, m09: true, players: 4 }), errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/park'); await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
  await page.evaluate(async tableId => (await import('/tests/e2e/sceneProbe.ts' as string)).previewPublicMatch({ channelId: 'fixture-channel', tableId, gameId: 'fixture-confirmed-onecard' }), tableId)
  await page.getByRole('button', { name: '미리보기 경기 참조 확인' }).click(); await page.getByRole('button', { name: '경기 관전', exact: true }).click()
  const p = page.getByRole('region', { name: '원카드 경기', exact: true })
  await expect(p.getByRole('button', { name: '관전 종료', exact: true })).toBeVisible(); await expect(p.getByLabel('나만 볼 수 있는 카드')).toHaveCount(0)
  await expect(p.getByRole('button', { name: /내기|뽑기|넘기기|기권|신고|원카드!|정산 결과/ })).toHaveCount(0)
  expect(await page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game?.hand)).toBeNull()
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).onecardProbe().backs)).toBe(28)
  await screenshot(page, 'm12-spectator')
  await p.getByRole('button', { name: '테이블 둘러보기' }).click(); await p.getByRole('button', { name: '공개 판 보기' }).click()
  await p.getByRole('button', { name: '관전 종료' }).click(); await expect(p).toHaveCount(0)
  expect(server.sent.some(m => m.type === 'GAME_ACTION_SEND' || m.type === 'GAME_RESULT_CHECK')).toBe(false)
  expect(errors).toEqual([])
})
