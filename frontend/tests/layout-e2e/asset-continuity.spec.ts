import {test,expect} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
test('connected benches, both shared halls and textured-free low-poly paving retain local seating',async({page})=>{
 const errors:string[]=[],network:string[]=[]
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 page.on('request',r=>{if(/\/api\/|\/ws\//.test(r.url()))network.push(r.url())})
 await page.goto('/layout-preview.html');await expect(page).toHaveTitle(/OnTop.*180m/)
 await expect(page.getByText('배치 준비 완료',{exact:true})).toBeVisible({timeout:90000})
 const probe=()=>page.evaluate(async()=>(await import('/tests/layout-e2e/assetContinuityProbe.ts' as string)).assetContinuityProbe())
 const result=await probe()
 expect(result.floor.style).toBe('low-poly-staggered-pavers');expect(result.floor.tileCount).toBeGreaterThan(200)
 expect(result.floor.triangles).toBeLessThan(5000);expect(result.floorHasTexture).toBe(false);expect(result.sharedHallGeometry).toBe(true)
 const dir=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'park-asset-continuity');await fs.mkdir(dir,{recursive:true})
 const shot=(name:string)=>page.screenshot({path:path.join(dir,name+'.png')})
 await page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:/05.*운동마당/}).click()
 await expect(page.getByLabel('선택한 시설')).toContainText('운동마당')
 await page.waitForTimeout(500);await shot('fitness-paving')
 await page.getByRole('button',{name:'시설 정보 닫기'}).click()
 await page.getByRole('button',{name:'산책하기',exact:true}).click()
 for(const kind of ['vr','folk','bench'] as const){
  await page.evaluate(async(kind)=>(await import('/tests/layout-e2e/assetContinuityProbe.ts' as string)).approachAsset(kind),kind)
  await expect.poll(async()=>(await probe()).position.x).toBe(kind==='bench'?-73:-58)
  await expect.poll(async()=>(await probe()).position.z).toBe(kind==='bench'?83.5:kind==='vr'?-23:-3)
  await page.evaluate(async(pitch)=>(await import('/tests/layout-e2e/assetContinuityProbe.ts' as string)).assetReviewPitch(pitch),kind==='bench'?-.22:.15)
  await page.waitForTimeout(250);await shot('connected-'+kind)
 }
 // Exercise the existing registered ring seat instead of inventing a new interaction.
 await page.getByRole('button',{name:'조감도',exact:true}).click()
 await page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:/05.*운동마당/}).click()
 await page.getByRole('button',{name:'원형 벤치 체험',exact:true}).click()
 const hud=page.getByRole('region',{name:'원형 벤치 이용'})
 await expect(hud).toBeVisible();await hud.getByRole('button',{name:'1번 좌석에 앉기',exact:true}).click()
 await expect.poll(async()=>(await probe()).seated?.seatIndex).toBe(0)
 await page.keyboard.press('KeyE');await expect.poll(async()=>(await probe()).seated).toBeNull()
 expect(errors).toEqual([]);expect(network).toEqual([])
})
