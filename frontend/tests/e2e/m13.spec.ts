import { test, expect } from '@playwright/test'
import { fixture, screenshot, tableId } from './contractFixture'
test('M13 public-reference preview retains real WS and never gives spectators a secret, input or result permission', async ({ page }) => {
  const server = await fixture(page, { omok: true, m09: true, bridge: 4 }), errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/park'); await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
  await page.evaluate(async tableId => (await import('/tests/e2e/sceneProbe.ts' as string)).previewPublicMatch({ channelId: 'fixture-channel', tableId, gameId: 'fixture-confirmed-bridge' }), tableId)
  await page.getByRole('button', { name: '미리보기 경기 참조 확인' }).click(); await page.getByRole('button', { name: '경기 관전', exact: true }).click()
  const p = page.getByRole('region', { name: '다리 경기', exact: true })
  await expect(p).toContainText('거짓말 다리 관전')
  server.bridgeSnapshot({ stage: 'DECLARING' }, null, 'SPECTATOR')
  await expect(p.getByLabel('나만 보는 주사위')).toHaveCount(0)
  expect(await page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game?.secret)).toBeNull()
  await expect(p.getByRole('button', { name: /굴리기|선언|믿기|다우트|기권|정산 결과/ })).toHaveCount(0)
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).bridgeProbe().count)).toBe(28)
  await screenshot(page, 'm13-spectator')
  await p.getByRole('button', { name: '최신 다리 확인' }).click(); await p.getByRole('button', { name: '테이블 둘러보기' }).click(); await p.getByRole('button', { name: '공개 판 보기' }).click()
  await p.getByRole('button', { name: '관전 종료' }).click(); await expect(p).toHaveCount(0)
  expect(server.sent.some(m => m.type === 'GAME_ACTION_SEND' || m.type === 'GAME_RESULT_CHECK')).toBe(false); expect(errors).toEqual([])
})
