import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixture } from './contractFixture'

test('measures the real DOM key-to-runtime path including short alternating key pulses', async ({ page }) => {
  const directory = process.env.MOVEMENT_INPUT_TIMING_DIR
  test.skip(!directory, 'Opt-in local input timing; does not benchmark production latency.')
  await fixture(page, { manualMovement: true })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await page.locator('canvas').focus()
  const result = await page.evaluate(async () => {
    const { parkRuntime } = await import('/src/park/runtime/runtime.ts' as string)
    const { viewControls } = await import('/src/world/cameraPerspective.ts' as string)
    viewControls.yaw = 0
    const original = parkRuntime.move, originalSend = WebSocket.prototype.send
    const pulses: { direction: number; at: number; latencyMs: number | null }[] = []
    const sent: { at: number; bytes: number }[] = []
    let active: typeof pulses[number] | undefined
    parkRuntime.move = (dx: number, dz: number, run: boolean, jump = false) => {
      if (active && active.latencyMs === null && Math.sign(dx) === active.direction)
        active.latencyMs = performance.now() - active.at
      original(dx, dz, run, jump)
    }
    WebSocket.prototype.send = function(data) {
      if (typeof data === 'string' && JSON.parse(data).type === 'WORLD_MOVE')
        sent.push({ at: performance.now(), bytes: new TextEncoder().encode(data).byteLength })
      return originalSend.call(this, data)
    }
    const key = (type: string, code: string) => window.dispatchEvent(new KeyboardEvent(type, { code, cancelable: true }))
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    const started = performance.now()
    try {
      for (let i = 0; i < 24; i++) {
        const code = i % 2 ? 'KeyA' : 'KeyD'
        active = { direction: i % 2 ? -1 : 1, at: performance.now(), latencyMs: null }; pulses.push(active)
        key('keydown', code); await sleep(i < 12 ? 25 : 90)
        key('keyup', code); active = undefined
        await sleep(31 + i % 3 * 7)
      }
      await sleep(100)
      return { pulses, sent, durationMs: performance.now() - started,
        scope: 'Actual DOM keyboard handlers and transport queue in local headed-equivalent browser test with synthetic auth/transport. Runtime intent latency, not end-to-end production rendering latency.' }
    } finally { parkRuntime.move = original; WebSocket.prototype.send = originalSend }
  })
  writeFileSync(join(directory!, process.env.MOVEMENT_INPUT_TIMING_OUTPUT ?? 'input-timing.json'), JSON.stringify(result, null, 2))
  expect(result.pulses).toHaveLength(24)
  if (process.env.MOVEMENT_INPUT_TIMING_ASSERT === 'true') {
    expect(result.pulses.every(p => p.latencyMs !== null)).toBe(true)
    expect(Math.max(...result.pulses.map(p => p.latencyMs ?? Infinity))).toBeLessThan(16)
    for (let i = 1; i < result.sent.length; i++) expect(result.sent[i]!.at - result.sent[i - 1]!.at).toBeGreaterThanOrEqual(59)
  }
})
