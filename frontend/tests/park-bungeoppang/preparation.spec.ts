import { expect, test } from '@playwright/test'
import { parkFixture } from '../park-integration/fixture'
import { screenshot } from '../e2e/contractFixture'

test('준비 화면의 세 이미지 전체와 시작 버튼을 다양한 화면에서 볼 수 있다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const server = await parkFixture(page)
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  const stand = await page.evaluate(async () => {
    const { bungeoppangService } = await import('/src/features/bungeoppang/service.ts' as string)
    const { createV5PreviewService } = await import('/src/features/bungeoppang/serviceV5Preview.ts' as string)
    Object.assign(bungeoppangService, createV5PreviewService(() => .5))
    const { bungeoppangView: view } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string)
    return { x: view.standX, y: .8, z: view.standZ, yaw: Math.PI }
  })
  server.place(stand)
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click()
  const guide = page.getByRole('region', { name: '붕어빵 굽기 시작', exact: true })
  await expect(guide).toBeVisible()
  for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    const images = guide.locator('.bung-start-steps > li > img')
    await expect(images).toHaveCount(3)
    await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => {
      const image = node as HTMLImageElement, style = getComputedStyle(image)
      return image.complete && image.naturalWidth > 0 && style.objectFit === 'contain'
        && Math.abs(image.clientWidth / image.clientHeight - image.naturalWidth / image.naturalHeight) < .06
    }))).toBe(true)
    expect(await guide.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    const start = guide.getByRole('button', { name: '시작', exact: true })
    await start.scrollIntoViewIfNeeded()
    await expect(start).toBeInViewport()
    await screenshot(page, `bungeoppang-qa-preparation-${size.width}`)
  }
  expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
