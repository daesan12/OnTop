import { test, expect } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

// Only these test pages substitute OAuth responses. Production uses the real BE.
for (const provider of ['naver', 'ssafy'] as const) {
  test(`${provider} entry uses BE authorize then shared exchange and an approved park session`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const server = await fixture(page)
    await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: {} }))
    const code = 'A'.repeat(43)
    let authorizations = 0, exchanges = 0
    await page.route(`**/api/v1/auth/${provider}/authorize`, route => {
      authorizations++
      expect(route.request().method()).toBe('GET')
      expect(new URL(route.request().url()).search).toBe('')
      return route.fulfill({ status: 302, headers: { Location: '/auth/callback#exchange_code=' + code } })
    })
    await page.route('**/api/v1/auth/exchange', route => {
      exchanges++
      expect(route.request().method()).toBe('POST')
      expect(route.request().postDataJSON()).toEqual({ exchangeCode: code })
      return route.fulfill({ json: { status: 'AUTHENTICATED', accessToken: 'fixture-access' } })
    })
    await page.goto('/')
    await expect(page).toHaveTitle('OnTop')
    await expect(page.getByRole('heading', { name: '온탑 로그인', exact: true })).toBeAttached()
    await page.getByRole('button', { name: provider === 'naver' ? '네이버로 계속하기' : 'SSAFY로 계속하기', exact: true }).click()
    await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
    await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
    expect(new URL(page.url()).hostname).toBe('localhost')
    expect(new URL(page.url()).pathname).toBe('/park')
    expect(new URL(page.url()).hash).toBe('')
    expect(authorizations).toBe(1)
    expect(exchanges).toBe(1)
    expect(server.tickets).toBe(1)
    expect(server.connections).toBe(1)
    expect(errors).toEqual([])
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  })
}

test('new NAVER member shares onboarding and an invalid exchange never opens the park', async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/v1/auth/naver/authorize', route => route.fulfill({ status: 302, headers: { Location: '/auth/callback#exchange_code=' + 'B'.repeat(43) } }))
  await page.route('**/api/v1/auth/exchange', route => route.fulfill({ json: { status: 'ONBOARDING_REQUIRED', onboardingToken: 'fixture-onboarding' } }))
  await page.goto('/')
  await page.getByRole('button', { name: '네이버로 계속하기', exact: true }).click()
  await expect(page.locator('.onboarding-page')).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/onboarding')
  expect(new URL(page.url()).hash).toBe('')
  await expect(page.getByLabel('공원 기본 화면')).toHaveCount(0)
  await page.route('**/api/v1/auth/exchange', route => route.fulfill({ status: 401, json: { code: 'AUTH_INVALID_EXCHANGE_CODE' } }))
  await page.goto('/auth/callback#exchange_code=' + 'C'.repeat(43))
  await expect(page.getByRole('heading', { name: '로그인을 완료하지 못했습니다', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '로그인 화면으로 돌아가기', exact: true })).toBeVisible()
  expect(new URL(page.url()).hash).toBe('')
  await expect(page.getByLabel('공원 기본 화면')).toHaveCount(0)
})

test('guest is honestly unavailable without a BE contract, on desktop and mobile', async ({ page }) => {
  const calls: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) calls.push(new URL(request.url()).pathname) })
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: {} }))
  await page.goto('/')
  for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    await expect(page).toHaveTitle('OnTop')
    const guest = page.getByRole('button', { name: '로그인 없이 둘러보기 · 준비중', exact: true })
    await expect(guest).toBeVisible()
    await expect(guest).toBeDisabled()
    await expect(page.locator('#guest-availability')).toContainText('서버 연동 준비 중')
    const box = await guest.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(page.locator('.login-page')).toBeVisible()
    await expect(page.getByLabel('공원 기본 화면')).toHaveCount(0)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    await screenshot(page, `login-providers-${size.width}`)
  }
  expect(calls.every(path => path === '/api/v1/auth/refresh')).toBe(true)
  expect(errors).toEqual([])
})
