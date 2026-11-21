import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const output = process.env.YUT_QA_OUTPUT || path.join(tmpdir(), 'ontop-yutnori-3d-qa')
await mkdir(output, { recursive: true })
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:920,height:920}})
page.setDefaultTimeout(60000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
await page.route('**/yut-park.html',async route=>{const response=await route.fetch();let html=await response.text();html=html.replace('id="root"','id="yut-board-3d-test"').replace('/src/game/yutnori/parkPreview.tsx','/tests/fixtures/yutBoard3dInteraction.tsx');await route.fulfill({response,body:html})})
try{
await page.goto('http://127.0.0.1:5244/yut-park.html',{waitUntil:'commit',timeout:180000})
await expect(page.locator('.yut-board-3d')).toHaveAttribute('data-ready','true',{timeout:180000})
await expect(page.locator('[data-node]')).toHaveCount(29)
await page.waitForTimeout(1000)
await page.screenshot({path:path.join(output, 'board-3d-fixture.png')})
await page.locator('.yut-3d-piece-hit.yut-team-1').click()
await expect(page.locator('#yut-board-3d-test')).toHaveAttribute('data-action','MOVE')
await expect(page.locator('#yut-board-3d-test')).toHaveAttribute('data-destination','3')
await page.locator('.yut-3d-piece-hit.yut-team-0').focus();await page.keyboard.press('Enter')
await expect(page.locator('#yut-board-3d-test')).toHaveAttribute('data-action','SELECT')
await page.locator('[data-node="9"]').click()
await expect(page.locator('#yut-board-3d-test')).toHaveAttribute('data-action','PING')
for(const [width,height]of [[390,844],[1024,500]]){await page.setViewportSize({width,height});await page.waitForTimeout(600);await expect(page.locator('[data-node="29"]')).toBeInViewport();await page.screenshot({path:path.join(output, `fixture-${width}.png`)})}
if(errors.length)throw Error(JSON.stringify(errors))
await page.locator('canvas').evaluate(canvas=>canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext())
await expect(page.locator('.yut-board-fallback svg circle')).toHaveCount(29)
await page.getByRole('button',{name:'10번 칸 핑 보내기',exact:true}).click()
await expect(page.locator('#yut-board-3d-test')).toHaveAttribute('data-action','PING')
await expect(page.locator('#yut-board-3d-test')).toHaveAttribute('data-destination','10')
console.log(JSON.stringify({pass:true,nodes:29,checks:['occupied destination','keyboard selection','ping','responsive projection','WebGL fallback'],expectedContextLossErrors:errors}))
}catch(e){await page.screenshot({path:path.join(output, 'fixture-failure.png')});console.log((await page.locator('body').innerText()).slice(0,2000));console.log(errors);throw e}finally{await browser.close()}
