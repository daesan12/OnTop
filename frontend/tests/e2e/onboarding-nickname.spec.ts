import { test, expect, type Page, type Route } from '@playwright/test'

const ONBOARDING_TOKEN = 'fixture-onboarding'

async function openOnboarding(page: Page) {
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/v1/auth/exchange', route => route.fulfill({ json: { status: 'ONBOARDING_REQUIRED', onboardingToken: ONBOARDING_TOKEN } }))
  await page.goto('/auth/callback#exchange_code=' + 'A'.repeat(43))
  await expect(page.locator('.onboarding-page')).toBeVisible()
}

test('onboarding nickname check asks the server and keeps only the latest answer', async ({ page }) => {
  const checked: string[] = []
  let releaseSlow!: () => void
  const slow = new Promise<void>(resolve => { releaseSlow = resolve })
  let failOnce = true
  await page.route('**/api/v1/users/nickname-availability?**', async (route: Route) => {
    const request = route.request()
    expect(request.method()).toBe('GET')
    expect(request.headers().authorization).toBe(`Bearer ${ONBOARDING_TOKEN}`)
    const nickname = new URL(request.url()).searchParams.get('nickname') ?? ''
    checked.push(nickname)
    if (nickname === '느린이름') {
      await slow
      return route.fulfill({ json: { nickname, available: true } }).catch(() => undefined)
    }
    if (nickname === '잠깐오류' && failOnce) {
      failOnce = false
      return route.fulfill({ status: 503, json: { code: 'USER_ONBOARDING_UNAVAILABLE', message: 'unavailable' } })
    }
    return route.fulfill({ json: { nickname, available: nickname !== '온탑고수' } })
  })
  await openOnboarding(page)
  const input = page.locator('#onboarding-nickname')
  const check = page.getByRole('button', { name: '중복 확인' })
  const feedback = page.locator('#onboarding-feedback')

  await input.fill('산책자')
  await expect(feedback).toHaveText('중복 확인이 필요해요.')
  await check.click()
  await expect(feedback).toHaveText('사용 가능한 닉네임이에요.')

  // Editing drops the previous result right away.
  await input.fill('온탑고수')
  await expect(feedback).toHaveText('중복 확인이 필요해요.')
  await check.click()
  await expect(feedback).toHaveText('이미 사용 중인 닉네임이에요.')
  await expect(input).toHaveAttribute('aria-invalid', 'true')

  // Local format rules still answer without a request.
  await input.fill('가')
  await check.click()
  await expect(feedback).toHaveText('한글, 영문, 숫자로 2~8자 입력해 주세요.')
  await input.fill('Gm관리')
  await expect(feedback).toHaveText('GM으로 시작하는 닉네임은 사용할 수 없어요.')

  // A server error can be retried.
  await input.fill('잠깐오류')
  await check.click()
  await expect(feedback).toHaveText('닉네임을 확인하지 못했어요. 다시 시도해 주세요.')
  await check.click()
  await expect(feedback).toHaveText('사용 가능한 닉네임이에요.')

  // A late answer for an older value never lands on the new input.
  await input.fill('느린이름')
  await check.click()
  await expect(feedback).toHaveText('닉네임 확인 중…')
  await input.fill('새이름')
  releaseSlow()
  await expect(feedback).toHaveText('중복 확인이 필요해요.')
  await page.waitForTimeout(300)
  await expect(feedback).toHaveText('중복 확인이 필요해요.')

  expect(checked).toEqual(['산책자', '온탑고수', '잠깐오류', '잠깐오류', '느린이름'])
})

test('onboarding submits without a check and shows the final server rejection on the nickname', async ({ page }) => {
  let availabilityRequests = 0
  await page.route('**/api/v1/users/nickname-availability?**', route => {
    availabilityRequests++
    return route.fulfill({ json: { nickname: '산책자', available: true } })
  })
  const onboarding: string[] = []
  await page.route('**/api/v1/users/onboarding', route => {
    const body = route.request().postDataJSON() as { nickname: string }
    onboarding.push(body.nickname)
    return route.fulfill({ status: 409, json: { code: 'USER_NICKNAME_ALREADY_EXISTS', message: 'taken' } })
  })
  await openOnboarding(page)
  const input = page.locator('#onboarding-nickname')
  const feedback = page.locator('#onboarding-feedback')
  const submit = page.getByRole('button', { name: '공원 입장하기' })

  await input.fill('산책자')
  await page.getByText('안내를 확인했고, 이 캐릭터로 시작할게요').click()
  await expect(submit).toBeEnabled()
  await expect(page.getByText('입장할 때 닉네임을 한 번 더 확인해요')).toBeVisible()
  await submit.click()
  await expect(feedback).toHaveText('이미 사용 중인 닉네임이에요.')
  await expect(input).toBeFocused()
  await expect(submit).toBeDisabled()
  expect(onboarding).toEqual(['산책자'])
  expect(availabilityRequests).toBe(0)

  // A passed check reserves nothing: the final save can still lose the race.
  await input.fill('산책왕')
  await page.getByRole('button', { name: '중복 확인' }).click()
  await expect(feedback).toHaveText('사용 가능한 닉네임이에요.')
  await submit.click()
  await expect(feedback).toHaveText('이미 사용 중인 닉네임이에요.')

  await page.unroute('**/api/v1/users/onboarding')
  await page.route('**/api/v1/users/onboarding', route => route.fulfill({ status: 400, json: { code: 'USER_RESERVED_NICKNAME', message: 'reserved' } }))
  await input.fill('산책대장')
  await submit.click()
  await expect(feedback).toHaveText('GM으로 시작하는 닉네임은 사용할 수 없어요.')

  // The server's forbidden-word rejection reads the same from a check and from the final save.
  const inappropriate = { status: 400, json: { code: 'USER_INAPPROPRIATE_NICKNAME', message: 'server message' } }
  await page.unroute('**/api/v1/users/nickname-availability?**')
  await page.route('**/api/v1/users/nickname-availability?**', route => route.fulfill(inappropriate))
  await input.fill('부적절1')
  await page.getByRole('button', { name: '중복 확인' }).click()
  await expect(feedback).toHaveText('사용할 수 없는 표현이 포함된 닉네임이에요.')
  await expect(submit).toBeDisabled()
  await page.unroute('**/api/v1/users/onboarding')
  await page.route('**/api/v1/users/onboarding', route => route.fulfill(inappropriate))
  await input.fill('부적절2')
  await submit.click()
  await expect(feedback).toHaveText('사용할 수 없는 표현이 포함된 닉네임이에요.')
  await expect(feedback).not.toContainText('server message')
})
