import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fixture, tableId } from '../e2e/contractFixture'

type Box = { x: number; y: number; width: number; height: number }
type Measurement = Box & { viewport: string; players: number; state: string; name: string; draw: number; face: number }

const viewports = [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]
const states = ['turn', 'other', 'last'] as const
const output = path.resolve('../docs/qa/halligalli-status-bar')

async function load(page: Page, options: { players: number; state?: string; name?: string; draw?: number; face?: number }) {
  const query = new URLSearchParams(Object.entries(options).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))
  await page.goto(`/tests/halligalli-ui/status-bar-fixture.html?${query}`)
  const bar = page.locator('.hg-stage-seat[data-own]')
  await expect(bar).toBeVisible()
  return { bar, box: (await bar.boundingBox())! }
}

async function loadParkGame(page: Page, players: number, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport)
  const server = await fixture(page, { generatedPark: true, players, omok: true })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()),
    { timeout: 90_000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  server.tableSeat('101', { tableId, seatNumber: 1 })
  for (let index = 1; index < players; index++) server.tableSeat(String(101 + index), { tableId, seatNumber: index + 1 })
  await page.evaluate(async ({ players, tableId }) => {
    const [{ useGame }, { parseHalliGalli }, { useSession }] = await Promise.all([
      import('/src/game/store.ts' as string),
      import('/src/game/halligalli/protocol.ts' as string),
      import('/src/network/worldClient.ts' as string),
    ])
    const dealt = players === 2 ? 27 : players === 3 ? 18 : 13
    const publicState = {
      gameCode: 'HALLI_GALLI', status: 'PLAYING', version: 4, flipTimeLimitMs: 5000, resultPauseMs: 1000,
      turnUserId: '101', flipDeadline: new Date(Date.now() + 60_000).toISOString(), resultUntil: null,
      flipSeq: 4, bellWindowId: 4, issuedPenaltyCards: 0,
      lastEvent: { type: 'FLIP', userId: '102', at: new Date().toISOString(), cardCount: 1, issuedCards: 0 },
      players: Array.from({ length: players }, (_, index) => ({
        userId: String(101 + index), seat: index, drawCount: dealt, faceUpCount: 1, cardCount: dealt + 1,
        active: true, eliminated: false, forfeited: false, topCard: { fruit: index % 2 ? 'STRAWBERRY' : 'BANANA', count: index % 2 ? 3 : 2 },
      })),
      winnerUserIds: [], endReason: null, endedAt: null,
    }
    useSession.setState({ tableId, seatIndex: 0 })
    useGame.setState({
      game: { gameId: 'fixture-halligalli', version: 4, role: 'PLAYER', halli: parseHalliGalli(publicState) },
      permittedGameId: 'fixture-halligalli', recovery: 'RESTORED', pending: false, uncertain: false, awaitingVersion: -1,
    })
  }, { players, tableId })
  await expect(page.getByLabel('과일 땡', { exact: true })).toBeVisible()
  await expect.poll(() => page.locator('.halligalli-panel').getAttribute('data-layout'), { timeout: 15_000 })
    .toBe(viewport.width > 800 ? 'stage' : 'fixed')
  return page.getByLabel('과일 땡', { exact: true })
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x
  && a.y < b.y + b.height && a.y + a.height > b.y

test('2·3·4인과 표시 내용이 달라도 같은 해상도에서는 내 상태 바 크기와 위치가 일정하다', async ({ page }) => {
  const measurements: Measurement[] = []
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    for (const players of [2, 3, 4]) {
      const normalDraw = players === 2 ? 27 : players === 3 ? 18 : 13
      for (const state of states) {
        const { box } = await load(page, { players, state, draw: normalDraw, face: 1 })
        measurements.push({ ...box, viewport: `${viewport.width}x${viewport.height}`, players, state, name: '나', draw: normalDraw, face: 1 })
      }
      await load(page, { players, state: 'turn', draw: normalDraw, face: 1 })
      await page.screenshot({ path: path.join(output, `${viewport.width}x${viewport.height}-${players}players.png`) })
    }
    for (const variant of [
      { name: '아주 긴 플레이어 닉네임 검증', draw: 9, face: 1 },
      { name: '나', draw: 100, face: 99 },
    ]) {
      const { box } = await load(page, { players: 4, state: 'turn', ...variant })
      measurements.push({ ...box, viewport: `${viewport.width}x${viewport.height}`, players: 4, state: 'turn', ...variant })
    }
  }

  console.log(`HALLI_STATUS_BAR_MEASUREMENTS=${JSON.stringify(measurements)}`)
  if (process.env.HALLI_CAPTURE_ONLY === '1') return

  for (const viewport of viewports) {
    const sameViewport = measurements.filter(item => item.viewport === `${viewport.width}x${viewport.height}`)
    const reference = sameViewport[0]!
    for (const measurement of sameViewport) {
      expect(measurement.width).toBeCloseTo(reference.width, 0)
      expect(measurement.height).toBeCloseTo(reference.height, 0)
      expect(measurement.x).toBeCloseTo(reference.x, 0)
      expect(measurement.y).toBeCloseTo(reference.y, 0)
    }
  }
})

test('실제 공원 HUD에서 카드·종·채팅과 겹치지 않고 좁은 화면은 2D 레이아웃으로 전환한다', async ({ page }) => {
  for (const players of [2, 4]) {
    const panel = await loadParkGame(page, players, { width: 1920, height: 1080 })
    const bar = (await panel.locator('.hg-stage-seat[data-own]').boundingBox())!
    expect(bar.width).toBeCloseTo(820, 0)
    for (const selector of ['.hg-stage-face', '.hg-stage-bell', '.park-chat', '.hg-menu', '.park-quick-dock']) {
      const boxes = await page.locator(selector).evaluateAll(nodes => nodes.filter(node => {
        const style = getComputedStyle(node)
        return style.display !== 'none' && style.visibility !== 'hidden'
      }).map(node => {
        const rect = node.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      }))
      expect(boxes.every(box => !overlaps(bar, box)), `${selector}가 하단 상태 바와 겹치지 않아야 합니다.`).toBe(true)
    }
    await page.screenshot({ path: path.join(output, `park-1920x1080-${players}players.png`), animations: 'disabled' })
  }

  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    const panel = await loadParkGame(page, 4, viewport)
    const visible = await panel.locator('button, .hg-seat, .hg-stage-face').evaluateAll(nodes => nodes.filter(node => {
      const style = getComputedStyle(node)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }).map(node => {
      const rect = node.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }))
    expect(visible.every(box => box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1
      && box.y + box.height <= viewport.height + 1), `${viewport.width}×${viewport.height}에서 조작 요소가 잘리지 않아야 합니다.`).toBe(true)
    if (viewport.width > 800) {
      const bar = (await panel.locator('.hg-stage-seat[data-own]').boundingBox())!
      const chat = (await page.locator('.park-chat').boundingBox())!
      expect(overlaps(bar, chat), '1366×768에서 채팅과 하단 상태 바가 겹치지 않아야 합니다.').toBe(false)
    } else {
      await expect(panel).toHaveAttribute('data-layout', 'fixed')
      await expect(panel.locator('.hg-stage-seat[data-own]')).toHaveCount(0)
    }
    await page.screenshot({ path: path.join(output, `park-${viewport.width}x${viewport.height}-4players.png`), animations: 'disabled' })
  }
})
