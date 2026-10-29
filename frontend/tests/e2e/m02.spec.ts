import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { movementScenarios as scenarios } from '../fixtures/movementScenarios'

const probe = (page: Page) => page.evaluate(async () => {
  const module = await import('/tests/e2e/sceneProbe.ts' as string)
  return module.movementProbe()
})
async function loaded(page: Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await page.locator('canvas').focus()
}

test('M02 movement rate diagnostics stay hidden while other server errors remain visible', async ({ page }) => {
  const errors: string[] = [], consoleErrors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  const server = await fixture(page, { manualMovement: true, position: { x: -10, y: 0.8, z: 21, yaw: 0 } })
  await loaded(page)
  const notice = page.locator('.park-runtime-status')
  const rejectMove = async () => {
    server.rejectNextMove()
    await page.evaluate(async () => {
      const { parkRuntime } = await import('/src/park/runtime/runtime.ts' as string)
      parkRuntime.move(1, 0, false)
    })
    await expect.poll(() => page.evaluate(async () => {
      const { useSession } = await import('/src/network/worldClient.ts' as string)
      return useSession.getState().movementNotice?.message
    })).toBe('이동 입력 전송 간격을 확인해주세요.')
    await expect(notice).toBeHidden()
  }
  await rejectMove()
  await screenshot(page, 'm02-movement-rate-hidden')
  await expect(notice).toBeHidden({ timeout: 4500 })
  await screenshot(page, 'm02-movement-notice-expired')
  await rejectMove()
  const count = server.sent.filter(message => message.type === 'WORLD_MOVE').length
  await page.keyboard.down('KeyW')
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_MOVE').length).toBeGreaterThan(count)
  await expect(notice).toBeHidden({ timeout: 2000 })
  await page.keyboard.up('KeyW')
  await screenshot(page, 'm02-movement-notice-recovered')
  await page.evaluate(async () => {
    const { receive } = await import('/src/network/worldClient.ts' as string)
    receive({ type: 'ERROR', requestId: null, payload: { code: 'OTHER_ERROR', message: '검수용 다른 오류' } })
  })
  await expect(notice).toHaveText('검수용 다른 오류')
  expect(await page.locator('canvas').count()).toBeGreaterThan(0)
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('M02 queues Space synchronously before the polling tick and ignores repeats or owned input', async ({ page }) => {
  const server = await fixture(page, { manualMovement: true })
  await loaded(page)
  const result = await page.evaluate(async () => {
    const { parkRuntime } = await import('/src/park/runtime/runtime.ts' as string)
    const { setChatInputOpen } = await import('/src/world/inputOwnership.ts' as string)
    const original = parkRuntime.move
    const calls: unknown[][] = []
    parkRuntime.move = (...args: unknown[]) => { calls.push(args); original(...args) }
    const key = (type: string, code: string, repeat = false) =>
      window.dispatchEvent(new KeyboardEvent(type, { code, repeat, cancelable: true }))
    try {
      // No timer can run between these synchronous events and the assertions.
      key('keydown', 'KeyW')
      key('keydown', 'Space')
      const immediate = calls.map(args => [...args])
      key('keydown', 'Space', true)
      const afterRepeat = calls.length
      key('keyup', 'Space')
      key('keyup', 'KeyW')
      setChatInputOpen(true)
      key('keydown', 'Space')
      const afterChat = calls.length
      setChatInputOpen(false)
      return { immediate, afterRepeat, afterChat }
    } finally { parkRuntime.move = original; setChatInputOpen(false) }
  })
  expect(result.immediate).toHaveLength(1)
  expect(result.immediate[0]).toEqual([0, -1, false, true])
  expect(result.afterRepeat).toBe(1)
  // Opening chat sends a separate stop, with Space still blocked.
  expect(result.afterChat).toBe(2)
  expect(server.sent.filter(m => m.type === 'WORLD_MOVE' && m.payload.jump).length).toBeLessThanOrEqual(1)
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
  await screenshot(page, 'm02-jump-input')
})

test('M02 preserves the movement protocol, one-shot Space and stopping across blur/reconnect', async ({ page }) => {
  const errors: string[] = [], consoleErrors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  const server = await fixture(page, { manualMovement: true })
  await loaded(page)
  const moves = () => server.sent.filter(message => message.type === 'WORLD_MOVE')
  await page.keyboard.down('KeyW')
  await page.keyboard.down('KeyD')
  await page.keyboard.down('ShiftLeft')
  await expect.poll(() => moves().some(m => m.payload.run && Number(m.payload.dx) > 0 && Number(m.payload.dz) < 0)).toBe(true)
  const diagonal = moves().find(m => m.payload.run && Number(m.payload.dx) > 0 && Number(m.payload.dz) < 0)!
  expect(Math.hypot(Number(diagonal.payload.dx), Number(diagonal.payload.dz))).toBeCloseTo(1)
  await page.keyboard.down('Space')
  await page.keyboard.down('Space') // native repeat=true must not queue a second jump
  await expect.poll(() => moves().filter(m => m.payload.jump).length).toBe(1)
  await page.keyboard.up('Space')
  await page.keyboard.up('KeyW')
  await page.keyboard.up('KeyD')
  await page.keyboard.up('ShiftLeft')
  await expect.poll(() => moves().at(-1)?.payload).toMatchObject({ dx: 0, dz: 0, jump: false })
  // The fixture does not simulate physics: intent alone cannot change displayed coordinates.
  expect((await probe(page)).approved).toMatchObject({ x: -10, y: 0.8, z: 21 })
  for (const message of moves()) expect(Object.keys(message.payload).sort()).toEqual(['dx', 'dz', 'jump', 'run', 'seq'])
  const sequences = moves().map(m => Number(m.payload.seq))
  expect(sequences.every((seq, i) => i === 0 || seq > sequences[i - 1]!)).toBe(true)
  await page.keyboard.down('KeyW')
  await expect.poll(() => Number(moves().at(-1)?.payload.dz)).toBeLessThan(0)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect.poll(() => moves().at(-1)?.payload).toMatchObject({ dx: 0, dz: 0, jump: false })
  await page.keyboard.up('KeyW')
  await page.keyboard.down('KeyW')
  await expect.poll(() => Number(moves().at(-1)?.payload.dz)).toBeLessThan(0)
  server.players(0)
  await expect.poll(async () => (await probe(page)).approved).toBeNull()
  server.players(2)
  await expect.poll(async () => (await probe(page)).approved).not.toBeNull()
  const countAfterRestore = moves().length
  await page.waitForTimeout(250)
  expect(moves().slice(countAfterRestore).some(m => m.payload.dx || m.payload.dz || m.payload.jump)).toBe(false)
  await page.keyboard.up('KeyW')
  await page.keyboard.down('KeyW')
  await expect.poll(() => Number(moves().at(-1)?.payload.dz)).toBeLessThan(0)
  server.close(1012)
  await expect.poll(() => server.connections, { timeout: 15_000 }).toBe(2)
  const countAfterReconnect = moves().length
  // Wait beyond an input cadence to detect held-key replay.
  await page.waitForTimeout(250)
  expect(moves().slice(countAfterReconnect).some(m => m.payload.dx || m.payload.dz || m.payload.jump)).toBe(false)
  await page.keyboard.up('KeyW')
  expect(server.maxActive).toBe(1)
  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
})

test('M02 renders approved jump/swim/stone states without a local physics replacement', async ({ page }) => {
  const errors: string[] = [], consoleErrors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  const server = await fixture(page, { manualMovement: true })
  await loaded(page)
  server.pose(scenarios.walk)
  await expect.poll(async () => (await probe(page)).moving).toBe(true)
  server.pose(scenarios.run)
  await expect.poll(async () => (await probe(page)).running).toBe(true)
  server.pose(scenarios.jump)
  await expect.poll(async () => (await probe(page)).sampled?.y).toBeCloseTo(scenarios.jump.y)
  server.pose(scenarios.land)
  await expect.poll(async () => (await probe(page)).sampled?.y).toBeCloseTo(scenarios.land.y)
  server.remotePose({ ...scenarios.land, x: -8 })
  server.pose(scenarios.swim)
  await expect.poll(async () => (await probe(page)).rippleCount).toBe(1)
  await expect.poll(async () => (await probe(page)).figureRotationX).toBeCloseTo(1.3)
  await expect.poll(async () => (await probe(page)).sampled?.x).toBeCloseTo(scenarios.swim.x)
  server.pose(scenarios.fastSwim)
  server.remotePose({ ...scenarios.swim, x: scenarios.swim.x + 2 })
  await expect.poll(async () => (await probe(page)).rippleCount).toBe(2)
  await expect.poll(async () => (await probe(page)).remoteSwimming).toBe(true)
  await expect.poll(async () => {
    const result = await probe(page)
    return Math.abs(result.ripplePosition[0]! - result.sampled!.x)
      + Math.abs(result.ripplePosition[2]! - result.sampled!.z)
  }).toBeLessThan(0.05)
  await screenshot(page, 'm02-swimming')
  server.remotePose(scenarios.stone)
  server.pose(scenarios.stone)
  await expect.poll(async () => (await probe(page)).rippleCount).toBe(0)
  await expect.poll(async () => (await probe(page)).figureRotationX).toBe(0)
  await expect.poll(async () => (await probe(page)).sampled?.y).toBeCloseTo(scenarios.stone.y)
  const camera = await probe(page)
  expect(camera.cameraY).toBeGreaterThanOrEqual(camera.terrainY + 0.3 - 0.00001)
  await screenshot(page, 'm02-stone')
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
})
