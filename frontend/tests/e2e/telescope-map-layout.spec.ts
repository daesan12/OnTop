import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { TELESCOPES } from '../../src/config'
import { telescopeAnchors } from '../../src/features/telescopes/anchors'

const viewports = [
  { width: 1920, height: 1080 },
  { width: 775, height: 693 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]

test('telescope keeps a centered circular lens clear of controls at every viewport', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const id = TELESCOPES[0]!.id
  await fixture(page, { manualMovement: true, position: telescopeAnchors(id).use })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await page.locator('canvas').focus()
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/world/roamingCamera.ts' as string)).canControlRoamingCamera())).toBe(true)
  await page.evaluate(async id => (await import('/src/features/telescopes/controller.ts' as string)).enterTelescope(id), id)
  const panel = page.getByRole('complementary', { name: '전망 망원경', exact: true })
  await expect(panel).toBeVisible()
  await expect(page.locator('.park-hud')).toBeHidden()
  await expect(page.getByRole('button', { name: '공원 지도', exact: true })).toBeHidden()
  await expect(page.locator('.manual-launcher')).toBeHidden()
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/features/telescopes/state.ts' as string)).useTelescopeState.getState().pending)).toBe(false)

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    const bounds = await page.evaluate(() => {
      const finder = document.querySelector('.telescope-viewfinder')!
      const lens = getComputedStyle(finder, '::before')
      const rect = finder.getBoundingClientRect()
      const panel = document.querySelector('.telescope-panel')!.getBoundingClientRect()
      return { width: parseFloat(lens.width), height: parseFloat(lens.height), radius: lens.borderRadius,
        centerX: rect.left + parseFloat(lens.left), centerY: rect.top + parseFloat(lens.top),
        lensBottom: rect.top + parseFloat(lens.top) + parseFloat(lens.height) / 2,
        panelTop: panel.top, panelBottom: panel.bottom, panelLeft: panel.left, panelRight: panel.right }
    })
    expect(bounds.width).toBeGreaterThan(0)
    expect(bounds.width).toBeCloseTo(bounds.height, 0)
    expect(bounds.radius).toBe('50%')
    expect(bounds.centerX).toBeCloseTo(viewport.width / 2, 0)
    expect(bounds.centerY).toBeCloseTo(viewport.height / 2, 0)
    expect(bounds.panelTop - bounds.lensBottom).toBeGreaterThanOrEqual(15)
    expect(bounds.panelBottom).toBeLessThanOrEqual(viewport.height)
    expect(bounds.panelLeft).toBeGreaterThanOrEqual(0)
    expect(bounds.panelRight).toBeLessThanOrEqual(viewport.width)
    await screenshot(page, `telescope-clear-lens-${viewport.width}x${viewport.height}`)
  }

  const zoom = panel.getByLabel('확대 배율')
  const beforeZoom = await zoom.textContent()
  await page.mouse.move(422, 195)
  await page.mouse.wheel(0, -100)
  await expect(zoom).not.toHaveText(beforeZoom!)
  const yaw = () => page.evaluate(async () => (await import('/src/features/telescopeView.ts' as string)).telescopeView.yaw as number)
  const beforeYaw = await yaw()
  await page.mouse.down()
  await page.mouse.move(480, 195, { steps: 4 })
  await page.mouse.up()
  await expect.poll(yaw).not.toBe(beforeYaw)
  await panel.getByRole('button', { name: '망원경에서 나가기' }).click()
  await expect(panel).toBeHidden()
  await expect(page.locator('.telescope-overlay')).toHaveCount(0)
  await expect(page.locator('.park-hud')).toBeVisible()
  await expect(page.getByRole('button', { name: '공원 지도', exact: true })).toBeVisible()
  await expect(page.locator('.manual-launcher')).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('map hides its scrollbar and scrolls with the wheel over the map and location list', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await fixture(page, { manualMovement: true })
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await page.getByRole('button', { name: '공원 지도', exact: true }).click()
  const map = page.getByRole('dialog', { name: '공원 지도창', exact: true })
  await expect(map).toBeVisible()
  const scrollTop = () => map.evaluate(element => element.scrollTop)
  const camera = await page.evaluate(async () => ({ ...(await import('/src/world/input.ts' as string)).viewControls }))

  for (const viewport of viewports.slice(1)) {
    await page.setViewportSize(viewport)
    await map.evaluate(element => { element.scrollTop = 0 })
    expect(await map.evaluate(element => getComputedStyle(element).scrollbarWidth)).toBe('none')
    expect(await map.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0)
    expect(await map.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    await map.locator('.park-map-heading').hover()
    await page.mouse.wheel(0, 650)
    await expect.poll(scrollTop).toBeGreaterThan(0)
    await page.mouse.wheel(0, -2000)
    await expect.poll(scrollTop).toBe(0)
    await map.locator('.park-map-figure > svg').hover()
    await page.mouse.wheel(0, 650)
    await expect.poll(scrollTop).toBeGreaterThan(0)
    const lastPlace = map.getByRole('button', { name: '11. 중앙 석탑', exact: true })
    await lastPlace.focus()
    await expect(lastPlace).toBeInViewport()
    await lastPlace.hover()
    const fromList = await scrollTop()
    await page.mouse.wheel(0, -120)
    await expect.poll(scrollTop).toBeLessThan(fromList)
    await screenshot(page, `map-wheel-scroll-${viewport.width}x${viewport.height}`)
  }

  expect(await page.evaluate(async () => ({ ...(await import('/src/world/input.ts' as string)).viewControls }))).toEqual(camera)
  await page.keyboard.press('Escape')
  await expect(map).toBeHidden()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
