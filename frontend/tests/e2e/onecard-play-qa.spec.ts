import { test, expect, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import type { Card, Hand } from '../../src/game/onecard/protocol'

const panel = (page: Page) => page.getByLabel('원카드 경기', { exact: true })
const privateCards = (page: Page) => page.getByLabel('나만 볼 수 있는 카드').getByRole('button')
const failures = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => { const errors: string[] = []; failures.set(page, errors)
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) }) })
test.afterEach(({ page }) => { expect(failures.get(page)).toEqual([]) })
async function start(page: Page) {
  const server = await fixture(page, { omok: true, m09: true, onecard: 4, players: 4, onecardPranks: true })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().bindings.length)).toBeGreaterThan(0)
  await page.getByRole('button', { name: /테이블에 앉기/ }).click()
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
  await page.getByLabel('1인 참가비').fill('1'); await page.getByRole('button', { name: '원카드 선택', exact: true }).click()
  await page.getByRole('button', { name: '준비', exact: true }).click(); server.confirmStart()
  await expect(privateCards(page)).toHaveCount(7)
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.46))
  return server
}
function hand(count: number): Hand {
  const cards: Card[] = (['hearts', 'diamonds', 'clubs', 'spades'] as const).flatMap(suit =>
    ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map(rank => ({ id: `${suit}-${rank}`, suit, rank })))
    .filter(card => card.id !== 'hearts-5').slice(0, count)
  return { userId: '101', hand: cards, playableCardIds: cards.filter(card => card.suit === 'hearts' || card.rank === '5').map(card => card.id), canDraw: true }
}
test('all private cards fit in one fan, turn cue updates, and the command tray stays compact', async ({ page }) => {
  const server = await start(page), cue = page.getByRole('status', { name: '현재 차례', exact: true })
  await expect(cue).toContainText('내 차례'); await expect(cue).toHaveAttribute('data-own', 'true')
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    let previous = Infinity
    for (const count of [7, 17, 39]) {
      server.cardSnapshot({ turnDeadline: new Date(Date.now() + 60000).toISOString(), drawCount: 41 - count,
        players: server.cardState().players.map((p, i) => ({ ...p, cardCount: i === 0 ? count : [0, 4, 4, 4][i]! })) }, hand(count))
      await expect(privateCards(page)).toHaveCount(count)
      await expect(page.getByRole('navigation', { name: '손패 묶음 탐색' })).toHaveCount(0)
      await page.mouse.move(1, 1)
      const size = await privateCards(page).first().evaluate(node => parseFloat(getComputedStyle(node).width))
      expect(size).toBeLessThanOrEqual(previous); previous = size
      await expect.poll(() => privateCards(page).evaluateAll(cards => cards.every(card => {
        const bounds = card.getBoundingClientRect(); return bounds.left >= -.5 && bounds.right <= innerWidth + .5 && bounds.bottom <= innerHeight
      }))).toBe(true)
      const tray = (await page.locator('.onecard-command-tray').boundingBox())!
      expect(tray.height).toBeLessThan(viewport.width < 800 ? 125 : 95)
      await expect.poll(() => page.evaluate(async () =>
        (await import('/tests/e2e/onecardSceneProbe.ts' as string)).oneCardDeckTarget().flight)).toBe(false)
      await screenshot(page, `onecard-fit-${count}-${viewport.width}`)
      if (count === 39) {
        const playable = hand(count).playableCardIds
        for (const id of [playable[0]!, playable[Math.floor(playable.length / 2)]!, playable.at(-1)!]) {
          const card = page.locator(`[data-card-id="${id}"]`)
          await page.mouse.move(1, 1)
          const exposed = await card.evaluate(node => {
            const bounds = node.getBoundingClientRect()
            for (let y = bounds.top + 3; y < bounds.bottom - 3; y += 3)
              for (let x = bounds.left + 2; x < bounds.right - 2; x += 2)
                if (document.elementFromPoint(x, y)?.closest('button') === node) return { x, y }
            return null
          })
          expect(exposed, `${id} has a directly selectable surface`).not.toBeNull()
          await page.mouse.click(exposed!.x, exposed!.y)
          await expect(card).toHaveAttribute('aria-pressed', 'true')
          await card.click(); await expect(card).toHaveAttribute('aria-pressed', 'false')
        }
      }
    }
  }
  server.cardSnapshot({ turnUserId: '102', turnCount: 2 }, { ...hand(39), playableCardIds: [], canDraw: false })
  await expect(cue).toHaveAttribute('data-own', 'false'); await expect(cue).toContainText('참가자 2의 차례')
  server.cardSnapshot({ turnUserId: '101', turnCount: 3 }, hand(39))
  await expect(cue).toHaveAttribute('data-own', 'true')
  await page.emulateMedia({ reducedMotion: 'reduce' }); expect(await cue.evaluate(node => getComputedStyle(node).animationName)).toBe('none')
})

test('a visible hand approaches slowly, right-click equips the hammer once, and a late hit blocks it', async ({ page }) => {
  const server = await start(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(async () => (await import('/tests/e2e/onecardSceneProbe.ts' as string)).settleOneCardCamera())
  const before: number[] = await page.evaluate(async () => (await import('/tests/e2e/onecardSceneProbe.ts' as string)).oneCardSceneProbe().position)
  server.cardPranks.reach()
  const reach = panel(page).getByRole('button', { name: /의 손 막기$/ })
  await expect(reach).toBeVisible(); await expect(panel(page).locator('[data-flipped=true]')).toHaveCount(0)
  expect(await reach.locator('img').evaluate(node => Number(getComputedStyle(node).opacity))).toBeGreaterThanOrEqual(.95)
  const first = await reach.evaluate(node => getComputedStyle(node).transform)
  await page.waitForTimeout(1100)
  expect(await reach.evaluate(node => getComputedStyle(node).transform)).not.toBe(first)
  await expect(reach).toBeVisible(); await expect(panel(page).locator('[data-flipped=true]')).toHaveCount(0)
  await page.mouse.click(1000, 400, { button: 'right' })
  await expect(panel(page).getByRole('button', { name: '뿅망치 내려놓기', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const after: number[] = await page.evaluate(async () => (await import('/tests/e2e/onecardSceneProbe.ts' as string)).oneCardSceneProbe().position)
  expect(after.every((value, i) => Math.abs(value - before[i]!) < .001)).toBe(true)
  await screenshot(page, 'onecard-qa-slow-hand-armed', 'allow')
  const target = (await reach.locator('img').boundingBox())!
  await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2)
  await expect(panel(page).locator('.onecard-hammer[data-strike-phase=hit]')).toBeVisible()
  await expect(panel(page).locator('[data-flipped=true]')).toHaveCount(0)
  expect(server.sent.filter(packet => packet.type === 'ONECARD_PRANK_HIT_SEND')).toHaveLength(1)
  await page.mouse.click(1000, 400, { button: 'right' })
  await expect(panel(page).getByRole('button', { name: '뿅망치 들기', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: '채팅 입력창 열기', exact: true }).click()
  const chat = page.getByRole('textbox', { name: '경기 채팅 메시지', exact: true }); await chat.click({ button: 'right' })
  await expect(panel(page).getByRole('button', { name: '뿅망치 들기', exact: true })).toHaveAttribute('aria-pressed', 'false')
})
