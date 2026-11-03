import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'

async function start(page: Page) {
  const server = await fixture(page, { generatedPark: true, omok: true, dice: true, manualLobby: true, tabletServer: true, spectatorEvents: true,
    publicProfiles: { '102': { nickname: '솔바람', characterGender: 'FEMALE' } } })
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  server.configureTablet({ gameCode: 'DICE', playerCount: 2, betAmountPerPlayer: 1, targetScore: 4000 }); server.confirmStart()
  await expect(page.getByRole('region', { name: '주사위 경기', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).farkleProbe().cameraReady)).toBe(true)
  return server
}
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', error => list.push(error.message))
  page.on('console', message => { if (message.type() === 'error') list.push(message.text()) })
})
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0) })

test('long chat leaves the clock, dice and both primary actions visible without scrolling', async ({ page }) => {
  const server = await start(page), hud = page.getByRole('region', { name: '주사위 경기', exact: true })
  server.diceReply({ kind: 'roll', selectedIds: [] }, { stage: 'SELECTING', rollId: 1, lastEvent: 'ROLL',
    dice: [2, 2, 2, 3, 4, 5].map((value, id) => ({ id, value, held: false })) })
  await hud.getByRole('button', { name: /^R / }).click()
  await hud.getByRole('button', { name: '주사위 1: 2', exact: true }).click()
  await expect(hud.getByRole('status')).toContainText('눈이 2인 주사위 2개를 더 선택하세요.')
  await expect(hud.getByRole('button', { name: /^Q / })).toBeDisabled()
  await screenshot(page, 'feedback-selection-hint')
  for (const id of [2, 3]) await hud.getByRole('button', { name: `주사위 ${id}: 2`, exact: true }).click()
  await expect(hud.getByRole('button', { name: /^Q / })).toHaveAccessibleName('Q 점수 챙기기 · 200점')
  for (let i = 0; i < 2; i++) server.spectatorEvent('chat', { senderUserId: '102', text: `대화 ${i + 1} ${'긴 대화가 들어온 상태에서도 게임 진행을 확인합니다. '.repeat(4)}`.trim() })
  await expect(page.getByRole('log')).toContainText('대화 2')
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1366, height: 768 }, { width: 1672, height: 941 }]) {
    await page.setViewportSize(size)
    await expect.poll(() => hud.evaluate(node => {
      const a = node.querySelector('.farkle-actions')!.getBoundingClientRect(), m = node.querySelector('.farkle-message')!.getBoundingClientRect()
      const s = node.querySelector('.farkle-scoreboard')!.getBoundingClientRect(), c = document.querySelector('.park-chat')!.getBoundingClientRect()
      const overlap = (x: DOMRect, y: DOMRect) => x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top
      const visible = (element: Element) => { const r = element.getBoundingClientRect(); return r.top >= a.top && r.bottom <= a.bottom && r.left >= a.left && r.right <= a.right }
      return { noOverlap: !overlap(a, m) && !overlap(a, s) && !overlap(a, c),
        buttonsVisible: [...node.querySelectorAll('.button-row button,.farkle-dice-list button')].every(visible),
        inViewport: a.top >= 0 && a.bottom <= innerHeight,
        actions: a.toJSON(), clock: m.toJSON(), chat: c.toJSON(),
        buttons: [...node.querySelectorAll('.button-row button')].map(e => e.getBoundingClientRect().toJSON()) }
    }), { message: `${size.width}×${size.height}: no hidden primary controls or covered clock` }).toMatchObject({ noOverlap: true, buttonsVisible: true, inViewport: true })
    await screenshot(page, `feedback-chat-layout-${size.width}x${size.height}`)
  }
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND')).toHaveLength(1)
})

test('scorebook keeps the deadline and close visible while scrolling and announces server turn changes', async ({ page }) => {
  const server = await start(page)
  server.diceSnapshot({ turnDeadline: new Date(Date.now() + 5000).toISOString() })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.keyboard.press('KeyT')
  const sheet = page.getByRole('dialog', { name: '주사위 점수표', exact: true }), timer = sheet.getByRole('timer')
  await expect(sheet).toBeVisible(); const before = Number.parseInt((await timer.textContent())!)
  await page.waitForTimeout(1100)
  await expect.poll(async () => Number.parseInt((await timer.textContent())!)).toBeLessThan(before)
  await sheet.getByRole('button', { name: '점수표 닫기', exact: true }).press('End')
  await expect(sheet.locator('footer small')).toBeInViewport({ ratio: 1 })
  await expect(timer).toBeInViewport({ ratio: 1 }); await expect(sheet.getByRole('button', { name: '점수표 닫기', exact: true })).toBeInViewport({ ratio: 1 })
  server.diceSnapshot({ turnUserId: '102', round: 2, lastEvent: 'TURN_TIMEOUT', turnDeadline: new Date(Date.now() + 30000).toISOString() })
  await expect(sheet.getByRole('status')).toContainText('차례가 바뀌었습니다. 솔바람 차례입니다.')
  await expect(timer).toBeInViewport({ ratio: 1 }); await expect(sheet).toBeVisible()
  await screenshot(page, 'feedback-scorebook-turn-change')
  await page.keyboard.press('Escape'); await expect(sheet).toBeHidden()
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND')).toHaveLength(0)
})

test('BUST reveals the confirmed server faces in the tray and HUD after the roll', async ({ page }) => {
  const server = await start(page), hud = page.getByRole('region', { name: '주사위 경기', exact: true })
  const dice = [2, 3, 4, 6, 2, 3].map((value, id) => ({ id, value, held: false }))
  server.diceReply({ kind: 'roll', selectedIds: [] }, { dice: [], stage: 'AWAITING_ROLL', rollId: 1, round: 2, lastEvent: 'BUST', turnUserId: '102',
    turnDeadline: new Date(Date.now() + 30000).toISOString(), lastRoll: { rollId: 1, actorUserId: '101', dice } })
  await hud.getByRole('button', { name: /^R / }).click()
  await expect(hud).toHaveAttribute('data-presentation', 'bust-rolling')
  await expect(hud.getByRole('group', { name: '허탕 굴림 결과', exact: true })).toHaveCount(0)
  await expect(hud).toHaveAttribute('data-presentation', 'bust-result')
  const result = await page.evaluate(async () => (await import('/tests/park-integration/farkleMotionProbe.ts' as string)).farkleMotionProbe().result)
  expect(result.map((die: { face: number }) => die.face)).toEqual(dice.map(die => die.value))
  await expect(hud.getByRole('group', { name: '허탕 굴림 결과', exact: true }).getByRole('button')).toHaveCount(6)
  await screenshot(page, 'feedback-confirmed-bust')
  await expect(hud).toHaveAttribute('data-presentation', 'live')
  await expect(hud.getByRole('group', { name: '허탕 굴림 결과', exact: true })).toHaveCount(0)
  await expect(hud).toContainText('솔바람 차례')
})
