import { expect, test } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'

test('v5 준비 화면의 보상 부가 안내를 숨기고 이미지를 가운데 배치한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click()
  const guide = page.getByRole('region', { name: '붕어빵 굽기 시작', exact: true })
  await expect(guide).toBeVisible()
  await expect(guide).toContainText('컴플레인')
  await expect(guide).not.toContainText(/점당 1냥|한국 시간|운동 보상|점프맵과 합산/)
  await expect.poll(() => guide.locator('.bung-start-steps img').evaluateAll(images =>
    images.length === 3 && images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
  for (const size of [{ width: 1710, height: 920 }, { width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 800, height: 450 }]) {
    await page.setViewportSize(size)
    const geometry = await guide.locator('.bung-start-steps > li > img').evaluateAll(images => images.map(image => {
      const picture = image.getBoundingClientRect(), column = image.parentElement!.getBoundingClientRect()
      return { offset: Math.abs(picture.x + picture.width / 2 - column.x - column.width / 2), width: picture.width }
    }))
    for (const image of geometry) { expect(image.offset).toBeLessThanOrEqual(1); expect(image.width).toBeGreaterThan(60) }
    expect(await guide.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await expect(guide).toHaveCSS('scrollbar-width', 'none')
    await guide.focus(); await page.keyboard.press('Home')
    await expect(guide.getByRole('heading', { name: '붕어빵 굽기', exact: true })).toBeInViewport()
    await screenshot(page, `bungeoppang-ready-${size.width}`, 'disabled')
    if (await guide.evaluate(element => element.scrollHeight > element.clientHeight)) {
      await guide.hover(); await page.mouse.wheel(0, 1500)
      await expect.poll(() => guide.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    }
    await guide.focus(); await page.keyboard.press('End')
    await expect(guide.getByRole('button', { name: '시작', exact: true })).toBeInViewport()
    await expect(guide.getByRole('button', { name: 'ESC 나가기', exact: true })).toBeInViewport()
    if (size.height === 450) await screenshot(page, 'bungeoppang-ready-low-actions', 'disabled')
  }
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(guide).toHaveCount(0)
  expect(errors).toEqual([])
})
