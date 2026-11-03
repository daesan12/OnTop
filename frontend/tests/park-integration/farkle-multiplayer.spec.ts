import { expect, test } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'

for (const count of [2, 3, 4] as const) test(`DICE ${count} participants select seats, see every score and keep turn authority`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
  const server = await fixture(page, { generatedPark: true, dice: true, omok: true, players: count, manualLobby: true, tabletServer: true,
    publicProfiles: { '102': { nickname: '솔바람', characterGender: 'FEMALE' }, '103': { nickname: '돌담', characterGender: 'MALE' }, '104': { nickname: '나래', characterGender: 'FEMALE' } } })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await expect(tablet).toBeVisible()
  await tablet.getByRole('button', { name: '주사위 한 판', exact: false }).first().click()
  await tablet.getByRole('button', { name: `${count}인`, exact: true }).click()
  await tablet.getByLabel('주사위 목표 점수').selectOption('6000')
  await tablet.getByLabel('1인 참가비').fill('5')
  await screenshot(page, `dice-${count}-tablet`)
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await expect(tablet.locator('.tablet-person')).toHaveCount(count)
  await tablet.getByRole('checkbox').check()
  await tablet.getByRole('button', { name: '준비 완료', exact: true }).click(); server.readyTabletOthers(true)
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  expect(server.sent.filter(m => m.type === 'TABLE_CONFIGURE').at(-1)?.payload).toMatchObject({ gameCode: 'DICE', selectedPlayers: count, targetScore: 6000 })
  const hud = page.getByRole('region', { name: '주사위 경기', exact: true }), bar = hud.locator('.farkle-scoreboard')
  await expect(bar.locator('.farkle-player-score')).toHaveCount(count)
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).farkleProbe().cameraReady), { timeout: 15000 }).toBe(true)
  const roll = hud.getByRole('button', { name: /^R / })
  server.diceReply({ kind: 'roll', selectedIds: [] }, { stage: 'SELECTING', rollId: 1, lastEvent: 'ROLL',
    dice: [1, 5, 2, 3, 4, 6].map((value, id) => ({ id, value, held: false })) })
  await roll.click()
  await hud.getByLabel('게임 설정', { exact: true }).click()
  await hud.getByRole('button', { name: '판 시점 고정', exact: true }).click()
  await hud.getByLabel('게임 설정', { exact: true }).click()
  const players = ['101', '102', '103', '104'].slice(0, count)
  server.diceSnapshot({ players, scores: players.map((_, i) => (i + 1) * 500), turnUserId: players.at(-1)!,
    turnDeadline: new Date(Date.now() + 30000).toISOString(), stage: 'AWAITING_ROLL', dice: [], lastEvent: 'BANK', round: 2 })
  await expect(bar.locator('.active')).toContainText(count === 4 ? '나래 차례' : count === 3 ? '돌담 차례' : '솔바람 차례')
  await expect(roll).toBeDisabled()
  const sends = server.sent.filter(m => m.type === 'GAME_ACTION_SEND').length
  await page.keyboard.press('KeyR'); await page.keyboard.press('KeyQ')
  expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND')).toHaveLength(sends)
  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size)
    await expect(bar).toBeInViewport({ ratio: 1 })
    for (const score of await bar.locator('.farkle-player-score').all()) await expect(score).toBeInViewport({ ratio: 1 })
    const scoreBoxes = await bar.locator('.farkle-player-score').evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect(), total = node.querySelector('strong')!.getBoundingClientRect()
      return { left: r.left, right: r.right, totalLeft: total.left, totalRight: total.right, width: node.clientWidth, content: node.scrollWidth }
    }))
    for (const box of scoreBoxes) {
      expect(box.content).toBeLessThanOrEqual(box.width + 1)
      expect(box.totalLeft).toBeGreaterThanOrEqual(box.left)
      expect(box.totalRight).toBeLessThanOrEqual(box.right)
    }
    for (let i = 1; i < scoreBoxes.length; i++) expect(scoreBoxes[i]!.left).toBeGreaterThanOrEqual(scoreBoxes[i - 1]!.right - 1)
    const bank = hud.getByRole('button', { name: /^Q 점수 챙기기/ })
    await bank.scrollIntoViewIfNeeded(); await expect(bank).toBeInViewport({ ratio: 1 })
    await screenshot(page, `dice-${count}-players-${size.width}x${size.height}`)
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
  if (count > 2) {
    server.diceSnapshot({ forfeitedUserIds: ['102'], lastEvent: 'PLAYER_LEFT' })
    await expect(bar.locator('[data-forfeited=true]')).toContainText('솔바람 · 기권')
    await expect(bar.locator('.active')).not.toContainText('기권')
  }
  await hud.getByRole('button', { name: 'T 점수표', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '주사위 점수표', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '경기 채팅', exact: true })).toBeHidden()
  await page.keyboard.press('KeyT')
  await expect(page.getByRole('dialog', { name: '주사위 점수표', exact: true })).toBeHidden()
  await expect(page.getByRole('region', { name: '경기 채팅', exact: true })).toBeVisible()
  server.diceSnapshot({ status: 'FINISHED', stage: 'FINISHED', scores: players.map((_, index) => index === 0 ? 6500 : index * 500),
    turnUserId: null, turnDeadline: null, winnerUserId: '101', endReason: 'TARGET_REACHED', endedAt: new Date().toISOString() })
  server.finishGame('TARGET_REACHED'); server.settle()
  const result = page.getByRole('dialog', { name: '경기 결과', exact: true })
  await expect(result).toBeVisible()
  await expect(result.getByLabel('참가자 결과').getByRole('listitem')).toHaveCount(count)
  await expect(result.getByRole('heading', { name: '승리', exact: true })).toBeVisible()
  await screenshot(page, `dice-${count}-result`)
  server.nextRound()
  await expect(result.getByRole('button', { name: '다음 판 준비', exact: true })).toBeEnabled()
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size)
    const next = result.getByRole('button', { name: '다음 판 준비', exact: true })
    await next.evaluate(node => node.scrollIntoView({ block: 'center' }))
    await expect(next).toBeInViewport({ ratio: 1 }); await next.click({ trial: true })
    const leave = result.getByRole('button', { name: '자리에서 일어나기', exact: true })
    await leave.evaluate(node => node.scrollIntoView({ block: 'center' }))
    await expect(leave).toBeInViewport({ ratio: 1 }); await leave.click({ trial: true })
    expect(await result.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await screenshot(page, `dice-${count}-result-${size.width}x${size.height}`)
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
  await result.getByRole('button', { name: '다음 판 준비', exact: true }).click()
  await expect(tablet).toBeVisible()
  await tablet.getByRole('button', { name: '일어나기', exact: true }).click()
  await expect(tablet).toBeHidden()
  await expect(page.getByRole('button', { name: 'E 테이블에 앉기', exact: true })).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([])
})

test('DICE four-player spectator shares the same scorebar and identifies the actual preceding player', async ({ page }) => {
  const server = await fixture(page, { generatedPark: true, dice: true, omok: true, players: 4, publicSpectator: true, ownUserId: '505',
    publicProfiles: { '101': { nickname: '가람', characterGender: 'MALE' }, '102': { nickname: '솔바람', characterGender: 'FEMALE' }, '103': { nickname: '돌담', characterGender: 'MALE' }, '104': { nickname: '나래', characterGender: 'FEMALE' } } })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await page.getByRole('button', { name: 'E 관전하기', exact: true }).click()
  const hud = page.getByRole('region', { name: '주사위 경기', exact: true }), bar = hud.locator('.farkle-scoreboard')
  server.diceSnapshot({ scores: [500, 1000, 1500, 2000], turnUserId: '104', lastEvent: 'BANK', round: 4 }, 'SPECTATOR')
  await expect(bar.locator('.farkle-player-score')).toHaveCount(4)
  await expect(hud.getByRole('status').first()).toContainText('돌담 점수 챙기기')
  for (const size of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await expect(bar).toBeInViewport({ ratio: 1 })
    await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).farkleProbe().cameraReady), { timeout: 15000 }).toBe(true)
    await screenshot(page, `dice-four-spectator-${size.width}`)
  }
  expect(server.sent.filter(m => m.type === 'GAME_ACTION_SEND' || m.type === 'GAME_FORFEIT')).toHaveLength(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
