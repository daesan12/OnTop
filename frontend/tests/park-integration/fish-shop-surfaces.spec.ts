import { expect, test } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { parkFixture, identity } from './fixture'

test('fish shop surfaces remain single-coloured at every seam as the camera moves', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await parkFixture(page)
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page).toHaveURL(/\/park$/)
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  expect(await page.evaluate(async () =>
    (await import('/src/network/worldClient.ts' as string)).useSession.getState().mapVersion)).toBe(identity.mapVersion)
  const directory = process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-fish-surface-qa')
  await fs.mkdir(directory, { recursive: true })
  const transforms: number[][] = []
  for (const [frame, offset] of [0, .012, -.012].entries()) {
    const view = await page.evaluate(async offset =>
      (await import('/tests/park-integration/fishShopSurfaceProbe.ts' as string)).frameShop(offset), offset)
    transforms.push(view.shop)
    await page.screenshot({ path: path.join(directory, `fish-shop-${frame}.png`) })
  }
  expect(transforms[1]).toEqual(transforms[0])
  expect(transforms[2]).toEqual(transforms[0])
  const probe = await page.evaluate(async () =>
    (await import('/tests/park-integration/fishShopSurfaceProbe.ts' as string)).shopSurfaceProbe())
  expect(probe.shops).toBe(1)
  expect(probe.meshes).toBeGreaterThan(3)
  expect(probe.samples.filter((sample: { covered: boolean; surfaceColors: number }) => !sample.covered || sample.surfaceColors !== 1)).toEqual([])
  await page.setViewportSize({ width: 740, height: 900 })
  await page.evaluate(async () => (await import('/tests/park-integration/fishShopSurfaceProbe.ts' as string)).frameShop())
  await page.screenshot({ path: path.join(directory, 'fish-shop-narrow.png') })
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
