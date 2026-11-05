import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parkFixture } from './fixture'

const probePath = '/tests/park-integration/jumpmapOverlapProbe.ts'
const probe = (page: Page) => page.evaluate(async source => (await import(source)).overlapProbe(), probePath)
const overlap = (page: Page, value: boolean) => page.evaluate(async ({ source, value }) =>
  (await import(source)).setDiagnosticOverlap(value), { source: probePath, value })

test('첫 겹침과 반복 겹침에서 셰이더를 추가 생성하지 않고 입력과 카메라를 갱신한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|shader|React/.test(message.text())) errors.push(message.text())
  })
  const server = await parkFixture(page)
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
    mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null, version: 1,
    updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(),
  } }))
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page).toHaveURL(/\/park$/)
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('park-scene-presented').length),
    { timeout: 100000 }).toBeGreaterThan(0)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.evaluate(async source => (await import(source)).startOverlapDiagnostic(), probePath)
  await page.locator('canvas').focus()
  await page.keyboard.down('w')
  try {
    await expect.poll(async () => (await probe(page)).remoteOpacity).toBe(1)
    await page.waitForTimeout(1500)
    const before = await probe(page), requestsBefore = server.requests.filter(r => r.type === 'WORLD_MOVE').length
    await overlap(page, true)
    await expect.poll(async () => (await probe(page)).remoteOpacity).toBeLessThan(.45)
    await page.waitForTimeout(2000)
    const first = await probe(page), requestsAfter = server.requests.filter(r => r.type === 'WORLD_MOVE').length
    expect(first.programs).toBe(before.programs)
    expect(first.frames).toBeGreaterThan(10)
    expect(requestsAfter).toBeGreaterThan(requestsBefore + 5)
    expect(first.camera[0]).toBeGreaterThan(before.camera[0])
    expect(first.own.x).toBeGreaterThan(before.own.x)
    expect(Object.values(first.inputState).every(value => !value)).toBe(true)
    await overlap(page, false)
    await expect.poll(async () => (await probe(page)).remoteOpacity).toBeGreaterThan(.99)
    await overlap(page, true)
    await expect.poll(async () => (await probe(page)).remoteOpacity).toBeLessThan(.45)
    await page.waitForTimeout(2000)
    const repeated = await probe(page)
    expect(repeated.programs).toBe(before.programs)
    expect(repeated.frames).toBeGreaterThan(10)
    expect(errors).toEqual([])
    const evidence = { before, first, repeated, requestsBefore, requestsAfter, errors }
    console.log(JSON.stringify(evidence))
    const directory = process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-jumpmap-overlap')
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, 'overlap-metrics.json'), JSON.stringify(evidence, null, 2))
    await page.screenshot({ path: path.join(directory, 'jumpmap-overlap.png') })
  } finally {
    await page.keyboard.up('w')
    await page.evaluate(async source => (await import(source)).stopOverlapDiagnostic(), probePath)
  }
})
