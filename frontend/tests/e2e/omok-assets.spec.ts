import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fixture, screenshot } from './contractFixture'

test('OMOK asset measurement in a populated park', async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.RUN_OMOK_ASSET_QA !== '1',
    'Explicit matched-scene asset audit.',
  )
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const server = await fixture(page, { omok: true, players: 16 })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({
    timeout: 90_000,
  })
  await page.locator('canvas').click({ position: { x: 80, y: 300 } })
  await page.keyboard.press('KeyE')
  await page.getByRole('button', { name: '앉기', exact: true }).click()
  const samples = []
  for (const kind of ['no-board', 'empty', '75-stones'] as const) {
    if (kind === 'empty')
      await page.getByLabel('1인 참가비').fill('1'); await page.getByRole('button', { name: '오목 선택', exact: true }).click()
    if (kind === '75-stones') server.renderBoard(75)
    for (const [light, phase] of [
      ['day', 0.6],
      ['night', 0.05],
    ] as const) {
      await page.evaluate(async (phase) => {
        const q = await import('/tests/e2e/sceneProbe.ts' as string)
        q.visualTime(phase)
        q.resetFrames()
      }, phase)
      const frames = () =>
        page.evaluate(async () => {
          const q = await import('/tests/e2e/sceneProbe.ts' as string)
          return q.sceneProbe().metrics.frames
        })
      await expect.poll(frames, { timeout: 30_000 }).toBeGreaterThan(60)
      await page.evaluate(async () => {
        const q = await import('/tests/e2e/sceneProbe.ts' as string)
        q.resetFrames()
      })
      await expect.poll(frames, { timeout: 30_000 }).toBeGreaterThan(180)
      const sample = await page.evaluate(async () => {
        const q = await import('/tests/e2e/sceneProbe.ts' as string)
        return {
          ...q.sceneProbe(),
          omok: q.omokGeometry(),
          gpuTiming: await q.gpuTimes(),
        }
      })
      samples.push({ kind, light, ...sample })
      if (kind === '75-stones')
        await screenshot(
          page,
          `omok-${process.env.ASSET_QA_LABEL ?? 'current'}-${light}-16`,
        )
    }
  }
  const dir =
    process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-fe-qa')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(
      dir,
      `omok-${process.env.ASSET_QA_LABEL ?? 'current'}-metrics.json`,
    ),
    JSON.stringify(
      {
        environment: {
          cpu: os.cpus()[0]?.model,
          browser: browser.version(),
          api: 'WebGL 2',
          preset: 'Low',
          viewport: '1920x1080',
          players: 16,
          network:
            'Local intercepted HTTP/RawWS, no WAN delay; render fixture only. Identical seated camera for every case.',
        },
        samples,
        errors,
      },
      null,
      2,
    ),
  )
  expect(errors).toEqual([])
})
