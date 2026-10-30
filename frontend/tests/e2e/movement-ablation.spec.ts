import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixture, screenshot } from './contractFixture'
import type { AblationMode } from '../diagnostics/movementAblation'

const directory = process.env.MOVEMENT_AB_DIR
test('isolates display and replay in actual avatar and camera rendering on identical Bullet traces', async ({ page }) => {
  test.skip(!directory, 'Optional diagnostic; generate local Bullet traces first')
  test.setTimeout(180_000)
  const traces = JSON.parse(readFileSync(join(directory!, 'bullet-traces.json'), 'utf8'))
    .filter((trace: { scenario: string; oneWayMs: number }) => trace.oneWayMs === 50
      && ['sprint', 'strafe', 'stairs', 'jump-pad'].includes(trace.scenario))
  await fixture(page, { manualMovement: true, position: traces[0].initial })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await page.waitForFunction(async () => {
    const { useSession, avatars } = await import('/src/network/worldClient.ts' as string)
    const session = useSession.getState()
    return session.status === 'connected' && !!session.roomId && avatars.has(session.sessionId)
  })
  await page.evaluate(async () => (await import('/src/world/cameraPerspective.ts' as string)).setCameraPerspective('third-person'))
  const results = [], raw: string[] = []
  let version = 500000
  for (const trace of traces) for (const mode of ['baseline', 'no-offset', 'no-replay'] as AblationMode[]) {
    const result = await page.evaluate(async ({ trace, mode, version }) => {
      const wc = await import('/src/network/worldClient.ts' as string)
      const { EXPECTED_MAP_VERSION } = await import('/src/config/mapVersion.ts' as string)
      const { localMovement } = await import('/src/network/localMovementPrediction.ts' as string)
      const { installMovementAblation, movementQuality } = await import('/tests/diagnostics/movementAblation.ts' as string)
      const { renderedMovementPose, renderedMovementCamera, observeMovementWrites } = await import('/tests/e2e/sceneProbe.ts' as string)
      const session = wc.useSession.getState()
      const receive = (state: typeof trace.initial) => wc.receive({ type: 'WORLD_STATE', requestId: null, payload: {
        channelId: session.roomId, version: ++version, mapVersion: EXPECTED_MAP_VERSION,
        avatars: [{ userId: session.sessionId, position: state, motion: state.motion }],
      } })
      localMovement.reset(); receive(trace.initial); await localMovement.prepare()
      const experiment = installMovementAblation(localMovement, mode)
      await new Promise(resolve => setTimeout(resolve, 400))
      const writes = observeMovementWrites()
      const start = performance.now(), samples: any[] = []
      let intent = { dx: 0, dz: 0, run: false, jump: false }, changedAt = 0
      const events = [
        ...trace.frames.map((frame: typeof trace.frames[number]) => ({ at: frame.at, run: () => receive(frame.state) })),
        ...trace.intents.map((input: typeof trace.intents[number]) => ({ at: input.at, run: () => {
          if (input.intent.dx !== intent.dx || input.intent.dz !== intent.dz || input.intent.run !== intent.run) changedAt = input.at
          intent = input.intent; localMovement.intend(intent, start + input.at)
        } })),
        ...trace.commands.map((input: typeof trace.commands[number]) => ({ at: input.at,
          run: () => localMovement.sentInput(input.seq, start + input.at, input.intent) })),
      ].sort((a, b) => a.at - b.at)
      let next = 0, previousWrite = 0
      try {
        await new Promise<void>(resolve => {
          const frame = () => {
            const at = performance.now() - start, writtenAt = writes.at(), display = renderedMovementPose(), probe = experiment.snapshot()
            if (display && probe.predicted && writtenAt > previousWrite && writtenAt >= start) samples.push({
              at: writtenAt - start, observedAt: at, display, camera: renderedMovementCamera(),
              predicted: probe.predicted, correction: probe.correction, motion: probe.motion,
              official: wc.authoritativePose(session.sessionId), intent: { ...intent }, changedAt })
            previousWrite = writtenAt
            while (next < events.length && events[next]!.at <= at) events[next++]!.run()
            if (at >= trace.duration) resolve(); else requestAnimationFrame(frame)
          }
          requestAnimationFrame(frame)
        })
        return { samples, quality: movementQuality(samples), ordinaryResets: experiment.snapshot().ordinaryResets,
          finalOfficial: wc.authoritativePose(session.sessionId) }
      } finally { writes.dispose(); experiment.dispose() }
    }, { trace, mode, version })
    version += 10000
    expect(result.samples.length).toBeGreaterThan(30)
    // Capture measurements; no claim that an ablation meets gameplay correctness.
    if (mode === 'no-replay') expect(result.ordinaryResets).toBe(0)
    raw.push(...result.samples.map((sample: unknown) => JSON.stringify({ scenario: trace.scenario, mode, sample })))
    results.push({ scenario: trace.scenario, rttMs: 100, mode, ...result.quality,
      ordinaryResets: result.ordinaryResets, finalOfficial: result.finalOfficial })
    await screenshot(page, 'movement-ablation-' + trace.scenario + '-' + mode)
    writeFileSync(join(directory!, 'ab-browser-results.json'), JSON.stringify({
      scope: 'Actual Three.js/Rapier avatar and camera; controlled Bullet 100ms RTT, synthetic auth/transport. Test-only bypasses do not approve client authority. Human observation separate.', results,
    }, null, 2))
    writeFileSync(join(directory!, 'ab-browser-frames.jsonl'), raw.join('\n') + '\n')
  }
})
