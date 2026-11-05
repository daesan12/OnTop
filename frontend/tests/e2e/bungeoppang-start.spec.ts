import { expect, test, type Page } from '@playwright/test'
import { bungeoppangFixture } from './bungeoppangFixture'
import { screenshot } from './contractFixture'
const guide = (page: Page) => page.getByRole('region', { name: '붕어빵 굽기 시작', exact: true })
async function open(page: Page) {
 await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
 await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click()
 await expect(guide(page)).toBeVisible()
 await expect.poll(() => guide(page).locator('.bung-start-steps img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
}
test('reference start guide renders three illustrated steps at desktop and mobile sizes and starts the real session request', async ({ page }) => {
 const errors: string[] = []
 page.on('pageerror', error => errors.push(error.message)); page.on('console', m => { if(m.type() === 'error') errors.push(m.text()) })
 const server = await bungeoppangFixture(page)
 await page.setViewportSize({ width:1710, height:920 }); await open(page)
 await expect(guide(page).getByRole('heading', { name:'붕어빵 굽기', exact:true })).toBeVisible()
 await expect(guide(page).getByRole('list', {name:'붕어빵 굽는 방법'}).getByRole('listitem')).toHaveCount(3)
 await expect(guide(page).getByRole('heading', {name:'익는 상태를 보고',exact:true})).toBeVisible()
 await expect(guide(page).getByRole('heading', {name:'클릭해서 뒤집기',exact:true})).toBeVisible()
 await expect(guide(page).getByRole('heading', {name:'양쪽이 익으면 완성!',exact:true})).toBeVisible()
 await expect(guide(page)).not.toContainText('서버가 발급한 불 세기로')
 await expect(guide(page)).not.toContainText(/점당 1냥|한국 시간|운동 보상|점프맵과 합산/)
 await expect(page.getByRole('button', {name:'F1 조작 안내',exact:true})).toHaveCount(0)
 await expect(guide(page).getByRole('button', {name:'시작',exact:true})).toBeEnabled()
 await screenshot(page,'bungeoppang-start-reference-desktop')
 for(const size of [{width:1280,height:720},{width:390,height:844},{width:800,height:450}]) {
  await page.setViewportSize(size)
  const box=await guide(page).boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x+box!.width).toBeLessThanOrEqual(size.width)
  expect(box!.y+box!.height).toBeLessThanOrEqual(size.height)
  expect(await guide(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await expect(guide(page)).toHaveCSS('scrollbar-width','none')
  const centers = await guide(page).locator('.bung-start-steps > li > img').evaluateAll(images => images.map(image => {
   const picture=image.getBoundingClientRect(), column=image.parentElement!.getBoundingClientRect()
   return { offset:Math.abs(picture.x+picture.width/2-column.x-column.width/2), width:picture.width }
  }))
  for(const image of centers) { expect(image.offset).toBeLessThanOrEqual(1); expect(image.width).toBeGreaterThan(60) }
  await guide(page).focus(); await page.keyboard.press('Home')
  await guide(page).getByRole('heading', {name:'붕어빵 굽기',exact:true}).scrollIntoViewIfNeeded()
  await screenshot(page,`bungeoppang-start-${size.width}`)
  await guide(page).getByRole('button', {name:'시작',exact:true}).scrollIntoViewIfNeeded()
  await expect(guide(page).getByRole('button', {name:'시작',exact:true})).toBeInViewport()
  await guide(page).getByRole('button', {name:/나가기/}).scrollIntoViewIfNeeded()
  await expect(guide(page).getByRole('button', {name:/나가기/})).toBeInViewport()
 }
 const start=guide(page).getByRole('button', {name:'시작',exact:true})
 await start.scrollIntoViewIfNeeded(); await expect(start).toBeInViewport()
 await screenshot(page,'bungeoppang-start-mobile-actions')
 server.delayNextStartResponse(500)
 await start.click()
 await expect(guide(page).getByRole('button', {name:'준비 중…',exact:true})).toBeDisabled()
 await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', /countdown|play/, {timeout:10000})
 expect(server.requests.filter(r => r.method === 'POST' && r.path.endsWith('/sessions'))).toHaveLength(1)
 expect(errors).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
test('status retry and Escape remain available in the new start guide', async ({page}) => {
 const server=await bungeoppangFixture(page); server.failStatus(true)
 await open(page)
 await expect(guide(page).getByRole('alert')).toBeVisible()
 await expect(guide(page).getByRole('button', {name:'시작',exact:true})).toBeDisabled()
 await screenshot(page,'bungeoppang-start-status-error')
 server.failStatus(false)
 await guide(page).getByRole('button', {name:'상태 다시 확인',exact:true}).click()
 await expect(guide(page).getByRole('button', {name:'시작',exact:true})).toBeEnabled()
 await page.keyboard.press('Escape'); await expect(guide(page)).toHaveCount(0)
 await expect(page.locator('.bung-root')).toHaveCount(0)
})
