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
  const columns = guide.locator('.bung-start-controls > div')
  await expect(columns).toHaveCount(3)
  await expect(columns.nth(0)).toContainText('틀·재료 선택')
  await expect(columns.nth(0)).toContainText('반죽·소 선택')
  await expect(columns.nth(1)).toContainText('손님에게 전달')
  await expect(columns.nth(2)).toContainText('점수·랭킹')
  await expect(columns.nth(2)).toContainText('피자·초코 보너스 +30%')
  await expect(columns.nth(2)).toContainText('컴플레인 −5점')
  await expect(columns.nth(2)).toContainText('최고 점수로 랭킹에 도전해요!')
  await expect(guide.getByLabel('붕어빵 콤보 안내')).toContainText('3콤보 ×1.2 · 6콤보 ×1.5')
  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 800, height: 600 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    const images = guide.locator('.bung-start-steps > li > img')
    await expect(images).toHaveCount(3)
    await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => {
      const image = node as HTMLImageElement, style = getComputedStyle(image)
      return image.complete && image.naturalWidth > 0 && style.objectFit === 'contain'
        && Math.abs(image.clientWidth / image.clientHeight - image.naturalWidth / image.naturalHeight) < .06
    }))).toBe(true)
    expect(await guide.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await screenshot(page, `bungeoppang-qa-preparation-${size.width}`)
    const height = await guide.evaluate(node => ({ content: node.scrollHeight, panel: node.clientHeight }))
    expect(height.content, `${size.width}×${size.height} 준비 화면 높이`).toBeLessThanOrEqual(height.panel)
    await expect(guide.getByLabel('붕어빵 콤보 안내')).toBeInViewport({ ratio: 1 })
    await expect(guide.getByLabel('점수와 랭킹 안내')).toBeInViewport({ ratio: 1 })
    const start = guide.getByRole('button', { name: '시작', exact: true })
    await expect(start).toBeInViewport()
    await expect(guide.getByRole('button', { name: /나가기/ })).toBeInViewport()
    await screenshot(page, `bungeoppang-qa-preparation-${size.width}`)
  }
  await guide.getByRole('button', { name: '시작', exact: true }).click()
  await expect(guide).toBeHidden()
  await expect(page.getByRole('timer', { name: '남은 시간', exact: true })).toBeVisible({ timeout: 15000 })
  expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

test('이미지를 늦게 받아도 준비 패널의 첫 크기가 바뀌지 않는다', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/art/bungeoppang/start-step-*.webp', async route => { await gate; await route.continue() })
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
  const before = await guide.boundingBox()
  const images = guide.locator('.bung-start-steps > li > img')
  expect(await images.evaluateAll(nodes => nodes.every(node => !(node as HTMLImageElement).complete))).toBe(true)
  await page.waitForTimeout(350)
  release()
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => (node as HTMLImageElement).naturalWidth === 800))).toBe(true)
  const after = await guide.boundingBox()
  expect(Math.abs(after!.width - before!.width)).toBeLessThan(1)
  expect(Math.abs(after!.height - before!.height)).toBeLessThan(2)
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1)
})
