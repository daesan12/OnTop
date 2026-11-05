import { test, expect } from '@playwright/test'
import { parkFixture } from './fixture'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
const source = '/tests/park-integration/fenceMovementProbe.ts'
test('울타리에서 전송 콜백이 밀려도 경로를 보존하고 키 재입력 없이 이동을 재개한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const server = await parkFixture(page, { clientPositions: true })
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
    mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null, version: 1,
    updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(),
  } }))
  await page.goto('/park')
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length), { timeout: 100000 }).toBeGreaterThan(0)
  await page.evaluate(async s => (await import(s)).setupFenceMovement(), source)
  const read = () => page.evaluate(async s => (await import(s)).readFenceMovement(), source)
  server.place({ x: 13, y: 1.9, z: 21.4, yaw: 0 })
  await expect.poll(async () => (await read()).epoch).toBe(2)
  await page.evaluate(async s => (await import(s)).holdFenceReports(true), source)
  await page.locator('canvas').focus()
  await page.keyboard.down('Shift'); await page.keyboard.down('s')
  try {
    await page.waitForTimeout(350)
    const held = await read()
    await page.waitForTimeout(250)
    const stillHeld = await read(), reportStart = server.requests.length
    expect(stillHeld.predicted.z).toBeCloseTo(held.predicted.z, 4)
    expect(stillHeld.predicted.y).toBeCloseTo(held.predicted.y, 4)
    await page.evaluate(async s => (await import(s)).holdFenceReports(false), source)
    await expect.poll(async () => (await read()).own!.z).toBeGreaterThan(23)
    const resumed = await read(), reports = server.requests.slice(reportStart).filter(r => r.type === 'WORLD_POSITION')
    expect(resumed.epoch).toBe(2)
    expect(resumed.flags.running).toBe(true)
    expect(reports.every(r => Array.isArray(r.payload.path) && r.payload.path.length >= 1 && r.payload.path.length <= 64)).toBe(true)
    expect(reports.some(r => (r.payload.path as unknown[]).length > 1)).toBe(true)
    expect(errors).toEqual([])
    const directory = process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-fence-movement')
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, 'browser-backpressure.json'), JSON.stringify({ held, stillHeld, resumed, reports, errors,
      scope: 'Actual DOM, Rapier and renderer; outgoing callback held for 600ms. Echo mock; Java validation tested separately.' }, null, 2))
    await page.screenshot({ path: path.join(directory, 'browser-backpressure.png') })
  } finally {
    await page.evaluate(async s => (await import(s)).holdFenceReports(false), source)
    await page.keyboard.up('s'); await page.keyboard.up('Shift')
  }
})

test('울타리 끝 달리기와 짧은 착지 점프에서 실제 경로를 전송하고 카메라 이동을 유지한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const server = await parkFixture(page, { clientPositions: true })
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
    mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null, version: 1,
    updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(),
  } }))
  await page.goto('/park')
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length), { timeout: 100000 }).toBeGreaterThan(0)
  await page.evaluate(async s => (await import(s)).setupFenceMovement(), source)
  const read = () => page.evaluate(async s => (await import(s)).readFenceMovement(), source)
  server.place({ x: 13, y: 1.9, z: 21, yaw: 0 })
  await expect.poll(async () => (await read()).epoch).toBe(2)
  const before = await read()
  await page.locator('canvas').focus()
  await page.keyboard.down('Shift'); await page.keyboard.down('s')
  try {
    await expect.poll(async () => (await read()).own!.z).toBeGreaterThan(23)
    await expect.poll(async () => (await read()).own!.y).toBeLessThan(1)
    const departed = await read()
    expect(departed.epoch).toBe(2)
    expect(departed.flags.running).toBe(true)
    expect(departed.camera).not.toEqual(before.camera)
    await page.keyboard.up('s'); await page.keyboard.up('Shift')
    server.place({ x: 13.25, y: 1.9, z: 8.5, yaw: 0 }, false, { grounded: false, velocityY: -2.7 })
    await expect.poll(async () => (await read()).epoch).toBe(3)
    const reportStart = server.requests.length
    await page.keyboard.down('Shift'); await page.keyboard.down('a'); await page.keyboard.press('Space')
    await expect.poll(() => server.requests.slice(reportStart).some(r => r.type === 'WORLD_POSITION'
      && Number(r.payload.y) > 2.4)).toBe(true)
    const jumped = await read(), reports = server.requests.slice(reportStart).filter(r => r.type === 'WORLD_POSITION')
    expect(reports.some(r => (r.payload.path as { jump: boolean }[] | undefined)?.some(p => p.jump))).toBe(true)
    expect(jumped.epoch).toBe(3)
    expect(Object.values(jumped.inputState).some(Boolean)).toBe(false)
    expect(errors).toEqual([])
    const directory = process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-fence-movement')
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, 'browser-fence-movement.json'), JSON.stringify({ before, departed, jumped, reports, errors,
      scope: 'Actual DOM, Rapier and renderer with echo-only transport. Java validator and authenticated WebSocket are verified separately.' }, null, 2))
    await page.screenshot({ path: path.join(directory, 'browser-fence-movement.png') })
  } finally {
    await page.keyboard.up('s'); await page.keyboard.up('a'); await page.keyboard.up('Shift')
  }
})
