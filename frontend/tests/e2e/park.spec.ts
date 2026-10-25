import { test, expect } from '@playwright/test'
import { fixture, screenshot, tableId } from './contractFixture'
import { TABLES } from '../../src/config'

test('park shares one socket for chat, input and server-confirmed table seats', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const server = await fixture(page)
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({
    timeout: 90_000,
  })
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.locator('.park-account__nickname')).toHaveText(
    '공원 산책자',
  )
  await expect(page.locator('.park-account__balance')).toHaveText('100냥')
  expect(server.connections).toBe(1)
  expect(server.tickets).toBe(1)
  await page.keyboard.press('Enter')
  const input = page.getByLabel('주변 채팅 메시지')
  await expect(input).toBeFocused()
  const before = server.sent.filter((m) => m.type === 'WORLD_MOVE').length
  await input.fill('한글 👋 <b>그대로</b>')
  await page.waitForTimeout(150)
  expect(server.sent.filter((m) => m.type === 'WORLD_MOVE')).toHaveLength(
    before,
  )
  await input.press('Enter')
  await expect(page.locator('.park-chat__message')).toHaveCount(1)
  await expect(page.locator('.park-chat__message')).toContainText(
    '<b>그대로</b>',
  )
  await expect(page.locator('.park-chat__message b')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.locator('canvas').click({ position: { x: 80, y: 300 } })
  await page.keyboard.down('KeyW')
  await expect
    .poll(() =>
      server.sent.some((m) => m.type === 'WORLD_MOVE' && m.payload.dz !== 0),
    )
    .toBe(true)
  await page.keyboard.up('KeyW')
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('dialog', { name: '테이블 정보' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '앉기', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: '앉기', exact: true }).click()
  await expect(page.getByRole('button', { name: '일어나기' })).toBeVisible()
  expect(server.sent.find((m) => m.type === 'TABLE_JOIN')?.payload).toEqual({
    tableId,
  })
  await screenshot(page, 'park-seated')
  await page.getByRole('button', { name: '일어나기' }).click()
  await expect(
    page.getByRole('button', { name: '앉기', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '테이블 정보 닫기' }).click()
  expect(server.maxActive).toBe(1)
  expect(server.connections).toBe(1)
  await screenshot(page, 'park-roaming')
  await page.getByRole('button', { name: '나가기', exact: true }).click()
  await expect(page.getByRole('main', { name: '로그인' }))
    .toBeVisible()
    .catch(async () => {
      await expect(page.locator('.login-page')).toBeVisible()
    })
  await expect.poll(() => server.active).toBe(0)
  expect(errors).toEqual([])
})

test('chat rejection retains the draft; missing mappings never send a seat request', async ({
  page,
}) => {
  const server = await fixture(page, { bindings: false })
  server.rejectChat()
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({
    timeout: 90_000,
  })
  await page.keyboard.press('Enter')
  const input = page.getByLabel('주변 채팅 메시지')
  await input.fill('재시도 초안')
  await input.press('Enter')
  await expect(input).toHaveValue('재시도 초안')
  await expect(page.locator('.park-chat__message')).toHaveCount(0)
  await input.press('Escape')
  await page.locator('canvas').click({ position: { x: 80, y: 300 } })
  await page.keyboard.press('KeyE')
  await expect(page.getByRole('dialog')).toContainText('배치 연결이 필요')
  expect(server.sent.some((m) => m.type === 'TABLE_JOIN')).toBe(false)
})

test('map mismatch blocks movement and session invalidation returns to unchanged login', async ({
  page,
}) => {
  const server = await fixture(page, { mapVersion: 'mismatch' })
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('맵 버전')
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(150)
  await page.keyboard.up('KeyW')
  expect(server.sent.some((m) => m.type === 'WORLD_MOVE')).toBe(false)
  server.endSession()
  await expect(page.locator('.login-page')).toBeVisible()
  await expect.poll(() => server.active).toBe(0)
  expect(server.connections).toBe(1)
  await screenshot(page, 'login-preserved')
})

test('login and onboarding keep teammate assets and controls', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/refresh', (r) =>
    r.fulfill({ status: 401, json: {} }),
  )
  await page.goto('/')
  await expect(page.locator('.login-page')).toBeVisible()
  await screenshot(page, 'login-desktop')
  await page.route('**/api/v1/auth/exchange', (r) =>
    r.fulfill({
      json: {
        status: 'ONBOARDING_REQUIRED',
        onboardingToken: 'fixture-onboarding',
      },
    }),
  )
  await page.goto('/auth/callback#exchange_code=' + 'A'.repeat(43))
  await expect(page.locator('.onboarding-page')).toBeVisible()
  await screenshot(page, 'onboarding-preserved')
})

test('table pointer picking, seated visibility, LOD and quality controls', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await fixture(page)
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({
    timeout: 90_000,
  })
  await page.evaluate(async () => {
    const q = await import('/tests/e2e/sceneProbe.ts' as string)
    q.fixtureProfiles()
  })
  await expect(page.locator('.park-account__nickname')).toHaveText(
    '테스트 산책자',
  )
  await expect(page.locator('.park-account__balance')).toHaveText('1,234냥')
  await page.evaluate(async () => {
    const q = await import('/tests/e2e/sceneProbe.ts' as string)
    q.orbit(-Math.PI / 2, 0.45, 9)
    q.resetFrames()
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const q = await import('/tests/e2e/sceneProbe.ts' as string)
        return q.sceneProbe().metrics.frames
      }),
    )
    .toBeGreaterThan(30)
  const point = await page.evaluate(async (id) => {
    const q = await import('/tests/e2e/sceneProbe.ts' as string)
    return q.pointForTable(id)
  }, TABLES[0]!.id)
  await page.locator('canvas').click({ position: point })
  await expect(page.getByRole('dialog', { name: '테이블 정보' })).toBeVisible()
  await page.getByRole('button', { name: '앉기', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const q = await import('/tests/e2e/sceneProbe.ts' as string)
        const state = q.sceneProbe()
        return {
          seated: state.seated,
          own: state.ownVisible,
          remote: state.remoteVisible,
        }
      }),
    )
    .toEqual({ seated: true, own: false, remote: true })
  await page.getByRole('button', { name: '일어나기' }).click()
  await page.getByRole('button', { name: '테이블 정보 닫기' }).click()
  await page.getByRole('button', { name: '그래픽 · 성능', exact: true }).click()
  await page.getByLabel('그래픽 품질').selectOption('high')
  await expect(page.getByLabel('그래픽 품질')).toHaveValue('high')
  await page.evaluate(async () => {
    const q = await import('/tests/e2e/sceneProbe.ts' as string)
    q.orbit(-Math.PI / 2, 0.45, 55)
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const q = await import('/tests/e2e/sceneProbe.ts' as string)
        return q.avatarLODs().every((a: { far: boolean }) => a.far)
      }),
    )
    .toBe(true)
  await page.evaluate(async () => {
    const q = await import('/tests/e2e/sceneProbe.ts' as string)
    q.orbit(-Math.PI / 2, 0.45, 3.2)
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const q = await import('/tests/e2e/sceneProbe.ts' as string)
        return q.avatarLODs().every((a: { near: boolean }) => a.near)
      }),
    )
    .toBe(true)
  await screenshot(page, 'park-high-pointer-lod')
  expect(errors).toEqual([])
})

test('reconnection uses a fresh ticket without overlapping sockets or replaying chat', async ({
  page,
}) => {
  const server = await fixture(page)
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({
    timeout: 90_000,
  })
  await page.keyboard.press('Enter')
  await page.getByLabel('주변 채팅 메시지').fill('한 번만')
  await page.getByLabel('주변 채팅 메시지').press('Enter')
  await expect(page.locator('.park-chat__message')).toHaveCount(1)
  server.close(1013)
  await expect.poll(() => server.connections, { timeout: 15_000 }).toBe(2)
  await expect
    .poll(() => server.sent.filter((m) => m.type === 'CHANNEL_JOIN').length)
    .toBe(2)
  await expect(page.locator('.park-chat__message')).toHaveCount(0)
  expect(server.tickets).toBe(2)
  expect(server.maxActive).toBe(1)
  expect(server.sent.filter((m) => m.type === 'WORLD_CHAT_SEND')).toHaveLength(
    1,
  )
  server.close(1008)
  await expect(page.getByRole('alert')).toContainText('같은 계정')
  await page.waitForTimeout(1200)
  expect(server.connections).toBe(2)
})
