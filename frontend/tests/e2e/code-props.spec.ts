import { test, expect } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { MAILBOX, MINI_PROPS } from '../../src/config/parkPlan'
for (const kind of ['mailbox', 'cart'] as const) {
  test(`${kind} code prop preserves its world anchor`, async ({ page }) => {
    const errors: string[] = [], logs: string[] = [], oldGlbs: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') logs.push(message.text()) })
    page.on('request', r => { if (/red-mailbox\.glb|fish-bread-cart\.glb/.test(r.url())) oldGlbs.push(r.url()) })
    const p = kind === 'mailbox' ? MAILBOX : MINI_PROPS[0]
    await fixture(page, { players: 1, manualMovement: true, position: { x: p.x - 1.5, y: 0.8, z: p.z, yaw: 0 } })
    await page.goto('/park')
    await expect(page).toHaveTitle(/OnTop|온탑/i)
    expect(new URL(page.url()).pathname).toBe('/park')
    await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
    await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
    await page.evaluate(async kind => {
      (await import('/tests/e2e/codePropsProbe.ts' as string)).propsView(kind)
      ;(await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(0.6)
    }, kind)
    await page.waitForTimeout(1500)
    const probe = () => page.evaluate(async kind => (await import('/tests/e2e/codePropsProbe.ts' as string)).propsProbe(kind), kind)
    const state = await probe()
    expect(state.code).toBe(true)
    expect(state.position).toEqual([p.x, 0, p.z])
    expect(state.lod).toBe(0)
    expect(state.nearTriangles).toBeGreaterThan(state.farTriangles)
    expect(state.farTriangles).toBeLessThan(state.nearTriangles * 0.7)
    expect(state.min[0]).toBeGreaterThanOrEqual(p.x - (kind === 'mailbox' ? MAILBOX.bodyHalfWidth : MINI_PROPS[0].width / 2) - 0.001)
    expect(state.max[0]).toBeLessThanOrEqual(p.x + (kind === 'mailbox' ? MAILBOX.bodyHalfWidth : MINI_PROPS[0].width / 2) + 0.001)
    expect(state.min[2]).toBeGreaterThanOrEqual(p.z - (kind === 'mailbox' ? MAILBOX.bodyHalfDepth : MINI_PROPS[0].depth / 2) - 0.001)
    expect(state.max[2]).toBeLessThanOrEqual(p.z + (kind === 'mailbox' ? MAILBOX.bodyHalfDepth : MINI_PROPS[0].depth / 2) + 0.001)
    expect(state.min[1]).toBeGreaterThanOrEqual(-0.001)
    expect(state.max[1]).toBeLessThanOrEqual(p.height + 0.001)
    await screenshot(page, `${kind}-day`)
    await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(0.05))
    await page.waitForTimeout(700)
    await screenshot(page, `${kind}-night`)
    await page.evaluate(async kind => (await import('/tests/e2e/codePropsProbe.ts' as string)).propsView(kind, true), kind)
    await expect.poll(async () => (await probe()).lod).toBe(1)
    await page.evaluate(async kind => {
      (await import('/tests/e2e/codePropsProbe.ts' as string)).propsView(kind)
      ;(await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(0.6)
    }, kind)
    await expect.poll(async () => (await probe()).lod).toBe(0)
    await page.evaluate(async kind => (await import('/tests/e2e/codePropsProbe.ts' as string)).propsDetailView(kind), kind)
    await page.waitForTimeout(500)
    await screenshot(page, `${kind}-detail`)
    await page.evaluate(async kind => (await import('/tests/e2e/codePropsProbe.ts' as string)).propsView(kind), kind)
    // This asset test is independent of optional feedback UI/service work.
    if (kind === 'cart') {
      await expect(page.getByRole('button', { name: /붕어빵.*구매|구매하기/ })).toHaveCount(0)
      expect([...state.signs].sort()).toEqual(['prop-sign-cartMenu', 'prop-sign-cartName'])
    }
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.waitForTimeout(500)
    await screenshot(page, `${kind}-compact`)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(errors).toEqual([]); expect(logs).toEqual([]); expect(oldGlbs).toEqual([])
    await page.evaluate(async () => (await import('/tests/e2e/codePropsProbe.ts' as string)).releasePropsView())
  })
}
