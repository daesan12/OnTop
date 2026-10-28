import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import type { PreparationContext, PreparationSelection } from '../../src/features/tableLobby/tabletModel'
import { bungeoppangFixture } from './bungeoppangFixture'
import { TABLES, tableSeats } from '../../src/config'

const directAnchor = TABLES.find(table => table.picnicId)!
const directSeat = tableSeats(directAnchor)[0]!
const directPosition = { x: directAnchor.position[0] + directSeat.x, y: directAnchor.position[1] + .8,
  z: directAnchor.position[2] + directSeat.z + .6, yaw: Math.PI }
async function approachChair(page: Page) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.locator('canvas').focus()
  await expect(page.getByRole('button', { name: 'E 테이블에 앉기', exact: true })).toBeVisible({ timeout: 15000 })
}

test('E seating skips table information, waits for server approval, then opens the tablet and starts normally', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const server = await fixture(page, { omok: true, manualLobby: true, tabletServer: true,
    anchorId: directAnchor.id, position: directPosition })
  server.tableJoinMode('hold')
  await approachChair(page)
  const previousView = await page.evaluate(async () => (await import('/src/world/cameraPerspective.ts' as string)).useCameraPerspective.getState().perspective)
  await screenshot(page, 'direct-seat-01-near-chair')
  await page.keyboard.press('KeyE')
  await expect(page.getByText('자리를 확인하고 있어요…', { exact: true })).toBeVisible()
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('dialog', { name: '테이블 정보', exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: '게임 태블릿', exact: true })).toHaveCount(0)
  expect(server.sent.filter(message => message.type === 'TABLE_JOIN')).toHaveLength(1)
  expect(server.sent.some(message => message.type === 'TABLE_WATCH')).toBe(false)
  expect(await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().tableId)).toBe('')
  await screenshot(page, 'direct-seat-02-awaiting-approval')
  server.approveTableJoins()
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await expect(tablet).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('dialog', { name: '테이블 정보', exact: true })).toHaveCount(0)
  await expect(page.getByText('자리를 확인하고 있어요…', { exact: true })).toHaveCount(0)
  await expect(tablet.getByRole('heading', { name: '어떤 게임을 할까요?' })).toBeVisible()
  await page.waitForTimeout(800); await screenshot(page, 'direct-seat-03-tablet')
  await tablet.getByRole('button', { name: '일어나기', exact: true }).click()
  await expect(tablet).toHaveCount(0)
  await page.locator('canvas').focus()
  await expect.poll(() => page.evaluate(async () => (await import('/src/world/roamingCamera.ts' as string)).canControlRoamingCamera())).toBe(true)
  await expect.poll(() => page.evaluate(async () => (await import('/src/world/cameraPerspective.ts' as string)).useCameraPerspective.getState().perspective)).toBe(previousView)
  server.tableJoinMode('approve')
  await page.keyboard.press('KeyE'); await expect(tablet).toBeVisible({ timeout: 20000 })
  await tablet.getByLabel('1인 참가비').fill('7')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox').check(); await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true)
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  await expect(page.getByRole('region', { name: '오목 경기', exact: true })).toBeVisible()
  expect(server.sent.filter(message => message.type === 'TABLE_START')).toHaveLength(1)
  expect(Object.keys(server.sent.find(message => message.type === 'TABLE_JOIN')!.payload)).toEqual(['tableId'])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([])
})

for (const rejection of [
  { code: 'TABLE_FULL', message: '빈 좌석이 없습니다.' },
  { code: 'TABLE_BUSY', message: '진행 중인 경기입니다.' },
]) test(`direct seating ${rejection.code} stays standing, shows a brief error and never starts spectating`, async ({ page }) => {
  const server = await fixture(page, { omok: true, manualLobby: true, tabletServer: true,
    anchorId: directAnchor.id, position: directPosition })
  server.tableJoinMode('reject', rejection.code, rejection.message)
  await approachChair(page); await page.keyboard.press('KeyE')
  await expect(page.locator('.park-runtime-status')).toContainText(rejection.message)
  await expect(page.getByRole('dialog', { name: '게임 태블릿', exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: '테이블 정보', exact: true })).toHaveCount(0)
  expect(server.sent.some(message => message.type === 'GAME_WATCH' || message.type === 'TABLE_WATCH')).toBe(false)
  expect(await page.evaluate(async () => (await import('/src/world/roamingCamera.ts' as string)).canControlRoamingCamera())).toBe(true)
  server.tableJoinMode('approve'); await page.locator('canvas').focus(); await page.keyboard.press('KeyE')
  await expect(page.getByRole('dialog', { name: '게임 태블릿', exact: true })).toBeVisible({ timeout: 20000 })
})

test('public information and spectating remain an explicit secondary choice, without automatically joining', async ({ page }) => {
  const server = await fixture(page, { omok: true, manualLobby: true, tabletServer: true,
    anchorId: directAnchor.id, position: directPosition })
  await approachChair(page)
  await page.getByRole('button', { name: '테이블 정보·관전', exact: true }).click()
  const info = page.getByRole('dialog', { name: '테이블 정보', exact: true })
  await expect(info).toBeVisible()
  await expect.poll(() => server.sent.filter(message => message.type === 'TABLE_WATCH').length).toBe(1)
  expect(server.sent.some(message => message.type === 'TABLE_JOIN')).toBe(false)
  await info.getByRole('button', { name: '앉기', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '게임 태블릿', exact: true })).toBeVisible({ timeout: 20000 })
})

test('the shared table mesh action rejects distant clicks without seating or opening information', async ({ page }) => {
  const server = await fixture(page, { omok: true, anchorId: directAnchor.id,
    position: { ...directPosition, x: directPosition.x + 100 } })
  await page.goto('/park'); await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => {
    const s = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    return s.status === 'connected' && !s.pending && s.tables.length > 0
  })).toBe(true)
  await page.evaluate(async id => (await import('/src/features/tableLobby/tableInteraction.ts' as string)).interactWithTable(id), directAnchor.id)
  await expect(page.locator('.park-runtime-status')).toContainText('테이블 의자 가까이')
  expect(server.sent.some(message => message.type === 'TABLE_JOIN' || message.type === 'TABLE_WATCH')).toBe(false)
})

async function openTable(page: Page, anchorId = 'table-1') {
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect(async () => {
    await page.evaluate(async id => (await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.inspectTable(id), anchorId)
    await expect(page.getByRole('button', { name: '앉기', exact: true })).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 15000 })
  await page.getByRole('button', { name: '앉기', exact: true }).click()
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await expect(tablet).toBeVisible({ timeout: 20000 })
  await expect.poll(() => tablet.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.99)
  await page.waitForTimeout(700)
  return tablet
}
async function bindManualPort(page: Page, server: Awaited<ReturnType<typeof fixture>>) {
  const calls: { kind: string; context: unknown; selection?: unknown }[] = []
  await page.exposeFunction('tabletConfigureFixture', (context: PreparationContext, selection: PreparationSelection) => {
    calls.push({ kind: 'configure', context, selection }); server.configureTablet(selection); return true
  })
  await page.exposeFunction('tabletStartFixture', (context: PreparationContext) => { calls.push({ kind: 'start', context }); server.confirmStart(); return true })
  await page.evaluate(async () => {
    const { bindTablePreparation } = await import('/src/features/tableLobby/tabletModel.ts' as string)
    bindTablePreparation({ manualStart: true, selectedPlayers: (table: { capacity: number }) => table.capacity,
      configure: (context: unknown, selection: unknown) => (window as any).tabletConfigureFixture(context, selection),
      start: (context: unknown) => (window as any).tabletStartFixture(context) })
  })
  return calls
}

for (const stage of ['select', 'ready'] as const)
test(`Escape leaves the ${stage} tablet once, after server approval, and restores roaming`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const server = await fixture(page, { omok: true, manualLobby: true, tabletServer: true,
    anchorId: directAnchor.id, position: directPosition })
  await approachChair(page); await page.keyboard.press('KeyE')
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await expect(tablet).toBeVisible({ timeout: 20000 })
  await tablet.getByLabel('1인 참가비').fill('20')
  if (stage === 'ready') {
    await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
    await tablet.getByRole('checkbox').check()
    await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
    await expect(tablet.getByRole('button', { name: '준비 취소', exact: true })).toBeEnabled()
  }
  await expect(tablet.getByRole('button', { name: '일어나기', exact: true })).toHaveAttribute('aria-keyshortcuts', 'Escape')
  server.holdTableLeave(true)
  await page.keyboard.down('Escape'); await page.keyboard.down('Escape'); await page.keyboard.up('Escape')
  await expect.poll(() => server.sent.filter(message => message.type === 'TABLE_LEAVE').length).toBe(1)
  await expect(tablet).toBeVisible()
  expect(await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().tableId)).not.toBe('')
  await page.keyboard.press('Escape')
  expect(server.sent.filter(message => message.type === 'TABLE_LEAVE')).toHaveLength(1)
  server.approveTableLeaves()
  await expect(tablet).toHaveCount(0)
  await page.locator('canvas').focus()
  await expect.poll(() => page.evaluate(async () => (await import('/src/world/roamingCamera.ts' as string)).canControlRoamingCamera())).toBe(true)
  expect(server.sent.some(message => message.type === 'GAME_FORFEIT')).toBe(false)
  await screenshot(page, `tablet-escape-${stage}-standing`)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([])
})

test('Escape closes the tablet manual first and leaves only on the next press', async ({ page }) => {
  const server = await fixture(page, { omok: true, manualLobby: true, tabletServer: true })
  const tablet = await openTable(page)
  await tablet.getByRole('button', { name: '설명서', exact: true }).click()
  const manual = page.getByRole('dialog', { name: '게임 설명서', exact: true })
  await expect(manual).toHaveAttribute('data-phase', 'open')
  await page.keyboard.press('Escape')
  await expect(manual).toHaveCount(0)
  await expect(tablet).toBeVisible()
  expect(server.sent.some(message => message.type === 'TABLE_LEAVE')).toBe(false)
  await page.keyboard.press('Escape')
  await expect(tablet).toHaveCount(0)
  expect(server.sent.filter(message => message.type === 'TABLE_LEAVE')).toHaveLength(1)
})

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }])
test(`tablet game selection keeps its screen and controls in place at ${viewport.width}`, async ({ page }) => {
  await page.setViewportSize(viewport)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const server = await fixture(page, { omok: true, manualLobby: true, tabletServer: true })
  const tablet = await openTable(page)
  const layout = () => tablet.evaluate(node => {
    const rect = (element: Element | null) => {
      const box = element?.getBoundingClientRect()
      return box && { x: box.x, y: box.y, width: box.width, height: box.height }
    }
    return { screen: rect(node), title: rect(node.querySelector('.tablet-title')), list: rect(node.querySelector('.tablet-game-list')),
      detail: rect(node.querySelector('.tablet-selection-detail')), start: rect(node.querySelector('.tablet-primary')), bet: rect(node.querySelector('.tablet-bet-input')),
      paperScroll: node.querySelector('.tablet-paper')?.scrollTop, documentScroll: document.scrollingElement?.scrollTop }
  })
  await page.waitForTimeout(1000)
  const before = await layout()
  await screenshot(page, `tablet-layout-selection-${viewport.width}`)
  for (const name of ['주사위 한 판', '원카드', '거짓말 다리 건너기', '오목', '주사위 한 판']) {
    await tablet.getByRole('button', { name, exact: false }).first().click()
    await expect(tablet.getByLabel('주사위 목표 점수')).toHaveCount(name === '주사위 한 판' ? 1 : 0)
    const after = await layout()
    for (const key of ['screen', 'title', 'list', 'detail', 'start', 'bet'] as const) {
      for (const axis of ['x', 'y', 'width', 'height'] as const)
        expect(Math.abs(after[key]![axis] - before[key]![axis]), `${name}: ${key}.${axis}`).toBeLessThan(1)
    }
    expect(after.paperScroll).toBe(0); expect(after.documentScroll).toBe(0)
    expect(after.start!.y + after.start!.height).toBeLessThan(after.screen!.y + after.screen!.height)
  }
  await tablet.getByLabel('주사위 목표 점수').selectOption('6000')
  await tablet.getByLabel('1인 참가비').fill('20')
  await expect(tablet.getByRole('button', { name: '선택하고 준비하기' })).toBeInViewport()
  await screenshot(page, `tablet-layout-dice-${viewport.width}`)
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await expect(tablet).toContainText('함께 시작할까요?')
  expect(server.sent.find(message => message.type === 'TABLE_CONFIGURE')?.payload).toMatchObject({ gameCode: 'DICE', targetScore: 6000, betAmountPerPlayer: 20 })
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([])
})

test('narrow tablet dice selection keeps its frame fixed and all settings reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const server = await fixture(page, { omok: true, manualLobby: true, tabletServer: true })
  const tablet = await openTable(page), before = await tablet.boundingBox()
  await tablet.getByRole('button', { name: '주사위 한 판', exact: false }).first().click()
  expect(await tablet.boundingBox()).toEqual(before)
  await tablet.getByLabel('주사위 목표 점수').selectOption('4000')
  await tablet.getByLabel('1인 참가비').fill('7')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).scrollIntoViewIfNeeded()
  await screenshot(page, 'tablet-layout-dice-mobile')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.scrollingElement?.scrollTop === 0)).toBe(true)
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await expect(tablet).toContainText('함께 시작할까요?')
  expect(server.sent.find(message => message.type === 'TABLE_CONFIGURE')?.payload).toMatchObject({ gameCode: 'DICE', targetScore: 4000, betAmountPerPlayer: 7 })
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([])
})

test('tablet powers on and never falls back to legacy auto-start after an unsupported configure', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const server = await fixture(page, { omok: true })
  const tablet = await openTable(page)
  await expect(tablet.getByText('어떤 게임을 할까요?')).toBeVisible()
  await screenshot(page, 'tablet-01-selection')
  await tablet.getByLabel('1인 참가비').fill('20')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await expect(tablet.getByText('어떤 게임을 할까요?')).toBeVisible()
  await expect(tablet).toContainText('태블릿 설정 연결이 준비되지 않았습니다.')
  expect(server.sent.filter(m => m.type === 'GAME_SELECT')).toHaveLength(0)
  expect(server.sent.filter(m => m.type === 'READY_SET')).toHaveLength(0)
  await screenshot(page, 'tablet-02-ready-two')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

for (const variant of [
  { game: 'OMOK', name: '오목', count: 2, panel: '오목 경기', options: {} },
  { game: 'DICE', name: '주사위 한 판', count: 2, panel: '주사위 경기', options: { dice: true } },
  { game: 'ONE_CARD', name: '원카드', count: 3, panel: '원카드 경기', options: { onecard: 3 as const } },
  { game: 'LIAR_BRIDGE', name: '거짓말 다리 건너기', count: 4, panel: '다리 경기', options: { bridge: 4 as const } },
]) test(`real tablet adapter: ${variant.game} configure, cancel ready and explicit start`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const server = await fixture(page, { omok: true, ...variant.options, players: variant.count, manualLobby: true, tabletServer: true })
  const tablet = await openTable(page)
  await tablet.getByRole('button', { name: variant.name, exact: false }).first().click()
  await tablet.getByRole('button', { name: `${variant.count}인`, exact: true }).click()
  if (variant.game === 'DICE') await tablet.getByLabel('주사위 목표 점수').selectOption('6000')
  await tablet.getByLabel('1인 참가비').fill('7'); await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await expect(tablet).toContainText('함께 시작할까요?')
  expect(server.sent.find(m => m.type === 'TABLE_CONFIGURE')?.payload).toMatchObject({ gameCode: variant.game, selectedPlayers: variant.count, betAmountPerPlayer: 7,
    ...(variant.game === 'DICE' ? { targetScore: 6000 } : {}) })
  expect(server.sent.find(m => m.type === 'TABLE_CONFIGURE')?.payload.expectedVersion).toEqual(expect.any(Number))
  await tablet.getByRole('checkbox').check(); await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true); server.publishTabletWait(120)
  await expect(tablet.getByRole('timer')).toHaveText('2:00')
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeEnabled()
  expect(server.sent.some(m => m.type === 'TABLE_HOST_WAIT_CHECK')).toBe(true)
  await tablet.getByRole('button', { name: '준비 취소', exact: true }).click()
  server.publishTabletWait(null)
  await expect(tablet.getByRole('timer')).toHaveCount(0)
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeDisabled()
  expect(server.sent.filter(m => m.type === 'READY_SET').map(m => m.payload.ready)).toEqual([true, false])
  await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.publishTabletWait(120)
  await expect(tablet.getByRole('timer')).toHaveText('2:00')
  expect(server.sent.some(m => m.type === 'GAME_SELECT' || m.type === 'TABLE_START')).toBe(false)
  await screenshot(page, `tablet-real-server-contract-ready-${variant.game}`)
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  await expect(tablet).toHaveCount(0)
  await expect(page.getByRole('region', { name: variant.panel, exact: true })).toBeVisible()
  await page.getByLabel('3D 공원', { exact: true }).locator('canvas').focus(); await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: variant.panel, exact: true })).toBeVisible()
  expect(server.sent.some(message => message.type === 'TABLE_LEAVE' || message.type === 'GAME_FORFEIT')).toBe(false)
  if (variant.game === 'DICE') await expect(page.getByRole('region', { name: variant.panel, exact: true })).toContainText('6,000')
  const start = server.sent.filter(m => m.type === 'TABLE_START'); expect(start).toHaveLength(1)
  expect(Object.keys(start[0]!.payload).sort()).toEqual(['actionId', 'expectedVersion'])
  expect(start[0]!.payload.actionId).toMatch(/^[\w-]{1,64}$/)
  await expect(page).toHaveURL(/\/park$/)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('real timeout receipt follows TABLE_LEFT and does not disconnect the park', async ({ page }) => {
  const server = await fixture(page, { omok: true, manualLobby: true, tabletServer: true })
  const tablet = await openTable(page)
  await tablet.getByLabel('1인 참가비').fill('20'); await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox').check(); await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true); server.publishTabletWait(0)
  await expect(tablet.getByRole('timer')).toHaveText('0:00')
  server.timeoutTabletHost('101', '102'); server.notifyTabletTimeout('101', '102')
  await expect(page.getByLabel('방장 대기시간 처리 안내')).toContainText('테이블에서 일어났어요')
  expect(await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().status)).toBe('connected')
  expect(server.sent.filter(m => m.type === 'TABLE_LEAVE')).toHaveLength(0)
  await screenshot(page, 'tablet-real-server-timeout')
})

test('omok assets appear on selection and feedback starts only after the server confirms manual start', async ({ page }) => {
  const server = await fixture(page, { omok: true, manualLobby: true, tabletServer: true, spectatorEvents: true })
  const tablet = await openTable(page)
  await tablet.getByLabel('1인 참가비').fill('1')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  const art = () => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).omokArtProbe())
  const camera = () => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).omokCameraProbe())
  await expect.poll(async () => (await art()).present).toBe(true)
  await expect(page.locator('[data-omok-focus="true"]')).toHaveCount(0)
  server.spectatorEvent('chat'); await expect(page.locator('.omok-floating-chat')).toHaveCount(0)
  await tablet.getByRole('checkbox').check()
  await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true); server.publishTabletWait(120); server.holdTabletStart(true)
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  await expect(tablet).toBeVisible()
  expect((await camera()).ready).toBe(false)
  await expect(page.locator('[data-omok-focus="true"]')).toHaveCount(0)
  server.confirmStart()
  await expect(tablet).toHaveCount(0)
  await expect.poll(async () => (await camera()).ready).toBe(true)
  server.spectatorEvent('chat', { text: '가운데를 막아봐요!' })
  server.spectatorEvent('ping', { x: 7, y: 7 })
  await expect(page.locator('.omok-floating-chat')).toContainText('가운데를 막아봐요!')
  await expect(page.locator('.omok-ping-label')).toHaveCount(1)
  await expect(page.getByRole('region', { name: '주변 채팅', exact: true })).toHaveCount(0)
  expect(server.sent.filter(m => m.type === 'TABLE_START')).toHaveLength(1)
  expect(server.sent.filter(m => m.type === 'GAME_SELECT')).toHaveLength(0)
  await screenshot(page, 'tablet-omok-confirmed-feedback')
})

test('unanswered manual start requires a read before a new explicit start and never auto-replays', async ({ page }) => {
  const server = await fixture(page, { omok: true, manualLobby: true, tabletServer: true })
  const tablet = await openTable(page)
  await tablet.getByLabel('1인 참가비').fill('1'); await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox').check(); await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true); server.holdTabletStart(true)
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  const recover = tablet.getByRole('button', { name: '시작 요청 상태 확인', exact: true })
  await expect(recover).toBeVisible({ timeout: 15000 })
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeDisabled()
  expect(server.sent.filter(m => m.type === 'TABLE_START')).toHaveLength(1)
  await recover.click()
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeEnabled()
  server.holdTabletStart(false)
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  await expect(tablet).toHaveCount(0)
  expect(server.sent.filter(m => m.type === 'TABLE_START')).toHaveLength(2)
})

for (const variant of [
  { game: 'OMOK', name: '오목', count: 2, panel: '오목 경기', options: { omok: true } },
  { game: 'DICE', name: '주사위 한 판', count: 2, panel: '주사위 경기', options: { dice: true } },
  { game: 'ONE_CARD', name: '원카드', count: 3, panel: '원카드 경기', options: { onecard: 3 as const } },
  { game: 'LIAR_BRIDGE', name: '거짓말 다리 건너기', count: 4, panel: '거짓말 다리 경기', options: { bridge: 4 as const } },
]) test(`manual adapter: ${variant.game}, ${variant.count} seats, explicit start and existing gameplay`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  const server = await fixture(page, { omok: true, ...variant.options, manualLobby: true, players: 4,
    publicProfiles: { '101': { nickname: '나', characterGender: 'MALE' }, '102': { nickname: '솔바람', characterGender: 'FEMALE' },
      '103': { nickname: '돌담', characterGender: 'MALE' }, '104': { nickname: '나무', characterGender: 'FEMALE' } } })
  const tablet = await openTable(page), calls = await bindManualPort(page, server)
  await tablet.getByRole('button', { name: variant.name, exact: false }).first().click()
  if (variant.game === 'ONE_CARD') await screenshot(page, 'tablet-onecard-selection-v2')
  if (variant.game === 'DICE' || variant.game === 'LIAR_BRIDGE') await screenshot(page, `tablet-${variant.game.toLowerCase()}-selection-v2`)
  if (variant.count > 2) await tablet.getByRole('button', { name: `${variant.count}인`, exact: true }).click()
  if (variant.game === 'DICE') await tablet.getByLabel('주사위 목표 점수').selectOption('4000')
  await tablet.getByLabel('1인 참가비').fill('20')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await expect(page.locator('.tablet-person')).toHaveCount(variant.count)
  await expect(tablet.getByRole('button', { name: '준비 완료', exact: true })).toBeDisabled()
  await tablet.getByRole('checkbox').check()
  await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  await expect(tablet.getByRole('button', { name: '준비 취소', exact: true })).toBeEnabled()
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeDisabled()
  server.readyTabletOthers(true)
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeEnabled()
  await expect(tablet.getByRole('checkbox')).toBeChecked()
  if (variant.count === 4) {
    await publishHostWait(page, 120, 1, true)
    await expect(tablet.getByRole('timer')).toBeVisible()
    const paper = await tablet.locator('.tablet-paper').boundingBox()
    const start = await tablet.getByRole('button', { name: '게임 시작', exact: true }).boundingBox()
    expect(start!.y + start!.height).toBeLessThanOrEqual(paper!.y + paper!.height)
    await screenshot(page, 'tablet-host-wait-four-players')
  }
  await screenshot(page, `tablet-ready-${variant.game}-${variant.count}`)
  expect(calls[0]?.selection).toMatchObject({ gameCode: variant.game, playerCount: variant.count, betAmountPerPlayer: 20 })
  if (variant.game === 'DICE') expect(calls[0]?.selection).toMatchObject({ targetScore: 4000 })
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '게임 태블릿', exact: true })).toHaveCount(0)
  await expect.poll(() => page.evaluate(async () => {
    const { useGame } = await import('/src/game/store.ts' as string)
    return useGame.getState().game?.gameId
  })).toMatch(/fixture-confirmed/)
  expect(calls.filter(c => c.kind === 'start')).toHaveLength(1)
  await expect(page.locator('.prototype-game, .park-runtime-panel').filter({ hasText: /내 차례|본인 차례|차례|주사위/ }).first()).toBeVisible()
  await page.waitForTimeout(500)
  await screenshot(page, `tablet-playing-${variant.game}`)
  expect(errors).toEqual([])
})

async function publishHostWait(page: Page, seconds: number | null, revision: number, bind = false) {
  return page.evaluate(async ({ seconds, revision, bind }) => {
    const { bindHostStartWait } = await import('/src/features/tableLobby/hostStartWait.ts' as string)
    const s = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    const t = s.tableStates[s.tableId]
    if (bind) (window as any).hostWaitFeed = bindHostStartWait({ userId: s.sessionId, channelId: s.roomId, tableId: s.tableId })
    // Deliberately different from the browser clock. Only the server-relative duration matters.
    const serverNow = 1900000000000
    return (window as any).hostWaitFeed.update({ revision, tableVersion: t.version, hostUserId: t.selectorUserId,
      serverNow, expiresAt: seconds === null ? null : serverNow + seconds * 1000 })
  }, { seconds, revision, bind })
}
async function readyHostWait(page: Page) {
  const server = await fixture(page, { omok: true, manualLobby: true, publicProfiles: {
    '101': { nickname: '나' }, '102': { nickname: '솔바람' } } })
  const tablet = await openTable(page); const calls = await bindManualPort(page, server)
  await tablet.getByLabel('1인 참가비').fill('20'); await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox').check(); await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true); await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeEnabled()
  return { server, tablet, calls }
}
test('host start countdown follows server time, cancels on readiness and never evicts locally at zero', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  const { server, tablet, calls } = await readyHostWait(page)
  const timer = tablet.getByRole('timer', { name: '방장 게임 시작 남은 시간' })
  await expect(timer).toHaveCount(0)
  await publishHostWait(page, 120, 1, true); await expect(timer).toHaveText('2:00')
  await screenshot(page, 'tablet-host-wait-two-minutes')
  await publishHostWait(page, 29, 2); await expect(timer).toHaveText(/0:2[89]/)
  await expect(page.locator('.host-start-wait')).toHaveAttribute('data-urgent', 'true')
  expect(await publishHostWait(page, 120, 1)).toBe(false)
  server.readyTabletOthers(false); await expect(timer).toHaveCount(0)
  server.readyTabletOthers(true)
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeEnabled()
  await publishHostWait(page, 0, 3); await expect(timer).toHaveText('0:00')
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeDisabled()
  await expect(tablet).toContainText('서버 처리를 확인하고 있어요')
  await page.waitForTimeout(700)
  expect(server.sent.some(m => m.type === 'TABLE_LEAVE')).toBe(false)
  expect(calls.filter(c => c.kind === 'start')).toHaveLength(0)
  expect(await page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().tableId)).not.toBe('')
  await screenshot(page, 'tablet-host-wait-expired')
  // An early receipt cannot fabricate an own departure, even when the local timer is zero.
  const receipt = { eventId: 'host-timeout-1', revision: 4, tableVersion: 1, previousHostUserId: '101', nextHostUserId: '102' }
  await page.evaluate(receipt => (window as any).hostWaitFeed.timeout(receipt), receipt)
  await expect(page.getByLabel('방장 대기시간 처리 안내')).toHaveCount(0)
  server.timeoutTabletHost('101', '102')
  const notice = page.getByLabel('방장 대기시간 처리 안내')
  await expect(notice).toContainText('대기시간이 지나 테이블에서 일어났어요')
  await expect(tablet).toHaveCount(0)
  await screenshot(page, 'tablet-host-timeout-removed')
  await notice.getByRole('button', { name: '방장 대기시간 안내 닫기' }).click()
  expect(await page.evaluate(receipt => (window as any).hostWaitFeed.timeout(receipt), receipt)).toBe(false)
  await expect(notice).toHaveCount(0)
  expect(errors).toEqual([])
})
test('remaining player sees server-approved host succession and can still use the mobile controls', async ({ page }) => {
  const { server, tablet, calls } = await readyHostWait(page)
  server.host('102'); await expect(tablet).toContainText('솔바람 · 방장')
  await publishHostWait(page, 25, 1, true)
  await expect(tablet.getByRole('timer')).toBeVisible()
  await expect(tablet).toContainText('방장의 시작을 기다리고 있어요')
  const version = server.timeoutTabletHost('102', '101')
  await page.evaluate(receipt => (window as any).hostWaitFeed.timeout(receipt), {
    eventId: 'host-timeout-2', revision: 2, tableVersion: version, previousHostUserId: '102', nextHostUserId: '101' })
  const notice = page.getByLabel('방장 대기시간 처리 안내')
  await expect(notice).toContainText('새 방장이 되었어요')
  await expect(tablet.getByRole('timer')).toHaveCount(0)
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeDisabled()
  expect(calls.filter(c => c.kind === 'start')).toHaveLength(0)
  await expect(tablet.getByRole('button', { name: '준비 완료', exact: true })).toBeDisabled()
  await notice.getByRole('button', { name: '방장 대기시간 안내 닫기' }).click()
  // Restore approved participants to exercise the compact countdown at phone width.
  server.configureTablet({ gameCode: 'OMOK', playerCount: 2, betAmountPerPlayer: 20 })
  await tablet.getByRole('checkbox').check(); await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true); await publishHostWait(page, 120, 3)
  await page.setViewportSize({ width: 390, height: 844 })
  await tablet.getByRole('timer').scrollIntoViewIfNeeded()
  await expect(tablet.getByRole('timer')).toBeInViewport()
  await screenshot(page, 'tablet-host-wait-mobile')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  await expect(tablet).toHaveCount(0)
  await expect(page.getByRole('timer', { name: '방장 게임 시작 남은 시간' })).toHaveCount(0)
  expect(calls.filter(c => c.kind === 'start')).toHaveLength(1)
})

test('result popup preserves settlement and next-round permission, then clears on exit and reload', async ({ page }) => {
  const server = await fixture(page, { omok: true, manualLobby: true })
  const tablet = await openTable(page); await bindManualPort(page, server)
  await tablet.getByLabel('1인 참가비').fill('20')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox').check(); await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true); await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  server.finishGame('FIVE_IN_A_ROW', '101')
  const result = page.getByRole('dialog', { name: '경기 결과', exact: true })
  await expect(result).toBeVisible(); await expect(result.getByRole('heading', { name: '승리', exact: true })).toBeVisible()
  await expect(result.locator('.paper-close svg')).toBeVisible()
  await expect(result.getByText('보상 확인 중', { exact: true })).toBeVisible()
  await expect(result.getByRole('button', { name: '다음 판 준비', exact: true })).toBeDisabled()
  await page.waitForTimeout(350); await screenshot(page, 'tablet-result-pending')
  await page.keyboard.press('Escape')
  await expect(result).toHaveCount(0)
  expect(server.sent.some(message => message.type === 'TABLE_LEAVE')).toBe(false)
  await page.getByRole('button', { name: '경기 결과 다시 보기' }).click()
  await expect(result).toBeVisible()
  server.settle(); await expect(result).toContainText('정산 완료')
  await expect(result.getByRole('button', { name: '다음 판 준비', exact: true })).toBeDisabled()
  server.host('102'); server.nextRound()
  await expect(result.getByRole('button', { name: '다음 판 준비', exact: true })).toBeEnabled()
  await screenshot(page, 'tablet-result-settled')
  await result.getByRole('button', { name: '다음 판 준비', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '게임 태블릿' })).toBeVisible()
  await expect(page.getByRole('button', { name: '게임 시작', exact: true })).toHaveCount(0)
  await page.getByRole('dialog', { name: '게임 태블릿' }).getByRole('button', { name: '일어나기', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '게임 태블릿' })).toHaveCount(0)
  server.restoreGame(); server.settle()
  await expect(result).toHaveCount(0)
  await expect(page.getByRole('region', { name: '오목 경기', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await expect.poll(() => page.evaluate(async () => {
    const s = (await import('/src/network/worldClient.ts' as string)).useSession.getState()
    return s.status === 'connected' && s.tables.length > 0 && !s.pending
  })).toBe(true)
  server.restoreGame(); server.settle()
  await expect.poll(() => page.evaluate(async () => {
    const s = (await import('/src/game/store.ts' as string)).useGame.getState()
    return !s.game && !s.result && !s.lastResult && !s.permittedGameId
  })).toBe(true)
  await expect(result).toHaveCount(0)
  await screenshot(page, 'qa-tablet-result-cleared-after-reload')
})

test('tablet invalid result keeps refund recovery with a stale or missing engine and waits for settlement', async ({ page }) => {
  const server = await fixture(page, { omok: true, manualLobby: true })
  const tablet = await openTable(page); await bindManualPort(page, server)
  await tablet.getByLabel('1인 참가비').fill('20')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox').check(); await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true); await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  const pending = server.storeInvalidResult()
  server.notifyResult(pending)
  const result = page.getByRole('dialog', { name: '경기 결과', exact: true })
  await expect(result.getByRole('heading', { name: '무효 경기', exact: true })).toBeVisible()
  await expect(result).toContainText('판정 없음')
  await expect(result).toContainText('참가비 20 코인 예약금 반환 대기')
  await expect(result).not.toContainText('승리'); await expect(result).not.toContainText('무승부')
  const check = result.getByRole('button', { name: '정산 결과 확인', exact: true })
  await expect(check).toBeEnabled(); await check.click()
  await expect.poll(() => server.sent.filter(m => m.type === 'GAME_RESULT_CHECK').length).toBe(1)
  server.nextRound()
  await expect.poll(() => page.evaluate(async () => (await import('/src/game/store.ts' as string)).useGame.getState().game)).toBeNull()
  await expect(check).toBeEnabled(); await check.click()
  await expect.poll(() => server.sent.filter(m => m.type === 'GAME_RESULT_CHECK').length).toBe(2)
  await expect(result.getByRole('button', { name: '다음 판 준비', exact: true })).toBeDisabled()
  await screenshot(page, 'tablet-invalid-refund-pending')
  server.notifyResult(server.storeInvalidResult('SETTLED')); server.notifyResult(pending)
  await expect(result).toContainText('예약 해제 완료 · 참가비 20 코인 · 잔액 변화 0')
  await expect(result.getByRole('button', { name: '다음 판 준비', exact: true })).toBeEnabled()
  await result.getByRole('button', { name: '다음 판 준비', exact: true }).click()
  await expect(result).toHaveCount(0)
})

test('narrow tablet layout keeps choices and actions reachable without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await fixture(page, { omok: true })
  const tablet = await openTable(page)
  await tablet.getByLabel('1인 참가비').fill('20')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await expect(tablet.getByRole('button', { name: '일어나기', exact: true })).toBeEnabled()
  await tablet.getByRole('button', { name: '일어나기', exact: true }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  await screenshot(page, 'tablet-mobile-ready')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await tablet.getByRole('button', { name: '일어나기', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '게임 태블릿' })).toHaveCount(0)
})

test('minigame paper popup separates provisional score, pending reward and confirmed result', async ({ page }) => {
  await bungeoppangFixture(page)
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click()
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'countdown')
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
    const { createGrill } = await import('/src/features/bungeoppang/rules.ts' as string)
    const { BUNGEOPPANG } = await import('/src/features/bungeoppang/config.ts' as string)
    const grill = { ...createGrill(Array(64).fill(100), BUNGEOPPANG), score: 120, made: 12, failed: 2 }
    useBungeoppang.setState({ phase: 'result', grill, result: null, submitting: false })
  })
  const result = page.getByRole('dialog', { name: '붕어빵 결과', exact: true })
  await expect(result).toBeVisible(); await expect(result).toContainText('120점')
  await expect(result).toContainText('보상 확인 중')
  await expect(result.getByRole('button', { name: '다시 도전', exact: true })).toBeDisabled()
  await page.waitForTimeout(800); await screenshot(page, 'tablet-minigame-result-pending')
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string)
    useBungeoppang.setState({ result: { score: 120, made: 12, golden: 8, failed: 2, wasted: 0, maxCombo: 5,
      coinsCalculated: 12, coinsGranted: 12, todayEarned: 12, dailyCap: 100, capReached: false } })
  })
  await expect(result).toContainText('받은 엽전 12냥')
  await expect(result.getByRole('button', { name: '다시 도전', exact: true })).toBeEnabled()
  await result.getByRole('button', { name: '공원으로', exact: true }).click()
  await expect(result).toHaveCount(0)
})

test('reference-size pavilion tablet has aligned controls and clears the tabletop', async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 })
  const server = await fixture(page, { omok: true, anchorId: 'table-5', manualLobby: true })
  const tablet = await openTable(page, 'table-5'); await bindManualPort(page, server)
  await screenshot(page, 'tablet-native-pavilion-selection')
  await tablet.getByLabel('1인 참가비').fill('20')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox').check()
  await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true)
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeInViewport()
  await page.waitForTimeout(500); await screenshot(page, 'tablet-native-pavilion-ready')
  await expect(tablet.getByRole('button', { name: '일어나기', exact: true })).toBeInViewport()
})
