import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { SERVER_SPEED } from '../../src/features/skewer/serviceHall/plan'

for (const reverse of [false, true]) test(`서빙 지터·중복 응답에서 ${reverse ? '180도 방향 전환' : '직선 이동'}을 부드럽게 표시한다`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/tests/skewer-coop/fixtures/movement.html')
  await expect(page).toHaveTitle('꼬치왕 이동 전환 검수')
  const host = page.locator('#host')
  await expect(host).toHaveAttribute('data-fixture-ready', 'true')
  await expect(host).toHaveAttribute('data-server-model', 'sculpted', { timeout: 45000 })
  const result = await page.evaluate(reverse => Reflect.get(window, 'movementQA').run(reverse) as {
    minStep: number; maxStep: number; maxTurn: number; startMs: number; reverseMs: number; moving: boolean }, reverse)
  expect(result.startMs).toBeLessThan(130)
  expect(result.maxStep).toBeLessThanOrEqual(SERVER_SPEED / 60 + .000001)
  if (!reverse) {
    expect(result.minStep).toBeGreaterThan(.09)
    expect(result.maxStep - result.minStep).toBeLessThan(.000001)
  } else {
    expect(result.reverseMs).toBeLessThan(160)
    expect(result.maxTurn).toBeLessThan(Math.PI / 3)
  }
  expect(result.moving).toBe(true)
  const resumed = await page.evaluate(() => Reflect.get(window, 'movementQA').resume() as { expected: { x: number; z: number }; displayed: { x: number; z: number } })
  expect(resumed.displayed).toEqual(resumed.expected)
  expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  const folder = process.env.SKEWER_FEEDBACK_EVIDENCE
  if (folder) { await mkdir(folder, { recursive: true }); await page.screenshot({ path: path.join(folder, `movement-${reverse ? 'reverse' : 'straight'}.png`) }) }
})
