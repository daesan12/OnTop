import {test,expect} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('fountain rim covers the sky gap and stairs render while the camera moves',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.setViewportSize({width:1600,height:1000});await page.goto('/layout-preview.html')
 await expect(page.getByText('배치 준비 완료',{exact:true})).toBeVisible({timeout:90000})
 const dir=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'ontop-ground-qa');await fs.mkdir(dir,{recursive:true})
 await page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:/^06/}).click()
 await page.waitForTimeout(300)
 // These two formerly blue pixels looked below the open paving edge into the sky.
 for(const point of [[606,808],[700,828]]){
  const hits=await page.evaluate(async([x,y])=>(await import('/tests/layout-e2e/groundSurfaceProbe.ts' as string)).fountainSurfaceRayAt(x,y),point)
  expect(hits[0]?.name).toBe('layout-original-fountain-terrain')
 }
 await page.screenshot({path:path.join(dir,'fountain-after.png')})
 for(const [no,name] of [['03','pagoda'],['01','pavilion']]){
  await page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:new RegExp('^'+no)}).click()
  await page.waitForTimeout(300)
  await page.screenshot({path:path.join(dir,name+'-after.png')})
  await page.mouse.move(900,550);await page.mouse.down();await page.mouse.move(920,555,{steps:8});await page.mouse.up()
  await page.waitForTimeout(300);await page.screenshot({path:path.join(dir,name+'-rotated.png')})
 }
 expect(errors).toEqual([])
})
