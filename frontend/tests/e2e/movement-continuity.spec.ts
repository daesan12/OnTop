import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixture, screenshot } from './contractFixture'

const directory = process.env.MOVEMENT_COMPARISON_DIR
test('renders rapid strafes, jumps, platform falls and stairs without correction teleports', async ({ page }) => {
  test.skip(!directory, 'Optional actual-render replay; generate the Bullet traces first.')
  const traces = JSON.parse(readFileSync(join(directory!, 'bullet-traces.json'), 'utf8'))
    .filter((t: { scenario: string; oneWayMs: number }) => t.oneWayMs === 50
      && ['strafe', 'jump', 'jump-pad', 'pad-fall', 'stairs'].includes(t.scenario))
  await fixture(page, { manualMovement: true, position: traces[0].initial })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await page.keyboard.press('v')
  const results = []
  let version = 200000
  for (const trace of traces) {
    const result = await page.evaluate(async ({ trace, version }) => {
      const wc = await import('/src/network/worldClient.ts' as string)
      const { localMovement } = await import('/src/network/localMovementPrediction.ts' as string)
      const { EXPECTED_MAP_VERSION } = await import('/src/config/mapVersion.ts' as string)
      const { renderedMovementPose } = await import('/tests/e2e/sceneProbe.ts' as string)
      const session = wc.useSession.getState()
      localMovement.reset()
      const receive = (state: typeof trace.initial) => wc.receive({ type: 'WORLD_STATE', requestId: null, payload: {
        channelId: session.roomId, version: ++version, mapVersion: EXPECTED_MAP_VERSION,
        avatars: [{ userId: session.sessionId, position: state, motion: state.motion }],
      } })
      receive(trace.initial); await localMovement.prepare()
      if (!localMovement.ready) throw new Error('Prediction unavailable')
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const start = performance.now()
      const events = [
        ...trace.frames.map((frame: typeof trace.frames[number]) => ({ at: frame.at, run: () => receive(frame.state) })),
        ...trace.intents.map((input: typeof trace.intents[number]) => ({ at: input.at, run: () => localMovement.intend(input.intent, start + input.at) })),
        ...trace.commands.map((input: typeof trace.commands[number]) => ({ at: input.at,
          run: () => localMovement.sentInput(input.seq, start + input.at, input.intent) })),
      ].sort((a, b) => a.at - b.at)
      const samples: { at: number; x: number; y: number; z: number; yaw: number; predictionReady: boolean }[] = []
      let event = 0
      await new Promise<void>(resolve => {
        const render = () => {
          const at = performance.now() - start
          const displayed = renderedMovementPose()
          if (displayed) samples.push({ at, ...displayed, predictionReady: localMovement.ready })
          while (event < events.length && events[event]!.at <= at) events[event++]!.run()
          if (at >= trace.duration) resolve()
          else requestAnimationFrame(render)
        }
        requestAnimationFrame(render)
      })
      return { scenario: trace.scenario, samples, official: wc.authoritativePose(session.sessionId), metrics: localMovement.metrics(),
        scope: 'Actual Three.js rendering, controlled Bullet trace/100ms RTT, synthetic login/transport. Human keyboard and deployed-server QA are separate.' }
    }, { trace, version })
    version += 10000
    results.push(result)
    writeFileSync(join(directory!, 'browser-continuity.json'), JSON.stringify(results, null, 2))
    expect(result.samples.length).toBeGreaterThan(30)
    for (let i = 1; i < result.samples.length; i++) {
      const a = result.samples[i - 1]!, b = result.samples[i]!, seconds = (b.at - a.at) / 1000
      expect(Math.hypot(b.x - a.x, b.z - a.z), `${trace.scenario} @${b.at}`).toBeLessThanOrEqual(12.125 * seconds + .06)
      expect(Math.abs(b.y - a.y), `${trace.scenario} @${b.at}`).toBeLessThanOrEqual(20 * seconds + .06)
    }
    await screenshot(page, 'movement-continuity-' + trace.scenario)
  }
  writeFileSync(join(directory!, 'browser-continuity.json'), JSON.stringify(results, null, 2))
})
