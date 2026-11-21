import { chromium, expect as baseExpect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const output = path.resolve('docs/yutnori/qa')
const expect = baseExpect.configure({ timeout: 20000 })
await mkdir(output, { recursive: true })
let healthy = false
for (let attempt = 0; attempt < 240 && !healthy; attempt++) {
  try { healthy = (await fetch('http://127.0.0.1:19185/actuator/health', { signal: AbortSignal.timeout(3000) })).ok } catch { /* 준비 중인 검수 앱을 기다린다. */ }
  if (!healthy) await new Promise(resolve => setTimeout(resolve, 1000))
}
if (!healthy) throw new Error('기존 loopback 검수 BE가 준비되지 않았습니다.')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const contexts = []
const errors = []
async function account(role, host) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  contexts.push(context)
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', error => errors.push(`${role}: ${error.message}`))
  await page.goto(`http://${host}:5244/yut-park.html?role=${role}`, { waitUntil: 'commit', timeout: 90000 })
  await expect(page.getByRole('status').filter({ hasText: '전통놀이존 입구' })).toBeVisible({ timeout: 180000 })
  await expect.poll(() => page.evaluate(async () => {
    const world = await import('/src/network/worldClient.ts')
    const state = world.useSession.getState()
    const avatar = world.avatars.get(state.sessionId)
    return !!avatar && state.mapCompatible && state.roomId === 'channel-1'
  }), { timeout: 30000 }).toBe(true)
  await page.screenshot({ path: path.join(output, `${role}-park.png`) })
  // 동일한 실제 E 상호작용 경로를 사용한다. 위치는 기존 loopback fixture가 서버에서 배치한다.
  await expect.poll(async () => {
    await page.keyboard.press('e')
    return page.locator('.yut-shell').isVisible()
  }, { timeout: 20000, intervals: [1000] }).toBe(true)
  await page.waitForTimeout(1200)
  if (!await page.getByRole('heading', { name: '전통놀이 고르기', exact: true }).isVisible()) {
    if (await page.getByRole('button', { name: '기권·나가기', exact: true }).isVisible()) {
      await page.getByRole('button', { name: '기권·나가기', exact: true }).click()
      await page.getByRole('button', { name: '기권하고 공원으로', exact: true }).click()
    } else await page.getByRole('button', { name: '공원으로', exact: true }).click()
    await expect(page.locator('.yut-shell')).not.toBeVisible()
    await page.keyboard.press('e')
  }
  await expect(page.getByRole('heading', { name: '전통놀이 고르기', exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(output, `${role}-catalog.png`) })
  await page.locator('.yut-augment-card').click()
  return page
}
async function state(page) {
  return page.evaluate(async () => {
    const { getAuthSession } = await import('/src/auth/authFlow.ts')
    const auth = getAuthSession()
    if (auth?.status !== 'AUTHENTICATED') throw new Error('검수 계정의 로그인이 필요합니다.')
    const response = await fetch('/api/v1/minigames/yutnori/rooms?channelId=channel-1', { headers: { Authorization: 'Bearer ' + auth.accessToken } })
    if (!response.ok) throw new Error('경기 상태 조회 실패: ' + response.status)
    return response.json()
  })
}
let red, blue
const movementOnly = process.argv.includes('--movement-only')
try {
  red = await account('red', '127.0.0.1')
  if (!movementOnly) {
  await red.getByRole('button', { name: '새 방 만들기', exact: true }).click()
  await red.getByLabel('방 이름', { exact: true }).fill('친구와 함께하는 윷판')
  await red.getByLabel('팀 수', { exact: true }).selectOption('4')
  await red.screenshot({ path: path.resolve('docs/yutnori/qa-four-teams/settings-four.png') })
  await red.getByLabel('팀 수', { exact: true }).selectOption('2')
  await red.getByRole('button', { name: '방 만들기', exact: true }).click()
  await expect(red.getByRole('heading', { name: '친구와 함께하는 윷판', exact: true })).toBeVisible()
  blue = await account('green', 'localhost')
  await blue.getByRole('button', { name: '참가하기', exact: true }).click()
  await expect(blue.getByRole('heading', { name: '친구와 함께하는 윷판', exact: true })).toBeVisible()
  const viewer = await account('viewer', '127.0.0.1')
  for (const page of [red, blue]) await page.getByRole('button', { name: '준비 완료', exact: true }).click()
  await red.screenshot({ path: path.join(output, 'lobby.png') })
  await red.getByRole('button', { name: '윷놀이 시작', exact: true }).click()
  await expect(red.locator('.yut-board')).toBeVisible()
  await expect(blue.locator('.yut-board')).toBeVisible()
  await expect(red.locator('.yut-board-3d')).toHaveAttribute('data-ready', 'true')
  await expect(red.locator('.yut-3d-controls [data-node]')).toHaveCount(29)
  await red.setViewportSize({ width: 1487, height: 1058 })
  await red.screenshot({ path: path.join(output, 'game-concept-native.png') })
  await red.setViewportSize({ width: 1440, height: 960 })
  await red.screenshot({ path: path.join(output, 'game-desktop.png') })
  let moves = 0
  for (let attempt = 0; attempt < 12 && moves < 4; attempt++) {
    const snapshot = (await state(red)).mine
    if (snapshot.publicState.phase !== 'PLAYING') break
    const page = snapshot.publicState.turnUser === '101' ? red : blue
    const version = snapshot.version
    if (snapshot.publicState.credits > 0 && !snapshot.publicState.rolls.length) {
      await page.getByRole('button', { name: /^윷 던지기/ }).click()
      await expect.poll(async () => (await state(page)).mine.version, { timeout: 10000 }).toBeGreaterThan(version)
      const thrown = (await state(page)).mine.publicState.lastThrow
      expect(thrown.id).toBeGreaterThan(0)
      for (const peer of [red, blue]) {
        await expect(peer.locator('.yut-throw-view')).toHaveAttribute('data-result-id', String(thrown.id))
      }
      await expect(page.locator('.yut-throw-view')).toHaveAttribute('data-expanded', 'false')
      await expect(page.locator('.yut-throw-view')).toHaveAttribute('data-mask', String(thrown.mask))
    }
    const next = (await state(page)).mine
    if (next.publicState.turnUser !== snapshot.publicState.turnUser || !next.publicState.moves.length) continue
    const move = next.publicState.moves[0]
    const rollIndex = next.publicState.rolls.findIndex(roll => roll.id === move.rollId)
    await page.locator('.yut-rolls > button').nth(rollIndex).click()
    await page.getByRole('button', { name: `${next.publicState.team === 0 ? '청팀' : '홍팀'} ${move.piece + 1}번 말 선택`, exact: true }).click()
    await page.getByRole('button', { name: /^(기본 길 ·|지름길 ·|완주하기)/ }).first().click()
    await expect.poll(async () => (await state(page)).mine.version).toBeGreaterThan(next.version)
    moves++
  }
  expect(moves).toBeGreaterThan(0)
  await red.screenshot({ path: path.join(output, 'game-after-moves.png') })
  await red.getByLabel('전체 채팅 입력', { exact: true }).fill('같이 가요!')
  await red.getByRole('button', { name: '보내기', exact: true }).click()
  await expect(blue.getByRole('log', { name: '전체 채팅 기록' })).toContainText('같이 가요!', { timeout: 10000 })
  // 실제 계정 재로그인·새 소켓으로 같은 경기를 복구한다.
  await blue.reload()
  await expect(blue.locator('.yut-board')).toBeVisible({ timeout: 45000 })
  expect((await state(blue)).mine.publicState.roomName).toBe('친구와 함께하는 윷판')
  await viewer.getByRole('button', { name: '관전하기', exact: true }).click()
  await expect(viewer.getByRole('heading', { name: '관전 중', exact: true })).toBeVisible()
  await expect(viewer.getByRole('button', { name: /^윷 던지기/ })).toBeDisabled()
  await viewer.getByRole('button', { name: '1번 칸 핑 보내기', exact: true }).click()
  await expect(red.locator('.yut-match-history')).toContainText('📍 윷판 1번 칸', { timeout: 10000 })
  await red.getByRole('button', { name: '기권·나가기', exact: true }).click()
  await expect(red.getByRole('heading', { name: '나가면 우리 팀이 탈락해요.', exact: true })).toBeVisible()
  await red.getByRole('button', { name: '기권하고 공원으로', exact: true }).click()
  await expect(red.locator('.yut-shell')).not.toBeVisible()
  await expect(blue.getByRole('heading', { name: /승리!$/ })).toBeVisible({ timeout: 10000 })
  for (const [width, height, file] of [[390, 844, 'game-mobile'], [1024, 500, 'game-low-height']]) {
    await blue.setViewportSize({ width, height })
    const overflow = await blue.locator('.yut-shell').evaluate(element => element.scrollWidth > element.clientWidth + 1)
    expect(overflow).toBe(false)
    await blue.getByRole('button', { name: '보내기', exact: true }).scrollIntoViewIfNeeded()
    await expect(blue.getByRole('button', { name: '보내기', exact: true })).toBeInViewport()
    await blue.screenshot({ path: path.join(output, file + '.png') })
  }
  await blue.setViewportSize({ width: 1440, height: 960 })
  await blue.screenshot({ path: path.join(output, 'result.png') })
  await blue.getByRole('button', { name: '공원으로 돌아가기', exact: true }).click()
  await expect(blue.locator('.yut-shell')).not.toBeVisible()
  } else {
    await red.getByRole('button', { name: '공원으로', exact: true }).click()
    blue = await account('green', 'localhost')
    await blue.getByRole('button', { name: '공원으로', exact: true }).click()
  }
  for (const page of [red, blue]) {
    await page.bringToFront()
    await expect.poll(() => page.evaluate(async () => {
      const input = await import('/src/world/inputOwnership.ts')
      return document.visibilityState === 'visible' && input.roamingInput.ready && !input.panelOwnsKeys()
    })).toBe(true)
    const before = await page.evaluate(async () => { const w = await import('/src/network/worldClient.ts'); return { ...w.avatars.get(w.useSession.getState().sessionId).current } })
    await page.locator('canvas').first().click({ position: { x: 200, y: 200 } })
    let distance = 0
    for (const key of ['w', 'd', 's', 'a']) {
      await page.keyboard.down(key); await page.waitForTimeout(700); await page.keyboard.up(key)
      distance = await page.evaluate(async before => { const w = await import('/src/network/worldClient.ts'); const now = w.avatars.get(w.useSession.getState().sessionId).current; return Math.hypot(now.x - before.x, now.z - before.z) }, before)
      if (distance > .05) break
    }
    expect(distance).toBeGreaterThan(.05)
    await page.screenshot({ path: path.join(output, `movement-${page === red ? 'red' : 'green'}.png`) })
  }
  expect(errors).toEqual([])
  console.info(JSON.stringify({ success: true, mode: movementOnly ? 'movement-only' : 'full', accounts: ['101', '202'],
    coverage: movementOnly ? ['login', 'park', 'movement'] : ['rooms', 'turns', 'reconnect', 'spectator', 'layouts', 'forfeit', 'movement'],
    channel: 'channel-1', evidence: output }))
} catch (error) {
  for (const [index, context] of contexts.entries()) for (const page of context.pages()) {
    await page.screenshot({ path: path.join(output, `failure-${index}.png`) }).catch(() => {})
    console.info('UI diagnostic', index, (await page.locator('body').innerText()).slice(0, 3500))
  }
  console.info('Page errors', errors)
  throw error
} finally { await browser.close() }
