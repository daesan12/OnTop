import {test,expect} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('updated map details render without surface textures or application network requests',async({page})=>{
 const errors:string[]=[],unexpected:string[]=[]
 page.on('pageerror',e=>errors.push(e.message))
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 page.on('request',r=>{if(/\/api\/|\/art\/materials\//.test(r.url())||['image','media'].includes(r.resourceType())&&/advertisements|adv_pickus|adv_dero|dero-poster|ontap-film/.test(r.url()))unexpected.push(r.url())})
 await page.goto('/layout-preview.html')
 await expect(page.getByText('배치 준비 완료',{exact:true})).toBeVisible({timeout:90000})
 const detail=()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).detailProbe())
 const current=await detail()
 expect(current.boardExists).toBe(true);expect(current.noteIds).toEqual([])
 expect(current.advertisements).toEqual([]);expect(current.backgroundBuildings).toHaveLength(6)
 await expect(page.locator('video')).toHaveCount(0)
 await expect(page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:/광고|에어벌룬/})).toHaveCount(0)
 expect(current.paving).toEqual(expect.arrayContaining(['layout-smooth-paths','layout-original-fountain-terrain','layout-gate-stone-promenade']))
 expect(current.paving.length).toBeGreaterThanOrEqual(5)
 expect(current.pavingTextures).toEqual([])
 const dir=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'ontop-map-details');await fs.mkdir(dir,{recursive:true})
 const list=page.getByLabel('배치 시안 시설 목록')
 for(const [number,name]of [['19','plaza'],['27','mailbox'],['08','observatory'],['06','fountain']]as const){
  await list.getByRole('button',{name:new RegExp('^'+number)}).click()
  await page.waitForTimeout(800)
  await page.screenshot({path:path.join(dir,'layout-'+name+'.png')})
 }
 await expect.poll(()=>page.evaluate(()=>document.fonts.check('500 32px "BusanDandiMyeongjo"'))).toBe(true)
 expect(errors).toEqual([]);expect(unexpected).toEqual([])
})
