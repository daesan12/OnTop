import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

async function readyCarryScene(page: Page) {
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length),
    { timeout: 90000 }).toBeGreaterThan(0)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
}

for (const firstPerson of [false, true]) {
  test(`native mouse look survives pickup, throw and E escape (${firstPerson ? 'first' : 'third'} person)`, async ({ page }) => {
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
    const throwing = page.getByRole('button', { name: /바라보는 방향으로 던지기/ })
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
    const escape = page.getByRole('button', { name: 'E 내려오기', exact: true })
    await expect(escape).toBeVisible()
    await page.keyboard.press('KeyE')
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
  test(`E throws along the turned camera independently of avatar heading (${perspective})`, async ({ page }) => {
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
    await expect(page.getByRole('button', { name: /바라보는 방향으로 던지기/ })).toBeVisible()
    if (perspective === 'first-person') await page.keyboard.press('KeyV')
    await page.mouse.move(1100, 400)
    await page.mouse.down()
    await page.mouse.move(750, 360, { steps: 14 })
    await page.mouse.up()
    const camera = () => page.evaluate(async () => {
      const path = '/tests/e2e/sceneProbe.ts'
      return (await import(path)).adCameraProbe()
    })
    await expect.poll(async () => Math.abs((await camera()).direction[0]!)).toBeGreaterThan(.7)
    const view = await camera()
    expect(view.pose!.yaw).toBeCloseTo(Math.PI)
    await screenshot(page, `carry-camera-aim-${perspective}`)
    await page.evaluate(async () => {
      const path = '/tests/e2e/sceneProbe.ts'
      ;(await import(path)).captureNextCarryThrow()
    })
    await page.keyboard.press('KeyE')
    await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_THROW').length).toBe(1)
    const sent = server.sent.find(message => message.type === 'WORLD_CARRY_THROW')!.payload
    const direction = await page.evaluate(async () => {
      const path = '/tests/e2e/sceneProbe.ts'
      return (await import(path)).carryProbe().inputDirection!
    })
    expect(sent.dx).toBeCloseTo(direction[0]!, 6)
    expect(sent.dy).toBeCloseTo(direction[1]!, 6)
    expect(sent.dz).toBeCloseTo(direction[2]!, 6)
  })
}

test('a carried player escapes with E and repeat E does not pick someone up', async ({ page }) => {
  const server = await fixture(page, { generatedPark: true, carry: true, position: { x: 0, y: .84, z: 78, yaw: Math.PI } })
  await page.goto('/park')
  await readyCarryScene(page)
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  const carryId = '11111111-1111-4111-8111-111111111111'
  const flags = { x: 0, z: 78, yaw: Math.PI, moving: false, running: false, swimming: false, lastInputSeq: 0 }
  server.worldSnapshot({ avatars: [
    { userId: '101', position: { ...flags, y: 2.54 }, carry: { carryId, partnerId: '102', role: 'CARRIED' } },
    { userId: '102', position: { ...flags, y: .84 }, carry: { carryId, partnerId: '101', role: 'CARRIER' } },
  ] })
  const escape = page.getByRole('button', { name: 'E 내려오기', exact: true })
  await expect(escape).toBeVisible()
  await expect(escape).toHaveAttribute('aria-keyshortcuts', 'E')
  await page.locator('canvas').focus()
  await page.keyboard.press('Escape')
  expect(server.sent.filter(message => message.type === 'WORLD_CARRY_RELEASE')).toHaveLength(0)
  await screenshot(page, 'carry-e-escape')
  await page.keyboard.down('KeyE')
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_RELEASE').length).toBe(1)
  await page.keyboard.down('KeyE')
  await page.keyboard.up('KeyE')
  await expect(escape).toBeHidden()
  expect(server.sent.filter(message => message.type === 'WORLD_CARRY_PICKUP')).toHaveLength(0)
})

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
  await expect(page.getByRole('button', { name: /바라보는 방향으로 던지기/ })).toBeVisible()
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
  await expect(page.getByRole('button', { name: /바라보는 방향으로 던지기/ })).toBeVisible()
  const frames: { carrier: number[]; carried: number[]; yawDifference: number }[] = []
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
  for (const { carrier, carried, yawDifference } of frames) {
    // The two render subscribers sample performance.now separately within a frame.
    expect(Math.abs(carried[0]! - carrier[0]!)).toBeLessThan(.01)
    expect(Math.abs(carried[1]! - carrier[1]! - 1.7)).toBeLessThan(.01)
    expect(Math.abs(carried[2]! - carrier[2]!)).toBeLessThan(.01)
    expect(Math.abs(yawDifference)).toBeLessThan(.01)
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

test('E picks up a nearby player, throws along the camera, and blocks games and chat', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: /바라보는 방향으로 던지기/ })).toBeVisible()
  await expect.poll(() => server.sent.filter(message => message.type === 'WORLD_CARRY_PICKUP').length).toBe(1)
  await screenshot(page, 'carry-holding-desktop')
  const direction = await page.evaluate(async () => {
    const path = '/tests/e2e/sceneProbe.ts'
    return (await import(path)).carryProbe().aim
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
  await expect(page.getByRole('button', { name: /바라보는 방향으로 던지기/ })).toBeInViewport()
  await screenshot(page, 'carry-short-viewport')
  await page.keyboard.press('Escape')
  await expect(pickup).toBeVisible()
  expect(server.sent.filter(message => message.type === 'WORLD_CARRY_RELEASE')).toHaveLength(1)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(await page.title()).not.toBe('')
  expect(page.url()).toContain('/park')
  expect(errors).toEqual([])
})
