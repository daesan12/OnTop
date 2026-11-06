import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import type { carryRenderedFrames, carrySequenceFrames, carryThrowGestureFrames } from './sceneProbe'

async function readyCarryScene(page: Page) {
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 90000 })
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length),
    { timeout: 90000 }).toBeGreaterThan(0)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
}

for (const [view, orbit] of [['forward', 0], ['opposite', Math.PI], ['sideways', Math.PI / 2]] as const) {
  test(`throw gesture reaches along actual flight with ${view} camera aim`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const server = await fixture(page, { generatedPark: true, carry: true, position: { x: 0, y: .84, z: 78, yaw: Math.PI } })
    await page.goto('/park')
    await readyCarryScene(page)
    await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).faceCarryTarget())
    await expect(page.getByRole('button', { name: /님 들기/ })).toBeVisible()
    await page.locator('canvas').focus()
    await page.keyboard.press('KeyE')
    await expect(page.getByRole('button', { name: /캐릭터 방향으로 던지기/ })).toBeVisible()
    await page.evaluate(async yaw => {
      const { viewControls } = await import('/src/world/cameraPerspective.ts' as string)
      viewControls.yaw = yaw; viewControls.pitch = 0
    }, orbit)
    await expect.poll(async () => page.evaluate(async () => Math.abs((await import('/tests/e2e/sceneProbe.ts' as string))
      .adCameraProbe().direction[1]!))).toBeLessThan(.05)
    const sample = (count: number): ReturnType<typeof carryThrowGestureFrames> => page.evaluate(async frames =>
      (await import('/tests/e2e/sceneProbe.ts' as string)).carryThrowGestureFrames(frames), count)
    await sample(12)
    await page.keyboard.press('KeyE')
    await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_THROW').length).toBe(1)
    const launch = server.sent.find(message => message.type === 'WORLD_CARRY_THROW')!.payload
    // The acknowledgement is the release position; subsequent public physics snapshots provide flight direction.
    await sample(2)
    // Turn the viewing camera after release: the gesture must keep following the original flight.
    await page.evaluate(async yaw => {
      const { viewControls } = await import('/src/world/cameraPerspective.ts' as string)
      viewControls.yaw = yaw + Math.PI / 2; viewControls.pitch = .2; viewControls.distance = 4.5
    }, orbit)
    const dx = Number(launch.dx), dz = Number(launch.dz), length = Math.hypot(dx, dz)
    const flags = { moving: false, running: false, swimming: false, lastInputSeq: 0 }
    const frames = []
    for (let tick = 1; tick <= 22; tick++) {
      const t = tick / 60
      server.worldSnapshot({ avatars: [
        { userId: '101', carry: null, position: { ...flags, x: 0, y: .84, z: 78, yaw: Math.PI } },
        { userId: '102', carry: { carryId: launch.carryId, partnerId: '101', role: 'THROWN' },
          position: { ...flags, x: dx * 14 * t, y: 2.54 + 8 * t - 15 * t * t, z: 78 + dz * 14 * t, yaw: Math.PI } },
      ] })
      frames.push(...await sample(1))
      if (tick === 7) await screenshot(page, `carry-pull-forward-${view}`)
      if (tick === 16) await screenshot(page, `carry-forward-throw-${view}`)
    }
    const reach = frames.map(frame => Math.min(...frame.hands.map(hand => (hand[0]! * dx + hand[2]! * dz) / length)))
    expect(Math.max(...reach)).toBeGreaterThan(.2)
    expect(Math.max(...frames.map(frame => frame.spine))).toBeGreaterThan(.08)
    for (const frame of frames) expect(frame.yaw).toBeCloseTo(Math.PI)
    await expect(page).toHaveTitle('OnTop')
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test('shoulder carry pulls the body forward before the push and joins the live flight without a pop', async ({ page }) => {
  const server = await fixture(page, { generatedPark: true, carry: true,
    position: { x: 0, y: .84, z: 78, yaw: Math.PI } })
  await page.goto('/park')
  await readyCarryScene(page)
  server.carryPlayers('101', '102')
  await expect(page.getByRole('button', { name: /캐릭터 방향으로 던지기/ })).toBeVisible()
  await page.evaluate(async () => {
    const { viewControls } = await import('/src/world/cameraPerspective.ts' as string)
    viewControls.yaw = Math.PI / 2; viewControls.pitch = .1; viewControls.distance = 4.8
    await (await import('/tests/e2e/sceneProbe.ts' as string)).carryRenderedFrames(12)
  })
  await screenshot(page, 'carry-shoulder-side')
  const capture: ReturnType<typeof carrySequenceFrames> = page.evaluate(async () =>
    (await import('/tests/e2e/sceneProbe.ts' as string)).carrySequenceFrames(65))
  await page.locator('canvas').focus()
  await page.keyboard.press('KeyE')
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_THROW').length).toBe(1)
  const launch = server.sent.find(message => message.type === 'WORLD_CARRY_THROW')!.payload
  const start = performance.now(), flags = { moving: false, running: false, swimming: false, lastInputSeq: 0 }
  const timer = setInterval(() => {
    const t = (performance.now() - start) / 1000
    server.worldSnapshot({ avatars: [
      { userId: '101', carry: null, position: { ...flags, x: 0, y: .84, z: 78, yaw: Math.PI } },
      { userId: '102', carry: { carryId: launch.carryId, partnerId: '101', role: 'THROWN' },
        position: { ...flags, x: Number(launch.dx) * 14 * t, y: Math.max(.84, 2.54 + 8 * t - 15 * t * t),
          z: 78 + Number(launch.dz) * 14 * t, yaw: Math.PI } },
    ] })
  }, 33)
  let frames: Awaited<typeof capture>
  try { frames = await capture } finally { clearInterval(timer) }
  await test.info().attach('shoulder-throw-sequence', { body: JSON.stringify(frames), contentType: 'application/json' })
  expect(frames.some(frame => frame.age >= 0 && frame.age < .07 && frame.supportZ < -.1)).toBe(true)
  expect(frames.some(frame => frame.age > .12 && frame.age < .22 && frame.supportZ > 0)).toBe(true)
  expect(frames.some(frame => frame.age > .22 && frame.age < .34 && frame.handsZ > .2)).toBe(true)
  expect(frames.some(frame => frame.age > .5 && frame.distance > 4)).toBe(true)
  const released = frames.findIndex(frame => frame.age >= 0)
  if (released > 0) expect(Math.hypot(...frames[released]!.hip.map((value, axis) => value - frames[released - 1]!.hip[axis]!))).toBeLessThan(.25)
  expect(Number(launch.dx)).toBeCloseTo(0, 2); expect(Number(launch.dz)).toBeCloseTo(-1, 2)
})

for (const [mode, carrierHeight, targetHeight, targetMoving] of [
  ['running', .84, .84, true], ['jumping-target', .84, 1.84, false],
  ['jumping-carrier', 1.84, .84, false], ['both-jumping', 1.84, 1.84, true],
] as const) {
  test(`pickup and throw remain available while ${mode}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const server = await fixture(page, { generatedPark: true, carry: true, chatDelayMs: 650,
      position: { x: 0, y: carrierHeight, z: 78, yaw: Math.PI } })
    await page.goto('/park')
    await readyCarryScene(page)
    server.remotePose({ x: 0, y: targetHeight, z: 77, moving: targetMoving, running: targetMoving })
    await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).faceCarryTarget())
    await expect(page.getByRole('button', { name: /님 들기/ })).toBeVisible()
    await page.locator('canvas').focus()
    if (mode === 'running') {
      await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyD')
      await expect.poll(() => server.sent.some(message => message.type === 'WORLD_MOVE'
        && message.payload.run === true && (message.payload.dx || message.payload.dz))).toBeTruthy()
    }
    await page.keyboard.press('KeyE')
    await page.keyboard.up('KeyD'); await page.keyboard.up('ShiftLeft')
    await expect(page.getByRole('button', { name: /캐릭터 방향으로 던지기/ })).toBeVisible()
    await screenshot(page, `carry-pickup-${mode}`)
    await page.keyboard.press('KeyE')
    await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_THROW').length).toBe(1)
    await expect.poll(() => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string))
      .carryProbe().carries['102']?.role)).toBe('THROWN')
    await expect(page).toHaveTitle('OnTop')
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test('pickup hint and E accept 2.5m of reach and stop outside 2.6m', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const server = await fixture(page, { generatedPark: true, carry: true, position: { x: 0, y: .84, z: 78, yaw: Math.PI } })
  await page.goto('/park')
  await readyCarryScene(page)
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).faceCarryTarget())
  const pickup = page.getByRole('button', { name: /님 들기/ })
  // First observe the outside state, so an old visible hint cannot satisfy the inside check.
  server.remotePose({ z: 75.39 })
  await expect(pickup).toBeHidden()
  await page.locator('canvas').focus()
  await page.keyboard.press('KeyE')
  expect(server.sent.filter(message => message.type === 'WORLD_CARRY_PICKUP')).toHaveLength(0)
  server.remotePose({ z: 75.5 })
  await expect(pickup).toBeVisible()
  await screenshot(page, 'carry-reach-2point5m')
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('button', { name: /캐릭터 방향으로 던지기/ })).toBeVisible()
  expect(server.sent.filter(message => message.type === 'WORLD_CARRY_PICKUP')).toHaveLength(1)
  await expect(page).toHaveTitle('OnTop')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

for (const firstPerson of [false, true]) {
  test(`native mouse look survives pickup, throw and AD escape (${firstPerson ? 'first' : 'third'} person)`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const server = await fixture(page, { generatedPark: true, carry: true, position: { x: 0, y: .84, z: 78, yaw: Math.PI } })
    await page.goto('/park')
    await readyCarryScene(page)
    const probe = () => page.evaluate(async () =>
      (await import('/tests/e2e/sceneProbe.ts' as string)).adCameraProbe())
    const faceTarget = () => page.evaluate(async first => {
      const { viewControls } = await import('/src/world/cameraPerspective.ts' as string)
      // The orbit camera sees the target between itself and the own avatar; the eye camera
      // must turn to the opposite heading to see that same nearby target.
      viewControls.yaw = first ? 0 : Math.PI
      viewControls.pitch = .48
    }, firstPerson)
    await faceTarget()
    const pickup = page.getByRole('button', { name: /님 들기/ })
    const throwing = page.getByRole('button', { name: /캐릭터 방향으로 던지기/ })
    await expect(pickup).toBeVisible()
    await page.locator('canvas').focus()
    if (firstPerson) await page.keyboard.press('KeyV')
    await expect.poll(async () => (await probe()).direction[2]! * (firstPerson ? -1 : 1)).toBeGreaterThan(.7)
    await expect(pickup).toBeVisible()
    await page.keyboard.press('Control')
    await expect.poll(async () => (await probe()).active).toBe(true)
    await page.keyboard.press('KeyE')
    await expect(throwing).toBeVisible()
    expect((await probe()).active).toBe(true)
    const before = (await probe()).controls.yaw
    await page.mouse.move(700, 350)
    await page.mouse.move(780, 350, { steps: 8 })
    await expect.poll(async () => (await probe()).controls.yaw).not.toBe(before)
    await screenshot(page, `carry-mouse-look-${firstPerson ? 'first' : 'third'}-person`)
    await page.keyboard.press('KeyE')
    await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_THROW').length).toBe(1)
    await expect(throwing).toBeHidden()
    expect((await probe()).active).toBe(true)

    const carryId = '11111111-1111-4111-8111-111111111111'
    const flags = { x: 0, z: 78, yaw: Math.PI, moving: false, running: false, swimming: false, lastInputSeq: 0 }
    server.worldSnapshot({ avatars: [
      { userId: '101', position: { ...flags, y: 2.54 }, carry: { carryId, partnerId: '102', role: 'CARRIED' } },
      { userId: '102', position: { ...flags, y: .84 }, carry: { carryId, partnerId: '101', role: 'CARRIER' } },
    ] })
    const escape = page.getByRole('status', { name: 'A와 D를 번갈아 6회 눌러 내려오기' })
    await expect(escape).toBeVisible()
    for (const key of ['KeyA', 'KeyD', 'KeyA', 'KeyD', 'KeyA', 'KeyD']) await page.keyboard.press(key)
    await expect(escape).toBeHidden()
    expect((await probe()).active).toBe(true)
    // Explicit unlock still works, and a pickup made while unlocked must not acquire it.
    await page.keyboard.press('Control')
    await expect.poll(async () => (await probe()).active).toBe(false)
    await faceTarget()
    await expect(pickup).toBeVisible()
    await page.keyboard.press('KeyE')
    await expect(throwing).toBeVisible()
    expect((await probe()).active).toBe(false)
    await page.keyboard.press('Control')
    await expect.poll(async () => (await probe()).active).toBe(true)
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('주변 채팅 메시지')).toBeFocused()
    expect((await probe()).active).toBe(false)
    await expect(page).toHaveTitle('OnTop')
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

for (const perspective of ['third-person', 'first-person']) {
  test(`E throws along the left-facing character independently of the camera (${perspective})`, async ({ page }) => {
    const server = await fixture(page, { generatedPark: true, carry: true, position: { x: 0, y: .84, z: 78, yaw: Math.PI } })
    await page.goto('/park')
    await readyCarryScene(page)
    await page.evaluate(async () => {
      const path = '/tests/e2e/sceneProbe.ts'
      ;(await import(path)).faceCarryTarget()
    })
    await expect(page.getByRole('button', { name: /님 들기/ })).toBeVisible()
    await page.locator('canvas').focus()
    await page.keyboard.press('KeyE')
    await expect(page.getByRole('button', { name: /캐릭터 방향으로 던지기/ })).toBeVisible()
    if (perspective === 'first-person') await page.keyboard.press('KeyV')
    await page.evaluate(async () => {
      const { viewControls } = await import('/src/world/cameraPerspective.ts' as string)
      viewControls.yaw = 0; viewControls.pitch = 0
    })
    const camera = () => page.evaluate(async () => {
      const path = '/tests/e2e/sceneProbe.ts'
      return (await import(path)).adCameraProbe()
    })
    await expect.poll(async () => Math.abs((await camera()).direction[0]!)).toBeLessThan(.05)
    await page.keyboard.down('KeyA')
    await expect.poll(async () => Math.sin((await camera()).renderedYaw!)).toBeLessThan(-.99)
    const view = await camera()
    expect(Math.abs(view.direction[2]!)).toBeGreaterThan(.9)
    await screenshot(page, `carry-character-heading-${perspective}`)
    await page.evaluate(async () => {
      const path = '/tests/e2e/sceneProbe.ts'
      ;(await import(path)).captureNextCarryThrow()
    })
    await page.keyboard.press('KeyE')
    await page.keyboard.up('KeyA')
    await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_THROW').length).toBe(1)
    const sent = server.sent.find(message => message.type === 'WORLD_CARRY_THROW')!.payload
    const direction = await page.evaluate(async () => {
      const path = '/tests/e2e/sceneProbe.ts'
      return (await import(path)).carryProbe().inputDirection!
    })
    // The input edge advances interpolation slightly beyond the most recently rendered frame.
    expect(sent.dx).toBeCloseTo(direction[0]!, 2)
    expect(sent.dy).toBeCloseTo(direction[1]!, 2)
    expect(sent.dz).toBeCloseTo(direction[2]!, 2)
    expect(sent.dx).toBeLessThan(-.99)
    expect(sent.dy).toBe(0)
    expect(Math.abs(sent.dz as number)).toBeLessThan(.01)
  })
}

test('a carried player escapes only with six alternating AD presses, without movement or repeat-key escape', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const server = await fixture(page, { generatedPark: true, carry: true, position: { x: 0, y: .84, z: 78, yaw: Math.PI } })
  await page.goto('/park')
  await readyCarryScene(page)
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  server.carryPlayers('102', '101')
  const escape = page.getByRole('status', { name: 'A와 D를 번갈아 6회 눌러 내려오기' })
  await expect(escape).toBeVisible()
  await expect(escape.locator('kbd')).toHaveText(['A', 'D'])
  await expect(escape).toHaveText('A↔D')
  const keyDepthDifference = () => escape.locator('kbd').evaluateAll(keys => {
    const depths = keys.map(key => {
      const transform = getComputedStyle(key).transform
      return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42
    })
    return depths[0]! - depths[1]!
  })
  await expect.poll(keyDepthDifference).toBeGreaterThan(.7)
  await expect.poll(keyDepthDifference).toBeLessThan(-.7)
  await expect(page.getByRole('button', { name: /내려오기/ })).toHaveCount(0)
  await page.locator('canvas').focus()
  await page.keyboard.press('Escape')
  await page.keyboard.press('KeyE')
  for (let i = 0; i < 8; i++) await page.keyboard.press('KeyA')
  await page.keyboard.down('KeyD')
  for (let i = 0; i < 8; i++) await page.keyboard.down('KeyD')
  await page.keyboard.up('KeyD')
  expect(server.sent.filter(message => message.type === 'WORLD_CARRY_RELEASE')).toHaveLength(0)
  // Clear partial progress through a real focus interruption; typed AD must not escape.
  await page.keyboard.press('Enter')
  const chat = page.getByLabel('주변 채팅 메시지')
  await expect(chat).toBeFocused()
  await chat.press('KeyA'); await chat.press('KeyD')
  // Observe multiple busy-state samples: chatting preserves this same hold.
  await page.waitForTimeout(350)
  await expect(escape).toBeVisible()
  expect(server.sent.some(message => message.type === 'WORLD_INTERACTION_SET' && message.payload.busy)).toBe(false)
  expect(server.sent.filter(message => message.type === 'WORLD_CARRY_RELEASE')).toHaveLength(0)
  await page.keyboard.press('Escape')
  // The same hold must not reuse the partial key progress from before chat.
  await expect(escape).toBeVisible()
  await page.locator('canvas').focus()
  await screenshot(page, 'carry-ad-escape')
  await page.setViewportSize({ width: 900, height: 540 })
  await expect(escape).toBeInViewport()
  const hintBox = await escape.boundingBox(), chatBox = await page.getByRole('region', { name: '주변 채팅', exact: true }).boundingBox()
  expect(hintBox!.y + hintBox!.height).toBeLessThan(chatBox!.y)
  await screenshot(page, 'carry-ad-escape-short')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => escape.locator('kbd').evaluateAll(keys =>
    keys.every(key => key.getAnimations().length === 0))).toBe(true)
  const movementBefore = server.sent.filter(message => message.type === 'WORLD_MOVE'
    && (message.payload.dx || message.payload.dz)).length
  for (const key of ['KeyD', 'KeyA', 'KeyD', 'KeyA', 'KeyD']) await page.keyboard.press(key)
  expect(server.sent.filter(message => message.type === 'WORLD_CARRY_RELEASE')).toHaveLength(0)
  await page.keyboard.press('KeyA')
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_RELEASE').length).toBe(1)
  await expect(escape).toBeHidden()
  expect(server.sent.filter(message => message.type === 'WORLD_CARRY_PICKUP')).toHaveLength(0)
  expect(server.sent.filter(message => message.type === 'WORLD_MOVE'
    && (message.payload.dx || message.payload.dz))).toHaveLength(movementBefore)
})

for (const role of ['CARRIER', 'CARRIED'] as const) {
  test(`chat preserves the same carry while typing and sending (${role})`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const server = await fixture(page, { generatedPark: true, carry: true,
      position: { x: 0, y: .84, z: 78, yaw: Math.PI } })
    await page.goto('/park')
    await readyCarryScene(page)
    server.carryPlayers(role === 'CARRIER' ? '101' : '102', role === 'CARRIED' ? '101' : '102')
    const ownCarry = () => page.evaluate(async () =>
      (await import('/tests/e2e/sceneProbe.ts' as string)).carryProbe().carries['101'])
    await expect.poll(async () => (await ownCarry())?.role).toBe(role)
    const initial = await ownCarry()
    const moveCount = () => server.sent.filter(message => message.type === 'WORLD_MOVE'
      && (message.payload.dx || message.payload.dz)).length
    const movementBefore = moveCount()
    await page.locator('canvas').focus()
    await page.keyboard.press('Enter')
    const chat = page.getByLabel('주변 채팅 메시지')
    await expect(chat).toBeFocused()
    await chat.pressSequentially('adadade')
    // This spans multiple 100ms samples and would release both players before the fix.
    await page.waitForTimeout(350)
    expect(await ownCarry()).toEqual(initial)
    expect(server.sent.some(message => message.type === 'WORLD_INTERACTION_SET' && message.payload.busy)).toBe(false)
    expect(server.sent.filter(message => message.type.startsWith('WORLD_CARRY'))).toHaveLength(0)
    expect(moveCount()).toBe(movementBefore)
    await screenshot(page, `carry-chat-${role.toLowerCase()}`)
    await chat.press('Enter')
    await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CHAT_SEND').length).toBe(1)
    await page.waitForTimeout(350)
    expect(await ownCarry()).toEqual(initial)
    expect(server.sent.some(message => message.type === 'WORLD_INTERACTION_SET' && message.payload.busy)).toBe(false)
    await expect(chat).toBeHidden()
    expect(await ownCarry()).toEqual(initial)
    await page.keyboard.press('Enter')
    await expect(chat).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(chat).toBeHidden()
    expect(await ownCarry()).toEqual(initial)
    // A real non-chat panel still requests the existing safe release.
    await page.keyboard.press('KeyM')
    await expect(page.getByRole('dialog', { name: '공원 지도창', exact: true })).toBeVisible()
    await expect.poll(() => server.sent.some(message => message.type === 'WORLD_INTERACTION_SET'
      && message.payload.busy === true)).toBe(true)
    await expect.poll(ownCarry).toBeNull()
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(page.url()).toContain('/park')
    expect(await page.title()).not.toBe('')
    expect(errors).toEqual([])
  })
}

test('throw snapshots render a rising flight and tumbling body instead of an upright drop', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const server = await fixture(page, { generatedPark: true, carry: true, position: { x: 0, y: .84, z: 78, yaw: Math.PI } })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await readyCarryScene(page)
  await page.evaluate(async () => {
    const path = '/tests/e2e/sceneProbe.ts'
    ;(await import(path)).faceCarryTarget(0)
  })
  await expect(page.getByRole('button', { name: /님 들기/ })).toBeVisible()
  await page.locator('canvas').focus()
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('button', { name: /캐릭터 방향으로 던지기/ })).toBeVisible()
  await expect.poll(async () => page.evaluate(async () => {
    const path = '/tests/e2e/sceneProbe.ts'
    return Math.abs((await import(path)).adCameraProbe().direction[1]!)
  })).toBeLessThan(.05)
  await page.keyboard.press('KeyE')
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_THROW').length).toBe(1)
  const launch = server.sent.find(message => message.type === 'WORLD_CARRY_THROW')!.payload
  const flags = { moving: false, running: false, swimming: false, lastInputSeq: 0 }
  const flight = []
  // Wire presentation only. Native Bullet flight, bounds and landing are covered by WorldCarryPhysicsTests.
  for (let tick = 0; tick <= 24; tick += 3) {
    const t = tick / 30
    server.worldSnapshot({ avatars: [
      { userId: '101', carry: null, position: { ...flags, x: 0, y: .84, z: 78, yaw: Math.PI } },
      { userId: '102', carry: { carryId: launch.carryId, partnerId: '101', role: 'THROWN' },
        position: { ...flags, x: Number(launch.dx) * 14 * t,
          y: Math.max(.84, 2.54 + (8 + Number(launch.dy) * 6) * t - 15 * t * t),
          z: 78 + Number(launch.dz) * 14 * t, yaw: Math.PI },
        motion: { tick, epoch: 10, appliedInputSeq: 0, inputAgeMs: 0,
          velocityY: 8 + Number(launch.dy) * 6 - 30 * t, grounded: false, inputActive: false } },
    ] })
    await page.waitForTimeout(100)
    flight.push(await page.evaluate(async () => {
      const path = '/tests/e2e/sceneProbe.ts'
      return (await import(path)).carryFlightProbe()
    }))
    if (tick === 9) await screenshot(page, 'carry-throw-rising')
    if (tick === 21) await screenshot(page, 'carry-throw-flight')
  }
  expect(Math.max(...flight.map(frame => frame.height))).toBeGreaterThan(2.1)
  expect(flight.at(-1)!.distance).toBeGreaterThan(5)
  expect(Math.abs(flight.at(-1)!.roll)).toBeGreaterThan(1)
  expect(Math.abs(flight.at(-1)!.pitch - flight[0]!.pitch)).toBeGreaterThan(1)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('held avatar follows the rendered carrier every frame while running and changing direction', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const server = await fixture(page, { generatedPark: true, carry: true, position: { x: 0, y: .84, z: 78, yaw: Math.PI } })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await readyCarryScene(page)
  await page.evaluate(async () => {
    const path = '/tests/e2e/sceneProbe.ts'
    ;(await import(path)).faceCarryTarget()
  })
  await expect(page.getByRole('button', { name: /님 들기/ })).toBeVisible()
  await page.locator('canvas').focus()
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('button', { name: /캐릭터 방향으로 던지기/ })).toBeVisible()
  const frames: Awaited<ReturnType<typeof carryRenderedFrames>> = []
  await page.keyboard.down('ShiftLeft')
  for (const key of ['KeyW', 'KeyD']) {
    await page.keyboard.down(key)
    frames.push(...await page.evaluate(async () => {
      const path = '/tests/e2e/sceneProbe.ts'
      return (await import(path)).carryRenderedFrames(35)
    }))
    await page.keyboard.up(key)
  }
  await screenshot(page, 'carry-running-follow-desktop')
  await page.keyboard.up('ShiftLeft')
  for (const { supportDelta, handGap, yawDifference } of frames) {
    // The held hips follow the posed shoulders, including the carrier's stride bob.
    expect(supportDelta[0]!).toBeCloseTo(.06, 2)
    expect(supportDelta[1]!).toBeCloseTo(.08, 2)
    expect(supportDelta[2]!).toBeCloseTo(-.28, 2)
    expect(handGap).toBeLessThan(.5)
    // Independent pose samples can differ slightly during a fast heading interpolation.
    expect(Math.abs(Math.atan2(Math.sin(yawDifference), Math.cos(yawDifference)))).toBeLessThan(.03)
  }
  const start = frames[0]!.carrier, end = frames.at(-1)!.carrier
  expect(Math.hypot(end[0]! - start[0]!, end[2]! - start[2]!)).toBeGreaterThan(.5)
  expect(server.sent.some(message => message.type === 'WORLD_MOVE' && message.payload.run === true)).toBe(true)
  await page.keyboard.press('Escape')
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_RELEASE').length).toBe(1)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(page.url()).toContain('/park')
  expect(await page.title()).not.toBe('')
  expect(errors).toEqual([])
})

test('E picks up a nearby player, throws along the character heading, and blocks games and chat', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`) })
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
  const server = await fixture(page, { generatedPark: true, carry: true, position: { x: 0, y: .84, z: 78, yaw: Math.PI } })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length),
    { timeout: 90000 }).toBeGreaterThan(0)
  await readyCarryScene(page)
  await page.evaluate(async () => {
    const path = '/tests/e2e/sceneProbe.ts'
    ;(await import(path)).faceCarryTarget()
  })
  const pickup = page.getByRole('button', { name: /님 들기/ })
  await expect(pickup).toBeVisible()
  await page.locator('canvas').focus()
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('button', { name: /캐릭터 방향으로 던지기/ })).toBeVisible()
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_PICKUP').length).toBe(1)
  await screenshot(page, 'carry-holding-desktop')
  const direction = await page.evaluate(async () => {
    const path = '/tests/e2e/sceneProbe.ts'
    const yaw = (await import(path)).adCameraProbe().renderedYaw!
    return { dx: Math.sin(yaw), dy: 0, dz: Math.cos(yaw) }
  })
  await page.keyboard.press('KeyE')
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_THROW').length).toBe(1)
  const thrown = server.sent.find(message => message.type === 'WORLD_CARRY_THROW')!
  expect(thrown.payload.dx).toBeCloseTo(direction.dx, 2)
  expect(thrown.payload.dy).toBeCloseTo(direction.dy, 2)
  expect(thrown.payload.dz).toBeCloseTo(direction.dz, 2)
  await expect.poll(() => page.evaluate(async () => {
    const path = '/tests/e2e/sceneProbe.ts'
    return (await import(path)).carryProbe().carries['102']?.role
  }), { message: JSON.stringify(server.sent.filter(message => message.type.startsWith('WORLD_CARRY')
    || message.type === 'WORLD_INTERACTION_SET')) }).toBe('THROWN')
  await screenshot(page, 'carry-thrown-desktop')
  server.releaseCarry()
  await expect.poll(() => page.evaluate(async () => {
    const path = '/tests/e2e/sceneProbe.ts'
    return (await import(path)).carryProbe().carries['102'] ?? null
  })).toBeNull()
  await expect(pickup).toBeVisible()

  for (const activity of ['GAME', 'BUNGEOPPANG'] as const) {
    server.activity('102', activity)
    await expect(pickup).toBeHidden()
    const before = server.sent.filter(message => message.type.startsWith('WORLD_CARRY')).length
    await page.keyboard.press('KeyE')
    expect(server.sent.filter(message => message.type.startsWith('WORLD_CARRY')).length).toBe(before)
  }
  server.activity('102', null)
  await expect(pickup).toBeVisible()
  await page.keyboard.press('Enter')
  const chat = page.getByLabel('주변 채팅 메시지')
  await expect(chat).toBeFocused()
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_INTERACTION_SET'
    && message.payload.busy === true).length).toBeGreaterThan(0)
  const busyRequests = server.sent.filter(message => message.type === 'WORLD_INTERACTION_SET').length
  // Observe several 100ms samples: an unchanged open window must not send another packet.
  await page.waitForTimeout(350)
  expect(server.sent.filter(message => message.type === 'WORLD_INTERACTION_SET')).toHaveLength(busyRequests)
  await chat.fill('e')
  const before = server.sent.filter(message => message.type.startsWith('WORLD_CARRY')).length
  await chat.press('KeyE')
  expect(server.sent.filter(message => message.type.startsWith('WORLD_CARRY')).length).toBe(before)
  await page.keyboard.press('Escape')
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_INTERACTION_SET').at(-1)?.payload.busy).toBe(false)
  await page.setViewportSize({ width: 900, height: 540 })
  await page.locator('canvas').focus()
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('button', { name: /캐릭터 방향으로 던지기/ })).toBeInViewport()
  await screenshot(page, 'carry-short-viewport')
  await page.keyboard.press('Escape')
  await expect(pickup).toBeVisible()
  expect(server.sent.filter(message => message.type === 'WORLD_CARRY_RELEASE')).toHaveLength(1)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(await page.title()).not.toBe('')
  expect(page.url()).toContain('/park')
  expect(errors).toEqual([])
})
