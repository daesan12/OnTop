import { expect, test, type Page } from '@playwright/test'
import { grandpaTiming, planGrandpaEvents } from '../../src/jump-rope-preview/grandpaEvent'
import { defaultRopeAcceleration, ropeTempo } from '../../src/jump-rope-preview/ropeAcceleration'

const seed = 409
const timing = grandpaTiming({ peak: 0.6, flightMs: 400 }, { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 })!
const plan = planGrandpaEvents(seed, { speed: 1, acceleration: defaultRopeAcceleration }, timing)
const swings = plan.flatMap(event => event.swings)
const v1 = ropeTempo(1, { profile: defaultRopeAcceleration, playedMs: 0 })
/** v2 passage = v1 passage + every earlier dangerous stretch. */
const passage = (turn: number) => v1.timeForTurns(turn)
  + swings.filter(swing => swing.kind === 'danger' && swing.anchor < turn).reduce((sum, swing) => sum + swing.stretchMs, 0)
const isDanger = (turn: number) => swings.some(swing => swing.kind === 'danger' && swing.anchor === turn)

/**
 * The page clock only moves when the test sets it. Every key handler first advances the round to the key's
 * time, so passages, broom contacts and the MISS freeze land at exact play times regardless of frame rate.
 */
function driver(page: Page) {
  let sceneMs = 0
  let offset = 0
  let next = 1
  const panel = page.getByLabel('할아버지 일정')
  const live = page.getByLabel('할아버지 실시간 상태')
  const judgement = page.getByLabel('실제 판정 상세')
  async function at(ms: number) {
    expect(ms).toBeGreaterThanOrEqual(sceneMs)
    sceneMs = ms
    await page.evaluate(value => (window as unknown as { setTestClock: (ms: number) => void }).setTestClock(value), ms)
  }
  const play = (ms: number) => at(offset + ms)
  async function jump(turn: number) {
    await play(passage(turn) - timing.perfectLeadMs)
    await page.keyboard.press('Space')
  }
  /** PERFECT through `last`, ducking under every dangerous broom unless told not to. */
  async function perfectThrough(last: number, skipDuck: number[] = []) {
    for (; next <= last; next++) {
      await jump(next)
      if (!isDanger(next) || skipDuck.includes(next)) continue
      await play(passage(next) + 200)
      await page.keyboard.down('ArrowDown')
      await play(passage(next) + timing.hitOffsetMs + 10)
      await page.keyboard.up('ArrowDown')
    }
  }
  return {
    panel, live, judgement, at, play, jump, perfectThrough,
    get scene() { return sceneMs },
    begin(ms: number) { offset = ms },
    skip(turn: number) { next = turn + 1 },
    /** After a MISS freeze, play resumes at `resumedAt` from the frozen passage. */
    resume(resumedAt: number, turn: number) { offset = resumedAt - passage(turn) },
  }
}

// The dev page is served only by the jump rope preview server. Run with playwright.jump-rope-grandpa.config.ts.
test.skip(({ baseURL }) => baseURL !== 'http://127.0.0.1:5206', 'jump rope preview server only')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const base = performance.now()
    let offset = 0
    ;(window as unknown as { setTestClock: (ms: number) => void }).setTestClock = ms => { offset = ms }
    performance.now = () => base + offset
  })
})

test('할아버지가 기존 방해와 함께 등장하고 숙이기 회피·피격 MISS·60초 완주가 기록된다', async ({ page }) => {
  await page.goto('/__dev/jump-rope.html')
  await page.getByLabel('고정 시드 (다음 판)').fill(String(seed))
  const game = driver(page)
  await game.at(1000)
  await page.getByRole('button', { name: '게임 시작' }).click()
  await expect(game.panel).toContainText('1차 15~30초 · 예정')
  for (const swing of swings) await expect(game.panel).toContainText(`${swing.anchor}번째 통과 뒤`)
  await game.at(4000)
  await page.keyboard.press('Space')
  game.begin(4000)

  // ArrowDown never scrolls the page, and either duck key keeps the posture until both are released.
  const scrollY = await page.evaluate(() => window.scrollY)
  await game.play(passage(1) - 700)
  await page.keyboard.down('ArrowDown')
  await page.keyboard.down('KeyS')
  await page.keyboard.down('ArrowDown')
  await game.play(passage(1) - 600)
  await page.keyboard.up('ArrowDown')
  await page.keyboard.press('Space')
  await expect(game.live).toContainText('숙이기 숙임')
  await page.keyboard.up('KeyS')
  await expect(game.live).toContainText('숙이기 서 있음')
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
  // Losing focus releases a held duck.
  await page.keyboard.down('ArrowDown')
  await expect(game.live).not.toContainText('숙이기 서 있음')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(game.live).toContainText('숙이기 서 있음')
  await page.keyboard.up('ArrowDown')

  const [firstSafe, firstDanger, secondDanger] = plan[0]!.swings
  // He shouts as he walks in, over his head on the canvas.
  await game.perfectThrough(firstSafe!.anchor - 1)
  await game.play(Math.max(passage(firstSafe!.anchor - 1) - 200, plan[0]!.startMs + 500))
  await page.keyboard.press('KeyS')
  await expect(page.locator('.grandpa-speech')).toBeVisible()
  await expect(page.locator('.grandpa-speech')).toHaveText('예끼 이놈들!')
  await game.perfectThrough(secondDanger!.anchor, [secondDanger!.anchor])
  await expect(page.locator('.grandpa-speech')).toBeHidden()
  await expect(game.judgement).toContainText(`${secondDanger!.anchor - 1}번째 통과 · PERFECT`)
  await expect(game.panel).toContainText(`2타 위험 · ${firstDanger!.anchor}번째 통과 뒤`)
  await expect(game.panel).toContainText('회피 성공')
  await expect(game.panel).toContainText('휘두름')

  // No duck: the broom stuns, Space is ignored, and the next passage is exactly one MISS.
  await game.play(passage(secondDanger!.anchor) + timing.hitOffsetMs + 5)
  // A tap only advances the round to now; the contact already happened standing up.
  await page.keyboard.press('KeyS')
  await expect(game.live).toContainText('스턴 있음')
  await expect(game.panel).toContainText('피격')
  await game.jump(secondDanger!.anchor + 1)
  await game.play(passage(secondDanger!.anchor + 1) + 0.5)
  await page.keyboard.press('Space')
  const missAt = game.scene
  await expect(game.judgement).toContainText(`${secondDanger!.anchor + 1}번째 통과 · MISS`)
  // The ignored Space left no new jump: the lead still measures the jump before the stun.
  const staleLead = Math.round(passage(secondDanger!.anchor + 1) - passage(secondDanger!.anchor) + timing.perfectLeadMs)
  await expect(game.judgement).toContainText(`입력 → 통과 ${staleLead}ms`)
  await expect(page.getByLabel('3회 중 2회 남음')).toBeVisible()
  await expect(game.live).toContainText('스턴 없음')
  await game.at(missAt + 1350)
  await page.keyboard.press('Space')
  game.resume(missAt + 1350, secondDanger!.anchor + 1)
  game.skip(secondDanger!.anchor + 1)
  await expect(page.getByLabel('현재 게임 상태')).toContainText('플레이 중')

  let last = 1
  while (passage(last + 1) < 60000) last++
  await game.perfectThrough(last)
  await game.play(60010)
  await page.keyboard.press('Space')
  await expect(page.getByLabel('현재 게임 상태')).toContainText('완주 엔딩')
  await game.at(game.scene + 4000)
  await page.keyboard.press('Space')
  await expect(page.getByLabel('현재 게임 상태')).toContainText('게임 종료')
  await expect(game.judgement).toContainText(`${last}번째 통과 · PERFECT`)
  await expect(game.panel).toContainText('1차 15~30초 · 완료')
  await expect(game.panel).toContainText('2차 40~60초 · 완료')
  await expect(game.panel).not.toContainText('예정')
  const stretch = plan[1]!.swings.reduce((sum, swing) => sum + swing.stretchMs, 0)
  await expect(game.live).toContainText(`줄 지연 누적 ${stretch.toFixed(3)}ms`)
})
