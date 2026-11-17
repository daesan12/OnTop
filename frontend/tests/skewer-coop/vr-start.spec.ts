import { expect, test, type Page } from '@playwright/test'

async function command(page: Page, name: string) {
  return page.evaluate(name => Reflect.get(window, 'vrPauseQA')[name](), name)
}

async function prepare(page: Page) {
  await page.goto('/tests/skewer-coop/fixtures/vr-pause.html')
  await expect(page).toHaveTitle('꼬치왕 VR 일시정지 검수')
  await page.getByRole('button', { name: 'VR로 요리하기', exact: true }).click()
  await expect(page.locator('.chef-stage canvas')).toBeVisible()
}

test('로비에서 헤드셋을 바로 연결하고 VR 조리대에서 꼬치를 들어도 길이와 끝 고리가 유지된다', async ({ page }) => {
  await prepare(page)
  const ready = page.getByRole('button', { name: '준비 완료', exact: true })
  await expect(ready).toBeDisabled()
  expect(await command(page, 'snapshot')).toMatchObject({ requested: 0 })
  await page.getByRole('button', { name: '헤드셋 연결하기', exact: true }).click()
  await expect(page.getByTestId('chef-app')).toHaveAttribute('data-xr', 'true')
  await expect(ready).toBeEnabled()
  expect(await command(page, 'snapshot')).toMatchObject({ requested: 1, requestedWithActivation: true, protected: true })
  await command(page, 'start')
  const assembly = await command(page, 'measureAssembly')
  expect(assembly).toMatchObject({ held: true, returned: true, markerOccluded: false })
  expect(assembly.counterHeight).toBeCloseTo(.95, 2)
  expect(assembly.restingLength).toBeLessThan(.65)
  expect(assembly.heldLength).toBeCloseTo(assembly.restingLength, 5)
  expect(assembly.markerRenderOrder).toBeGreaterThan(0)
})

for (const target of ['chef-pass-sign', 'chef-submit-hint']) test(`협동 VR에서 꼬치를 쥔 손으로 ${target}에 접시를 제출한다`, async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: '헤드셋 연결하기', exact: true }).click()
  const chef = page.getByTestId('chef-app')
  await expect(chef).toHaveAttribute('data-xr', 'true')
  await command(page, 'start')
  await command(page, 'finishSkewer')
  await expect(chef.locator('.chef-submit')).toHaveAttribute('data-ready', 'true')
  const gesture = await page.evaluate(targetName => Reflect.get(window, 'vrPauseQA').submitHolding(targetName), target)
  expect(gesture).toEqual({ held: true, hintVisible: true })
  await expect(chef.locator('.chef-stage')).toHaveAttribute('data-pass-count', '1')
  await expect(chef).toHaveAttribute('data-stack', '')
  expect((await command(page, 'snapshot')).calls.filter((action: string) => action === 'SUBMIT')).toHaveLength(1)
})

for (const failure of ['failProtection', 'rejectSession']) test(`${failure} 실패 후 재연결하고 정상 종료해도 이전 오류가 남지 않는다`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await prepare(page)
  await command(page, failure)
  await page.getByRole('button', { name: '헤드셋 연결하기', exact: true }).click()

  const alert = page.locator('.chef-vr-start-error[role="alert"]')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText(failure === 'failProtection' ? 'VR 플레이 보호' : 'VR 접근 권한')
  await expect(page.getByTestId('skewer-coop')).toHaveAttribute('data-phase', 'WAITING')
  await expect(page.getByTestId('chef-app')).toHaveAttribute('data-xr', 'false')
  await expect(page.getByRole('button', { name: 'VR 시작', exact: true })).toBeEnabled()
  expect(await command(page, 'snapshot')).toMatchObject({ requested: 1, protected: false, protectionReleased: 0 })

  for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const box = await alert.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(height)
    if (process.env.SKEWER_FEEDBACK_EVIDENCE)
      await page.screenshot({ path: `${process.env.SKEWER_FEEDBACK_EVIDENCE}/vr-start-${failure}-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'VR 시작', exact: true }).click()
  await expect(page.getByTestId('chef-app')).toHaveAttribute('data-xr', 'true')
  await expect(alert).toHaveCount(0)
  expect(await command(page, 'snapshot')).toMatchObject({ requested: 2, protected: true, protectionReleased: 0, modalCalls: 0 })

  // 대기실 종료는 ChefPage를 유지하므로 언마운트에 기대지 않고 오류 정리를 검증한다.
  await command(page, 'endSession')
  await expect(page.getByTestId('chef-app')).toHaveAttribute('data-xr', 'false')
  await expect(page.getByRole('dialog', { name: '역할 선택과 준비', exact: true })).toBeVisible()
  await expect(page.getByTestId('skewer-coop')).toHaveAttribute('data-phase', 'WAITING')
  expect(await command(page, 'snapshot')).toMatchObject({ protected: false, protectionReleased: 1 })
  await page.getByRole('button', { name: '주방 화면 미리 보기', exact: true }).click()
  await expect(alert).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'VR 시작', exact: true })).toBeEnabled()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
