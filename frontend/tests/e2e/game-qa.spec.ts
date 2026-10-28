import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

const kinds = ['OMOK', 'DICE', 'ONE_CARD', 'LIAR_BRIDGE'] as const
type Kind = typeof kinds[number]
const selection = { OMOK: '오목 선택', DICE: '주사위 한 판 선택', ONE_CARD: '원카드 선택', LIAR_BRIDGE: '거짓말 다리 건너기 선택' }
const labels = { OMOK: '오목 경기', DICE: '주사위 경기', ONE_CARD: '원카드 경기', LIAR_BRIDGE: '다리 경기' }
async function loaded(page: Page) {
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await expect.poll(() => page.evaluate(async () => {
    const s = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    return s.status === 'connected' && s.mapCompatible && !s.pending && s.tables.length > 0
  })).toBe(true)
}
async function prepare(page: Page, kind: Kind = 'OMOK') {
  const server = await fixture(page, { omok: true, manualMovement: true,
    ...(kind === 'DICE' ? { dice: true } : kind === 'ONE_CARD' ? { m09: true, onecard: 2 } : kind === 'LIAR_BRIDGE' ? { m09: true, bridge: 2 } : {}) })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop'); await loaded(page)
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
  await page.getByRole('button', { name: '앉기', exact: true }).click()
  await page.getByLabel('1인 참가비', { exact: true }).fill('1')
  await page.getByRole('button', { name: selection[kind], exact: true }).click()
  return server
}
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', error => list.push(error.message))
  page.on('console', message => { if (message.type() === 'error') list.push(message.text()) })
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

for (const kind of kinds) test(`${kind}: game start closes an open map and blocks menus and direct opening`, async ({ page }) => {
  const server = await prepare(page, kind)
  await page.getByRole('button', { name: '테이블 정보 닫기', exact: true }).click()
  await page.getByRole('button', { name: '공원 지도', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '공원 지도창', exact: true })).toBeVisible()
  server.confirmStart()
  await expect(page.getByRole('region', { name: labels[kind], exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '공원 지도창', exact: true })).toHaveCount(0)
  if (kind === 'OMOK') {
    await expect(page.getByRole('button', { name: '공원 지도', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '옷장', exact: true })).toHaveCount(0)
  } else {
    await expect(page.getByRole('button', { name: '공원 지도', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '옷장', exact: true })).toBeDisabled()
  }
  await page.locator('canvas').focus(); await page.keyboard.press('KeyM')
  expect(await page.evaluate(async () => {
    const map = await import('/src/features/navigation/navigationState.ts' as string)
    const wardrobe = await import('/src/features/wardrobe/state.ts' as string)
    map.openParkMap(); wardrobe.openWardrobe()
    return { map: map.useParkMap.getState().open, wardrobe: wardrobe.useWardrobe.getState().open }
  })).toEqual({ map: false, wardrobe: false })
  await screenshot(page, `qa-game-menu-${kind.toLowerCase()}`)
  expect(server.sent.some(message => message.type === 'TABLE_LEAVE')).toBe(false)
})

for (const exit of ['TABLE_LEFT', 'TABLE_STATE'] as const) test(`finished result stays cleared after ${exit}, late messages and reload`, async ({ page }) => {
  const server = await prepare(page)
  await page.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  await expect(page.getByRole('region', { name: '오목 경기', exact: true })).toBeVisible()
  server.finishGame(); server.settle(); server.nextRound()
  await expect(page.getByRole('region', { name: '테이블 함께 보기', exact: true })).toContainText('정산 완료')
  if (exit === 'TABLE_LEFT') await page.getByRole('button', { name: '자리에서 일어나기', exact: true }).click()
  else server.unseatViaState()
  await expect(page.getByRole('region', { name: '테이블 함께 보기', exact: true })).toHaveCount(0)
  server.restoreGame(); server.settle(); server.flushGame()
  await expect(page.getByRole('region', { name: '오목 경기', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '공원 지도', exact: true })).toBeEnabled()
  await page.reload(); await loaded(page)
  // A new JS session receives the same historical terminal recovery from the server.
  server.restoreGame(); server.settle(); server.flushGame()
  await expect.poll(() => page.evaluate(async () => {
    const s = (await import('/src/game/store.ts' as string)).useGame.getState()
    return { game: s.game, result: s.result, lastResult: s.lastResult, permitted: s.permittedGameId }
  })).toEqual({ game: null, result: null, lastResult: null, permitted: '' })
  await expect(page.getByRole('region', { name: '오목 경기', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '옷장', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '공원 지도', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '공원 지도창', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await screenshot(page, `qa-result-cleared-${exit.toLowerCase()}`)
})
