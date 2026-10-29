import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixture, screenshot } from './contractFixture'

test('own predicted avatar keeps immediate travel and visibly blends keyboard-direction facing', async ({ page }) => {
  await fixture(page, { manualMovement: true, position: { x: -2.025, y: .8, z: 34, yaw: 0 } })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  const result = await page.evaluate(async () => {
    const wc = await import('/src/network/worldClient.ts' as string)
    const { localMovement } = await import('/src/network/localMovementPrediction.ts' as string)
    const { renderedMovementPose } = await import('/tests/e2e/sceneProbe.ts' as string)
    const { EXPECTED_MAP_VERSION } = await import('/src/config/mapVersion.ts' as string)
    const state = wc.useSession.getState()
    const position = { lastInputSeq: 0, x: -2.025, y: .8, z: 34, yaw: 0, moving: false, running: false, swimming: false }
    wc.receive({ type: 'WORLD_STATE', requestId: null, payload: {
      channelId: state.roomId, version: 100000, mapVersion: EXPECTED_MAP_VERSION,
      avatars: [{ userId: state.sessionId, position,
        motion: { epoch: 0, tick: 1, appliedInputSeq: 0, inputAgeMs: 250, velocityY: 0, grounded: true, inputActive: false } }],
    } })
    await localMovement.prepare()
    if (!localMovement.ready) throw new Error('Prediction unavailable')
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const start = performance.now()
    localMovement.intend({ dx: 1, dz: 0, run: false, jump: false }, start)
    const frames: { at: number; x: number; yaw: number }[] = []
    await new Promise<void>(resolve => {
      const frame = () => {
        const at = performance.now() - start, p = renderedMovementPose()
        if (p) frames.push({ at, x: p.x, yaw: p.yaw })
        if (at >= 230) resolve()
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    return { frames, official: wc.authoritativePose(state.sessionId),
      scope: 'Local actual Three.js rendering with synthetic login/transport and a direction intent; not live-server keyboard latency.' }
  })
  expect(result.frames.some(f => f.x > -2.025 + .03)).toBe(true)
  expect(result.frames.some(f => f.yaw > .03 && f.yaw < Math.PI / 2 - .03)).toBe(true)
  expect(result.frames.at(-1)!.yaw).toBeCloseTo(Math.PI / 2, 3)
  expect(result.official!.yaw).toBe(0)
  if (process.env.MOVEMENT_TURN_EVIDENCE_DIR)
    writeFileSync(join(process.env.MOVEMENT_TURN_EVIDENCE_DIR, 'turn-render.json'), JSON.stringify(result, null, 2))
  await screenshot(page, 'movement-turn-smoothed')
})
