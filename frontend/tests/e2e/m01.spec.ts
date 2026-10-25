import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { benchAnchors } from '../../src/features/interactions/benchAnchors'

test('facility preview uses the existing login screen with real social entry routes', async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: {} }))
  await page.goto('/')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.locator('.login-page')).toBeVisible()
  await expect(page.getByRole('button', { name: 'SSAFY로 계속하기' })).toBeVisible()
  await expect(page.getByRole('button', { name: '네이버로 계속하기' })).toBeVisible()
  await expect(page.locator('.migration-mock-entry')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '로그인 없이 둘러보기 · 준비중', exact: true })).toBeDisabled()
  await expect(page.locator('#guest-availability')).toHaveText('게스트 로그인은 서버 연동 준비 중입니다.')
  await expect(page.locator('.park-page')).toHaveCount(0)
  await screenshot(page, 'm01-existing-login')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'SSAFY로 계속하기' })).toBeVisible()
  await screenshot(page, 'm01-existing-login-mobile')
})

test('M01 bench shares target selection, waits for approval, restores input/camera and keeps Spring transport', async ({ page }) => {
  const errors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  const bench = benchAnchors[0]!
  const server = await fixture(page, { position: { x: bench.position[0], y: bench.position[1] + 0.8,
    z: bench.position[2] + 2, yaw: Math.PI } })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await expect(page.locator('.park-account__nickname')).toHaveText('공원 산책자')
  await expect(page.locator('.park-account__balance')).toHaveText('—냥')
  const hint = page.getByLabel('가까운 상호작용')
  await expect(hint).toHaveAttribute('data-target-id', bench.id)
  // Keyboard and visible button use the same target and the shared facility transport.
  await page.locator('canvas').focus()
  await page.keyboard.press('KeyE')
  await expect(hint.getByRole('button', { name: '벤치에서 일어나기' })).toBeVisible()
  await expect(hint).not.toContainText('목업')
  const requestsWhileSeated = server.sent.length
  await page.evaluate(async () => {
    const { parkRuntime } = await import('/src/park/runtime/runtime.ts' as string)
    const { TABLES } = await import('/src/config/index.ts' as string)
    parkRuntime.move(1, 0, true, true)
    parkRuntime.inspectTable(TABLES[0].id)
    await parkRuntime.joinTable().catch(() => {})
    await parkRuntime.selectChannel('other-channel')
  })
  expect(server.sent).toHaveLength(requestsWhileSeated)
  await page.evaluate(async () => {
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    useSession.setState({ error: '' })
  })
  await expect.poll(() => page.evaluate(async () => {
    const probe = await import('/tests/e2e/sceneProbe.ts' as string)
    return probe.benchProbe().ownVisible
  })).toBe(false)
  const remoteSeat = await page.evaluate(async () => {
    const probe = await import('/tests/e2e/sceneProbe.ts' as string)
    const mine = probe.benchProbe().lease
    return mine.seat === 0 ? 1 : 0
  })
  server.facilities.remote(bench.id, remoteSeat)
  await expect.poll(() => page.evaluate(async () => {
    const probe = await import('/tests/e2e/sceneProbe.ts' as string)
    return probe.benchProbe().remoteVisible
  })).toBe(true)
  await screenshot(page, 'm01-bench-seated')
  await page.keyboard.press('Enter')
  await page.getByLabel('주변 채팅 메시지').fill('벤치에서 대화')
  const before = server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz)).length
  await page.keyboard.press('KeyW')
  await expect(hint.getByRole('button', { name: '벤치에서 일어나기' })).toBeVisible()
  expect(server.sent.filter(m => m.type === 'WORLD_MOVE' && (m.payload.dx || m.payload.dz))).toHaveLength(before)
  await page.keyboard.press('Escape')
  await page.locator('canvas').focus()
  await page.keyboard.down('KeyW')
  await expect(hint.getByRole('button', { name: '벤치에서 일어나기' })).toBeHidden()
  await expect.poll(() => server.sent.some(m => m.type === 'WORLD_MOVE' && m.payload.dz !== 0)).toBe(true)
  await page.keyboard.up('KeyW')
  await expect.poll(() => page.evaluate(async () => {
    const probe = await import('/tests/e2e/sceneProbe.ts' as string)
    return probe.benchProbe().ownVisible
  })).toBe(true)
  await expect(hint).toHaveAttribute('data-target-id', bench.id)
  await screenshot(page, 'm01-bench-nearby')
  await hint.getByRole('button', { name: /벤치에 앉기/ }).click()
  await expect(hint.getByRole('button', { name: '벤치에서 일어나기' })).toBeVisible()
  server.close(1012)
  await expect.poll(() => page.evaluate(async () => {
    const probe = await import('/tests/e2e/sceneProbe.ts' as string)
    return probe.benchProbe().benchId
  })).toBe('')
  await expect.poll(() => server.connections).toBe(2)
  await expect(page.locator('.park-account__nickname')).toHaveText('공원 산책자')
  expect(server.maxActive).toBe(1)
  expect(server.sent.some(m => m.type === 'WORLD_FACILITY_USE')).toBe(true)
  expect(server.sent.some(m => m.type === 'WORLD_FACILITY_RELEASE')).toBe(true)
  expect(server.sent.some(m => /BENCH|sit-bench|stand-bench/.test(m.type))).toBe(false)
  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
})
