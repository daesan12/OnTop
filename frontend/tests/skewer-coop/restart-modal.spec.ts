import { expect, test } from '@playwright/test'

const errors = new WeakMap<import('@playwright/test').Page, string[]>()
test.beforeEach(async ({ page }) => {
  const issues: string[] = []
  errors.set(page, issues)
  page.on('pageerror', error => issues.push(error.message))
  page.on('console', message => { if (message.type() === 'error') issues.push(message.text()) })
  // Test the real host and dialog with controllable session callbacks, without Quest/GPU dependencies.
  await page.route(/\/src\/features\/skewer\/chef\/ChefPage\.tsx(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript', body: "export {default} from '/tests/skewer-coop/fixtures/RestartChef.tsx'",
  }))
  await page.route(/\/src\/features\/skewer\/serviceHall\/ServiceHallPage\.tsx(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript', body: 'export default function Hall() { return null }',
  }))
  await page.addInitScript(() => {
    const show = HTMLDialogElement.prototype.showModal
    HTMLDialogElement.prototype.showModal = function () {
      this.dataset.modalCalls = String(Number(this.dataset.modalCalls ?? 0) + 1)
      show.call(this)
    }
  })
})
test.afterEach(async ({ page }) => {
  await expect(page).toHaveTitle('꼬치왕 재시작 XR 모달 검수')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors.get(page)).toEqual([])
})
const modal = (page: import('@playwright/test').Page) => page.locator('.coop-restart-dialog')
const open = async (page: import('@playwright/test').Page, role = 'chef') => {
  await page.goto('/tests/skewer-coop/fixtures/restart-modal.html?role=' + role)
  await expect(page.getByTestId('skewer-coop')).toHaveAttribute('data-role', role)
  if (role === 'chef') await expect(page.getByRole('region', { name: '모의 요리사' })).toBeVisible()
}

test('PC와 서빙 담당은 기존 DOM 모달에서 거절·동의할 수 있다', async ({ page }) => {
  for (const role of ['chef', 'server']) {
    await open(page, role)
    await page.getByRole('button', { name: '친구 재시작 요청', exact: true }).click()
    await expect(modal(page)).toBeVisible()
    await expect(modal(page)).toHaveAttribute('data-modal-calls', '1')
    await page.getByRole('button', { name: '기존 경기 계속', exact: true }).click()
    await expect(modal(page)).not.toBeVisible()
    await expect(page.getByLabel('재시작 응답')).toHaveText('거절 전송')
    await page.getByRole('button', { name: '친구 재시작 요청', exact: true }).click()
    await page.getByRole('button', { name: '동의하고 다시 시작', exact: true }).click()
    await expect(page.getByLabel('재시작 응답')).toHaveText('동의 전송')
  }
})

test('VR 요청은 showModal 없이 3D 동의·거절 경로로 응답한다', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: '모의 VR 연결', exact: true }).click()
  await page.getByRole('button', { name: '친구 재시작 요청', exact: true }).click()
  await expect(modal(page)).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('vr-without-dom-modal.png') })
  await page.getByRole('button', { name: '3D 동의 선택', exact: true }).click()
  await expect(page.getByLabel('재시작 응답')).toHaveText('동의 전송')
  await page.getByRole('button', { name: '친구 재시작 요청', exact: true }).click()
  await page.getByRole('button', { name: '3D 거절 선택', exact: true }).click()
  await expect(page.getByLabel('재시작 응답')).toHaveText('거절 전송')
  await expect(modal(page)).toHaveCount(0)
})

test('요청 도중 VR 진입은 열린 모달을 제거하고 종료하면 남은 요청을 복원한다', async ({ page }) => {
  await open(page)
  await page.clock.install()
  await page.getByRole('button', { name: '모의 VR 연결 예약', exact: true }).click()
  await page.getByRole('button', { name: '친구 재시작 요청', exact: true }).click()
  await expect(modal(page)).toBeVisible()
  await page.clock.fastForward(3000)
  await expect(modal(page)).toHaveCount(0)
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  await page.getByRole('button', { name: '모의 VR 종료', exact: true }).click()
  // The selected mode is still VR; only the actual session state controls modal ownership.
  await expect(page.getByText('선택 모드 vr / 실제 세션 해제')).toBeVisible()
  await expect(modal(page)).toBeVisible()
  await expect(modal(page)).toHaveAttribute('data-modal-calls', '1')
  await page.screenshot({ path: test.info().outputPath('pc-request-restored.png') })
  await page.getByRole('button', { name: '기존 경기 계속', exact: true }).click()
  await expect(page.getByLabel('재시작 응답')).toHaveText('거절 전송')
})

test('VR에서 만료된 요청은 세션 종료 후 다시 열리지 않는다', async ({ page }) => {
  await open(page)
  await page.clock.install()
  await page.getByRole('button', { name: '모의 VR 연결', exact: true }).click()
  await page.getByRole('button', { name: '친구 재시작 요청', exact: true }).click()
  await page.clock.fastForward(15000)
  await page.getByRole('button', { name: '모의 VR 종료', exact: true }).click()
  await expect(modal(page)).not.toBeVisible()
  await expect(modal(page)).not.toHaveAttribute('data-modal-calls')
  await expect(page.getByLabel('재시작 응답')).toHaveText('응답 없음')
})

test('요청자도 VR에서는 DOM 대기창 없이 기다리고 종료 후 대기창을 복원한다', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: '모의 VR 연결', exact: true }).click()
  await page.getByRole('button', { name: '내 재시작 요청', exact: true }).click()
  await expect(modal(page)).toHaveCount(0)
  await page.getByRole('button', { name: '모의 VR 종료', exact: true }).click()
  await expect(modal(page)).toBeVisible()
  await expect(modal(page).getByRole('heading', { name: '친구의 응답을 기다려요' })).toBeVisible()
  await expect(modal(page).getByRole('button')).toHaveCount(0)
})
