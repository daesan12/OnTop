import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
const folder = process.env.SKEWER_CHEF_EVIDENCE
async function capture(page: Page, name: string) { if (folder) { await mkdir(folder, { recursive: true }); await page.screenshot({ path: path.join(folder, `${name}.png`) }) } }
async function open(page: Page, mode = 'pc') { await page.goto(`/skewer-chef.html?mode=${mode}`); await expect(page.locator('.chef-stage')).toHaveAttribute('data-ready', 'true', { timeout: 30000 }) }
async function cook(page: Page, recipe: string[]) {
 for (const id of recipe) {
  const button = page.locator('.chef-ingredient-hit').nth(['tomato','pepper','shrimp','beef','cheese','bacon'].indexOf(id))
  const key = (await button.getAttribute('aria-label'))!.split(' ')[0]
  await page.keyboard.press(key); await page.keyboard.press('Space')
 }
}
async function currentRecipe(page: Page) { return (await page.locator('.chef-world-order-hit[aria-pressed=true]').getAttribute('data-recipe'))!.split(',') }

test('큰 영수증과 중앙 HUD에서 R 제출·재료 재배치·전달대 용량을 확인한다', async ({ page }) => {
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
 await open(page)
 await expect(page.locator('.chef-heading,.chef-view-modes,.chef-round,.chef-controls,.chef-pass-status,.chef-current,.chef-wrap-summary')).toHaveCount(0)
 await expect(page.locator('[data-order]')).toHaveCount(2)
 await expect(page.locator('.chef-accessible-readout img').first()).toHaveAttribute('src', /order-[1-6]\.png/)
 const recipe = await currentRecipe(page)
 await cook(page, recipe.slice(0, 3)); await capture(page, '01-pc-receipts')
 await cook(page, recipe.slice(3)); const before = await page.locator('.chef-stage').getAttribute('data-pantry')
 await page.keyboard.press('Enter'); await expect(page.getByTestId('cooking-completed')).toHaveText('0개')
 await page.keyboard.press('r'); await expect(page.getByTestId('cooking-completed')).toHaveText('1개')
 await expect(page.getByTestId('chef-app')).toHaveAttribute('data-stack','')
 await expect(page.locator('.chef-stage')).not.toHaveAttribute('data-pantry',before!)
 await cook(page, await currentRecipe(page)); await page.keyboard.press('r'); await expect(page.getByTestId('cooking-completed')).toHaveText('2개')
 await capture(page, '02-pc-delivery')
 await cook(page, await currentRecipe(page)); const stack = await page.getByTestId('chef-app').getAttribute('data-stack')
 await page.keyboard.press('r'); await expect(page.getByRole('status')).toContainText('가득')
 await expect(page.getByTestId('chef-app')).toHaveAttribute('data-stack',stack!)
 await page.getByRole('button',{name:'요리사 이용 안내'}).click(); await page.getByRole('button',{name:'전달대 접시 비우기',exact:true}).click(); await page.getByRole('button',{name:'주방으로 돌아가기'}).click()
 await page.keyboard.press('r'); await expect(page.getByTestId('cooking-completed')).toHaveText('3개')
 expect(errors).toEqual([])
})

test('큐브 간격을 지키고 틀린 주문도 R로 실제 조립 모습 그대로 제출한다', async ({page}) => {
 await open(page)
 await cook(page,['cheese']); await page.keyboard.press('r'); await expect(page.getByRole('status')).toContainText('2~3개')
 await cook(page,['cheese']); await expect(page.getByTestId('chef-app')).toHaveAttribute('data-stack','cheese')
 await cook(page,['tomato','pepper','cheese']); await expect(page.getByTestId('chef-app')).toHaveAttribute('data-stack','cheese,tomato,pepper')
 await page.keyboard.press('Backspace'); await cook(page,['cheese']); await page.keyboard.press('r')
 await expect(page.getByTestId('cooking-completed')).toHaveText('1개')
 await expect(page.getByTestId('chef-app')).toHaveAttribute('data-stack','')
})

test('VR 미리보기와 PC 좁은 화면 및 안내창 입력 차단을 유지한다', async ({page}) => {
 await open(page,'vr'); await expect(page.getByTestId('chef-app')).toHaveAttribute('data-xr','false')
 await expect(page.locator('.chef-stage')).toHaveAttribute('data-order-image-count','2')
 await expect(page.locator('.chef-view-modes,.chef-hall-demo,.chef-heading')).toHaveCount(0)
 await expect(page.locator('.chef-enter-vr')).toHaveText('VR 연결 필요')
 await open(page,'pc')
 await page.getByRole('button',{name:'요리사 이용 안내'}).click(); await page.getByRole('dialog').focus()
 await page.keyboard.press('1'); await page.keyboard.press('Space'); await page.keyboard.press('r')
 await expect(page.getByTestId('chef-app')).toHaveAttribute('data-stack','')
 await page.getByRole('button',{name:'주방으로 돌아가기'}).click()
 for(const [width,height] of [[1366,768],[900,600],[390,844]]) {
  await page.setViewportSize({width,height});await page.waitForTimeout(400)
  for(const selector of ['.chef-world-order-hit','.chef-pc-help']) {
   const rect=(await page.locator(selector).first().boundingBox())!;expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(width+1);expect(rect.y+rect.height).toBeLessThanOrEqual(height)
  }
  await capture(page, `pc-${width}x${height}`)
 }
})

test('VR 공간의 끝 재료와 전달대 접시를 가리켜 빼기와 제출을 한다', async ({page}) => {
 await open(page,'vr')
 const stage=page.locator('.chef-stage'), app=page.getByTestId('chef-app')
 const pointAt=async (target:string) => {
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
  const point=await stage.evaluate((el,target)=>{
   const box=el.getBoundingClientRect(), css=getComputedStyle(el)
   return {x:box.x+parseFloat(css.getPropertyValue(`--chef-${target}-x`))*box.width/100,y:box.y+parseFloat(css.getPropertyValue(`--chef-${target}-y`))*box.height/100}
  },target)
  await page.mouse.move(point.x,point.y)
  return point
 }
 await cook(page,['tomato','cheese','pepper'])
 await pointAt('undo'); await expect(stage).toHaveAttribute('data-focused-action','unthread')
 await capture(page,'vr-context-undo'); await page.mouse.down(); await page.mouse.up()
 await expect(app).toHaveAttribute('data-stack','tomato,cheese')
 await cook(page,['pepper','cheese','shrimp','beef'])
  await page.mouse.move(10,10); await expect(stage).toHaveAttribute('data-focused-action','')
  await capture(page,'vr-workbench-overview')
 await pointAt('submit'); await expect(stage).toHaveAttribute('data-focused-action','submit')
 await capture(page,'vr-context-submit'); await page.mouse.down(); await page.mouse.up()
 await expect(stage).toHaveAttribute('data-completed','1'); await expect(stage).toHaveAttribute('data-pass-count','1')
 await expect(app).toHaveAttribute('data-stack','')
 await page.mouse.move(10,10); await expect(stage).toHaveAttribute('data-focused-action','')
 await capture(page,'vr-counter-delivered')
  await cook(page,['tomato']); await pointAt('submit'); await page.mouse.down(); await page.mouse.up()
  await expect(stage).toHaveAttribute('data-pass-count','2')
  await cook(page,['tomato']); await pointAt('submit'); await page.mouse.down(); await page.mouse.up()
  await expect(stage).toHaveAttribute('data-completed','2'); await expect(app).toHaveAttribute('data-stack','tomato')
  await capture(page,'vr-counter-full')
})

test('독립 주방은 홀 동선 시연을 명시하고 서빙 캐릭터 위치를 갱신한다', async ({page}) => {
 await open(page,'vr')
 const stage=page.locator('.chef-stage')
 await expect(stage).toHaveAttribute('data-hall-source','demo')
 await expect(page.locator('.chef-hall-demo')).toHaveCount(0)
 await page.getByRole('button',{name:'요리사 이용 안내'}).click()
 await expect(page.getByRole('dialog')).toContainText('실제 동료와 연결되지 않았어요')
 await page.getByRole('button',{name:'주방으로 돌아가기'}).click()
 await expect(stage).not.toHaveAttribute('data-hall-server-position','null')
 const position=await stage.getAttribute('data-hall-server-position')
 await expect(stage).not.toHaveAttribute('data-hall-server-position',position!)
 await page.waitForTimeout(1500)
 await capture(page,'open-hall-moving-server')
})


test('제출 성공 때 주문표를 교체하고 움직임 줄이기에서는 즉시 갱신한다', async ({page}) => {
 await open(page)
 const stage=page.locator('.chef-stage'), receipts=page.locator('.chef-world-order-hit')
 await receipts.nth(1).click();await expect(receipts.nth(1)).toHaveAttribute('aria-pressed','true')
 const submitted=await receipts.nth(1).getAttribute('data-order')
 await cook(page,await currentRecipe(page));await page.keyboard.press('r')
 await expect(stage).toHaveAttribute('data-order-transition','true')
 await expect(page.locator(`[data-order="${submitted}"]`)).toHaveCount(0)
 await expect(stage).toHaveAttribute('data-order-transition','false')
 await expect(receipts).toHaveCount(2)
 await page.emulateMedia({reducedMotion:'reduce'})
 await cook(page,await currentRecipe(page));await page.keyboard.press('r')
 await expect(page.getByTestId('cooking-completed')).toHaveText('2개')
 await expect(stage).toHaveAttribute('data-order-transition','false')
})
