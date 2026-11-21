import { chromium, expect as baseExpect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const expect=baseExpect.configure({timeout:15000})
const output = process.env.YUT_QA_OUTPUT || path.join(tmpdir(), 'ontop-yutnori-throw-qa')
await mkdir(output, { recursive: true })
const browser=await chromium.launch({channel:'msedge',headless:true})
const context=await browser.newContext({viewport:{width:1000,height:760}})
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
await page.route('**/yut-park.html',async route=>{const response=await route.fetch();let html=await response.text();html=html.replace('id="root"','id="yut-throw-test"').replace('/src/game/yutnori/parkPreview.tsx','/tests/fixtures/yutThrow3d.tsx');await route.fulfill({response,body:html})})
try{
await page.goto('http://127.0.0.1:5244/yut-park.html',{waitUntil:'commit',timeout:120000})
await expect(page.getByRole('heading',{name:'3D 윷 던지기 컴포넌트 검수'})).toBeVisible({timeout:180000})
await page.waitForTimeout(1200)
await page.getByRole('button',{name:'던지기 연출',exact:true}).click()
await expect(page.locator('.yut-throw-view')).toHaveAttribute('data-animating','true')
await page.waitForTimeout(450);await page.screenshot({path:output+'/throw-air.png'})
await page.getByLabel('입력 확인',{exact:true}).fill('연출 중에도 입력 가능')
await expect(page.locator('.yut-throw-view')).toHaveAttribute('data-animating','false')
await expect(page.locator('.yut-throw-view')).toHaveAttribute('data-mask','1')
await expect(page.locator('.yut-throw-caption')).toContainText('빽도 · 뒤로 1칸')
await page.waitForTimeout(400);await page.screenshot({path:output+'/backdo-3d.png'})
await page.getByLabel('윷면 조합',{exact:true}).selectOption('15');await page.getByRole('button',{name:'던지기 연출',exact:true}).click()
await expect(page.locator('.yut-throw-view')).toHaveAttribute('data-animating','true')
await page.waitForTimeout(300);await page.screenshot({path:output+'/throw-rotation.png'})
await expect(page.locator('.yut-throw-view')).toHaveAttribute('data-animating','false')
await expect(page.locator('.yut-throw-caption')).toContainText('윷')
await page.waitForTimeout(400)
await page.screenshot({path:output+'/all-flat.png'})
await page.emulateMedia({reducedMotion:'reduce'})
for(let mask=0;mask<16;mask++){await page.getByLabel('윷면 조합',{exact:true}).selectOption(String(mask));await page.getByRole('button',{name:'던지기 연출',exact:true}).click();await expect(page.locator('.yut-throw-view')).toHaveAttribute('data-mask',String(mask));await expect(page.locator('.yut-throw-view')).toHaveAttribute('data-animating','false')}
await page.getByLabel('윷면 조합',{exact:true}).selectOption('1');await page.getByRole('button',{name:'낙 연출',exact:true}).click()
await expect(page.locator('.yut-throw-caption')).toHaveAttribute('data-out','true')
await expect(page.locator('.yut-throw-caption')).not.toContainText('빽도')
for(const[width,height]of[[390,844],[1024,500]]){await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:'no-preference'});await page.getByLabel('윷면 조합',{exact:true}).selectOption('1');await page.getByRole('button',{name:'던지기 연출',exact:true}).click();await expect(page.locator('.yut-throw-view')).toHaveAttribute('data-expanded','true');const box=await page.locator('.yut-throw-stage').boundingBox();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(height);await page.waitForTimeout(300);await page.screenshot({path:output+'/air-'+width+'.png'});await expect(page.locator('.yut-throw-view')).toHaveAttribute('data-animating','false');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.waitForTimeout(120);await page.screenshot({path:output+'/backdo-'+width+'.png'});await expect(page.locator('.yut-throw-view')).toHaveAttribute('data-expanded','false')}
expect(errors).toEqual([])
await page.locator('canvas').evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext())
await expect(page.locator('.yut-throw-fallback .yut-stick-result i')).toHaveCount(4)
await expect(page.locator('.yut-throw-fallback [data-marked=true]')).toHaveText('−')
console.log(JSON.stringify({success:true,checks:['tumble','final-backdo','all-16-masks','out','reduced-motion','input-during-animation','small-and-low-layout','webgl-fallback'],errors}))
}catch(error){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});console.log((await page.locator('body').innerText()).slice(0,1800));console.log(errors);throw error}finally{await context.close();await browser.close()}
