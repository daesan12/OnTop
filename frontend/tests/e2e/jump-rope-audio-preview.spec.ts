import { expect, test, type Page } from '@playwright/test'
import { finaleImpactMs, finaleResultMs } from '../../src/jump-rope-preview/gameOverFinale'
import { grandpaTiming, grandpaWindupMs, planGrandpaEvents } from '../../src/jump-rope-preview/grandpaEvent'
import { shoutFromMs } from '../../src/jump-rope-preview/grandpaPose'
import { broomSwingLeadMs } from '../../src/jump-rope-preview/jumpRopeAudioCues'
import { poopImpactMs } from '../../src/jump-rope-preview/poopDistractionMotion'
import { defaultRopeAcceleration, ropeTempo } from '../../src/jump-rope-preview/ropeAcceleration'
import { playedSounds, recordJumpRopeAudio, startedSounds } from './jumpRopeAudioProbe'

/**
 * The final sound pack on the unranked preview. The page clock moves only when the test sets it, and every key
 * advances the round to that time first. jumpRopeAudioProbe records the page's real Web Audio calls by file name,
 * so these checks see what actually started and stopped, not only what the game asked for.
 */
const timing = grandpaTiming({ peak: 0.6, flightMs: 400 }, { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 })!
const v1 = ropeTempo(1, { profile: defaultRopeAcceleration, playedMs: 0 })
const seed = 409
const plan = planGrandpaEvents(seed, { speed: 1, acceleration: defaultRopeAcceleration }, timing)
const swings = plan.flatMap(event => event.swings)
const passage = (turn: number) => v1.timeForTurns(turn)
  + swings.filter(swing => swing.kind === 'danger' && swing.anchor < turn).reduce((sum, swing) => sum + swing.stretchMs, 0)
const isDanger = (turn: number) => swings.some(swing => swing.kind === 'danger' && swing.anchor === turn)
/**
 * Scene time of the first play millisecond. The round starts at 1 s and its countdown ends at 4 s; frames land 10 ms past
 * each boundary, because the end time carries float rounding and a frame exactly on it may still read the previous cue.
 */
const goAt = 4010

test.skip(({ baseURL }) => baseURL !== 'http://127.0.0.1:5206', 'jump rope preview server only')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const base = performance.now()
    let offset = 0
    const clock = window as unknown as { setTestClock: (ms: number) => void; testClock: () => number }
    clock.setTestClock = ms => { offset = ms }
    clock.testClock = () => offset
    performance.now = () => base + offset
  })
  await recordJumpRopeAudio(page)
})

function driver(page: Page) {
  let scene = 0
  async function at(ms: number) {
    expect(ms).toBeGreaterThanOrEqual(scene)
    scene = ms
    await page.evaluate(value => (window as unknown as { setTestClock: (ms: number) => void }).setTestClock(value), ms)
  }
  /** Keys go to the window, so a focused panel button never swallows them. */
  async function key(type: 'keydown' | 'keyup', code: string) {
    await page.evaluate(([type, code]) => { window.dispatchEvent(new KeyboardEvent(type!, { code, bubbles: true, cancelable: true })) }, [type, code])
  }
  /** An S tap presses and releases the duck at one instant: it only advances the round to now. */
  const tick = async () => { await key('keydown', 'KeyS'); await key('keyup', 'KeyS') }
  return { at, key, tick, played: () => playedSounds(page), starts: () => startedSounds(page), get scene() { return scene } }
}

async function startRound(page: Page) {
  await page.goto('/__dev/jump-rope.html')
  await page.getByLabel('고정 시드 (다음 판)').fill(String(seed))
  const game = driver(page)
  await game.at(1000)
  await page.getByRole('button', { name: '게임 시작' }).click()
  return game
}

const panelLog = (page: Page) => page.getByLabel('사운드 재생 기록').locator('li[data-sound]').evaluateAll(items =>
  items.map(item => `${(item as HTMLElement).dataset.sound}:${(item as HTMLElement).dataset.event}`).reverse())

test('카운트다운 3·2·1·GO, GO 이후 BGM, MISS 비웃음, 게임 오버 피날레가 한 번씩 재생되고 다시 시작하면 정리된다', async ({ page }) => {
  const responses = new Map<string, number>()
  page.on('response', response => {
    const match = /\/audio\/jump-rope\/(.+)$/.exec(new URL(response.url()).pathname)
    if (match) responses.set(match[1]!, response.status())
  })
  const game = await startRound(page)
  await expect.poll(game.starts).toEqual(['countdown_tick'])
  for (const ms of [2010, 3010]) {
    await game.at(ms)
    await game.tick()
  }
  await expect.poll(game.starts).toEqual(['countdown_tick', 'countdown_tick', 'countdown_tick'])
  await game.at(goAt)
  await game.tick()
  await expect.poll(game.starts).toEqual(['countdown_tick', 'countdown_tick', 'countdown_tick', 'game_go'])
  // The loop waits until the 550 ms GO banner is gone.
  await game.at(goAt + 500)
  await game.tick()
  await game.at(goAt + 560)
  await game.tick()
  await expect.poll(game.starts).toEqual(['countdown_tick', 'countdown_tick', 'countdown_tick', 'game_go', 'bgm_comedy_loop'])
  expect((await game.played()).find(item => item.file === 'bgm_comedy_loop')!.loop).toBe(true)
  // Every pack file was fetched once the gesture opened audio, and nothing else from the pack folder.
  await expect.poll(() => responses.size).toBe(12)
  expect([...responses.values()].every(status => status === 200)).toBe(true)

  // No jumps: three MISS laughs. The third stops the loop, then the finale splat and the sting at the result.
  const laughs = async () => (await game.starts()).filter(file => file === 'pigeon_miss_laugh').length
  for (let guard = 0; guard < 400 && await laughs() < 3; guard++) {
    await game.at(game.scene + 50)
    await game.tick()
  }
  await expect(page.getByLabel('현재 게임 상태')).toContainText('게임 오버 연출')
  const third = (await game.played()).filter(item => item.kind === 'start' && item.file.endsWith('pigeon_miss_laugh')).at(-1)!
  expect((await game.played()).some(item => item.kind === 'stop' && item.file === 'bgm_comedy_loop')).toBe(true)
  for (let guard = 0; guard < 80 && !(await game.starts()).includes('game_over'); guard++) {
    await game.at(game.scene + 50)
    await game.tick()
  }
  const played = await game.played()
  const splat = played.find(item => item.kind === 'start' && item.file.endsWith('pigeon_poop_splat'))!
  const sting = played.find(item => item.kind === 'start' && item.file.endsWith('game_over'))!
  expect(splat.at - third.at).toBeGreaterThanOrEqual(finaleImpactMs)
  expect(splat.at - third.at).toBeLessThan(finaleImpactMs + 60)
  expect(sting.at - third.at).toBeGreaterThanOrEqual(finaleResultMs)
  // The 2 s laugh has finished before the game-over sting.
  expect(sting.at - third.at).toBeGreaterThan(2000)
  expect(await game.starts()).toEqual(['countdown_tick', 'countdown_tick', 'countdown_tick', 'game_go', 'bgm_comedy_loop',
    'pigeon_miss_laugh', 'pigeon_miss_laugh', 'pigeon_miss_laugh', 'pigeon_poop_splat', 'game_over'])
  expect(await panelLog(page)).not.toContain('gameOver:skip')

  // A restart silences the round and counts down again; the loop only returns after the next GO.
  const before = (await game.played()).length
  await page.getByRole('button', { name: '다시 시작' }).click()
  await expect.poll(async () => (await game.played()).slice(before).filter(item => item.kind === 'start').map(item => item.file))
    .toEqual(['sfx/countdown_tick'])
  expect(await panelLog(page)).toEqual(['countdownTick:play'])
})

test('할아버지 등장 보이스·위험 스윙 준비·스윙·피격이 애니메이션 시각에 한 번씩 나고 비웃음은 다음 줄 MISS에서 난다', async ({ page }) => {
  const game = await startRound(page)
  await game.at(goAt)
  await game.tick()
  const play = (ms: number) => game.at(goAt + ms)
  const visit = plan[0]!
  const [safe, , second] = visit.swings
  const contact = second!.plannedHitMs
  const actions: { at: number; act: () => Promise<void> }[] = [
    { at: visit.startMs + shoutFromMs + 10, act: game.tick },
    { at: contact + 10, act: game.tick },
    { at: passage(second!.anchor + 1) + 10, act: game.tick },
  ]
  for (const swing of visit.swings) {
    if (swing.kind === 'danger') actions.push({ at: swing.plannedHitMs - grandpaWindupMs + 10, act: game.tick })
    actions.push({ at: swing.plannedHitMs - broomSwingLeadMs + 10, act: game.tick })
  }
  for (let turn = 1; turn <= second!.anchor; turn++) {
    actions.push({ at: passage(turn) - timing.perfectLeadMs, act: () => game.key('keydown', 'Space').then(() => game.key('keyup', 'Space')) })
    if (!isDanger(turn) || turn === second!.anchor) continue
    actions.push({ at: passage(turn) + 200, act: () => game.key('keydown', 'ArrowDown') })
    actions.push({ at: passage(turn) + timing.hitOffsetMs + 10, act: () => game.key('keyup', 'ArrowDown') })
  }
  actions.sort((a, b) => a.at - b.at)
  for (const { at, act } of actions) {
    await play(at)
    await act()
  }
  await expect(page.getByLabel('할아버지 실시간 상태')).toContainText('스턴 없음')
  await expect(page.getByLabel('3회 중 2회 남음')).toBeVisible()

  const raid = new Set(['grandpa_enter_voice', 'broom_windup', 'broom_swing', 'broom_hit', 'pigeon_miss_laugh'])
  const played = (await game.played()).filter(item => item.kind === 'start' && raid.has(item.file.replace(/^sfx\//, '')))
  expect(played.map(item => item.file.replace(/^sfx\//, ''))).toEqual([
    'grandpa_enter_voice', 'broom_swing', 'broom_windup', 'broom_swing', 'broom_windup', 'broom_swing', 'broom_hit', 'pigeon_miss_laugh',
  ])
  const due = [
    visit.startMs + shoutFromMs, safe!.plannedHitMs - broomSwingLeadMs,
    ...visit.swings.slice(1).flatMap(swing => [swing.plannedHitMs - grandpaWindupMs, swing.plannedHitMs - broomSwingLeadMs]),
    contact, passage(second!.anchor + 1),
  ]
  played.forEach((item, index) => {
    expect(item.at - goAt).toBeGreaterThanOrEqual(due[index]!)
    expect(item.at - goAt).toBeLessThan(due[index]! + 30)
  })
  // The whack skips the file's near-silent lead-in; the loop dipped under the voice.
  expect(played[6]!.offset).toBeCloseTo(0.22, 6)
  expect(await panelLog(page)).toContain('bgm:duck')
  expect((await game.played()).filter(item => item.kind === 'start' && item.file === 'bgm_comedy_loop')).toHaveLength(1)
})

test('비둘기 비행 시작에 날갯짓, 똥이 화면에 묻는 순간 철퍼덕이 한 번씩 나고 페이드 중에는 반복하지 않는다', async ({ page }) => {
  await page.goto('/__dev/jump-rope.html')
  const game = driver(page)
  await game.at(1000)
  // Opening audio takes a gesture; the panel button is one.
  await page.getByRole('button', { name: '비둘기 비행 방해 테스트' }).click()
  await game.tick()
  await expect.poll(game.starts).toEqual(['pigeon_flap'])
  await game.at(2500)
  await game.tick()
  await page.getByRole('button', { name: '비둘기 똥 테러 테스트' }).click()
  await game.at(2500 + poopImpactMs - 20)
  await game.tick()
  expect(await game.starts()).toEqual(['pigeon_flap'])
  await game.at(2500 + poopImpactMs + 10)
  await game.tick()
  await expect.poll(game.starts).toEqual(['pigeon_flap', 'pigeon_poop_splat'])
  for (const ms of [500, 1200, 1900]) {
    await game.at(2500 + poopImpactMs + ms)
    await game.tick()
  }
  await expect(page.locator('.distraction-splash')).toBeVisible()
  expect(await game.starts()).toEqual(['pigeon_flap', 'pigeon_poop_splat'])
  // The menu never plays the loop.
  expect((await game.played()).some(item => item.file === 'bgm_comedy_loop')).toBe(false)
})
