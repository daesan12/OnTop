import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fixture, screenshot } from './contractFixture'

test('populated scene asset comparison', async ({ page, browser }) => {
  test.skip(
    process.env.RUN_ASSET_QA !== '1',
    'Explicit matched-scene asset audit, not part of the normal smoke suite.',
  )
  const errors: string[] = [],
    warnings: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') warnings.push(m.text())
  })
  await fixture(page, { players: 16 })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({
    timeout: 90_000,
  })
  await page.evaluate(async () => {
    const q = await import('/tests/e2e/sceneProbe.ts' as string)
    q.orbit(-Math.PI / 2, 0.45, 9)
  })
  const samples = []
  for (const [name, visible, phase] of [
    ['park-hidden', false, 0.6],
    ['day', true, 0.6],
    ['night', true, 0.05],
  ] as const) {
    await page.evaluate(
      async ({ visible, phase }) => {
        const q = await import('/tests/e2e/sceneProbe.ts' as string)
        q.assetVisibility(visible)
        q.visualTime(phase)
        q.resetFrames()
      },
      { visible, phase },
    )
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const q = await import('/tests/e2e/sceneProbe.ts' as string)
            return q.sceneProbe().metrics.frames
          }),
        { timeout: 40_000, intervals: [500] },
      )
      .toBeGreaterThan(60)
    const warmup = await page.evaluate(async () => {
      const q = await import('/tests/e2e/sceneProbe.ts' as string)
      const result = q.sceneProbe().metrics
      q.resetFrames()
      return result
    })
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const q = await import('/tests/e2e/sceneProbe.ts' as string)
            return q.sceneProbe().metrics.frames
          }),
        { timeout: 40_000, intervals: [500] },
      )
      .toBeGreaterThan(180)
    const sample = await page.evaluate(async () => {
      const q = await import('/tests/e2e/sceneProbe.ts' as string)
      return q.sceneProbe()
    })
    const gpu = await page.evaluate(async () => {
      const q = await import('/tests/e2e/sceneProbe.ts' as string)
      return q.gpuTimes()
    })
    samples.push({ name, warmup, gpuTiming: gpu, ...sample })
  }
  for (const [name, phase] of [
    ['day', 0.6],
    ['night', 0.05],
  ] as const) {
    await page.evaluate(async (phase) => {
      const q = await import('/tests/e2e/sceneProbe.ts' as string)
      q.assetVisibility(true)
      q.visualTime(phase)
      q.resetFrames()
    }, phase)
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const q = await import('/tests/e2e/sceneProbe.ts' as string)
          return q.sceneProbe().metrics.frames
        }),
      )
      .toBeGreaterThan(30)
    await screenshot(
      page,
      `${process.env.ASSET_QA_LABEL ?? 'current'}-${name}-16`,
    )
  }
  const transfer = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('/art/'))
      .map((e) => ({
        url: new URL(e.name).pathname,
        bytes: (e as PerformanceResourceTiming).decodedBodySize,
        durationMs: e.duration,
      })),
  )
  const dir =
    process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-fe-qa')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(
      dir,
      `${process.env.ASSET_QA_LABEL ?? 'current'}-asset-measurements.json`,
    ),
    JSON.stringify(
      {
        environment: {
          cpu: os.cpus()[0]?.model,
          browser: browser.version(),
          api: 'WebGL 2',
          preset: 'low',
          viewport: '1920x1080',
          players: 16,
          network:
            'Local HTTP/RawWS contract fixture; no WAN latency simulation',
          note: 'Frames include whole-scene CPU/GPU work. Memory is resident CPU buffer/RGBA+mipmap estimate, not driver memory. Park-hidden retains uploaded resources.',
        },
        samples,
        transfer,
        errors,
        warnings,
      },
      null,
      2,
    ),
  )
  expect(errors).toEqual([])
})
