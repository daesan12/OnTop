import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('simple map stays inside the scene and resolution budgets', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const errors: string[] = [], surfaceRequests: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if(m.type()==='error')errors.push(m.text()) })
  page.on('request', r => { if(/\/art\/materials\/|zelkova-leaves/.test(r.url()))surfaceRequests.push(r.url()) })
  await page.goto('/layout-preview.html')
  await expect(page.getByText('배치 준비 완료', { exact: true })).toBeVisible({ timeout: 90000 })
  const measure = () => page.evaluate(async () => (await import('/tests/layout-e2e/renderCostProbe.ts' as string)).renderCostProbe())
  const dir = process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-layout-qa')
  await fs.mkdir(dir, { recursive: true })
  await page.waitForTimeout(2200)
  const overview = await measure()
  await page.screenshot({ path: path.join(dir, 'after-overview.png') })
  await page.getByLabel('배치 시안 시설 목록').getByRole('button', { name: /19.*스폰/ }).click()
  await page.waitForTimeout(1000)
  const plaza = await measure()
  await page.screenshot({ path: path.join(dir, 'after-plaza.png') })
  await fs.writeFile(path.join(dir, 'candidate.json'), JSON.stringify({ overview, plaza }, null, 2))
  for (const cost of [overview, plaza]) {
    expect(cost.shadows).toBe(false)
    expect(cost.triangles).toBeLessThan(700000)
    expect(cost.drawCalls).toBeLessThan(500)
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
  await expect.poll(async () => { const c = await measure(); return c.width * c.height }).toBeLessThanOrEqual(1280 * 720)
  expect(errors).toEqual([])
  expect(surfaceRequests).toEqual([])
})
