import {test,expect} from '@playwright/test'
import {parkFixture} from './fixture'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
test('service map restores rails and lights while retaining the latest authoritative jumpmap',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 const server=await parkFixture(page)
 await page.goto('/park')
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 const state=await page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).migrationFollowupsProbe())
 expect(state.rails).toHaveLength(9);expect(state.lanterns).toBe(true);expect(state.clouds).toEqual(['simple-sky-clouds'])
 expect(state.course).toBe(true);expect(state.localCourse).toBe(false)
 expect(state.birdModes).toHaveLength(18)
 await expect(page.getByLabel('점프맵 도전 상태')).toHaveCount(0)
 await page.getByRole('button',{name:'공원 지도',exact:true}).click()
 await expect(page.locator('[data-table-id]')).toHaveCount(18)
 await page.getByRole('button',{name:'지도 닫기',exact:true}).click()
 const directory=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'park-migration-followups')
 await fs.mkdir(directory,{recursive:true})
 for(const night of [false,true]) {
  await page.evaluate(async(night)=>{
   const {environmentClock,environmentConfig}=await import('/src/world/environmentState.ts' as string)
   const {ENVIRONMENT}=await import('/src/config/environment.ts' as string)
   environmentClock.reset();Object.assign(environmentConfig,ENVIRONMENT)
   environmentClock.sync(ENVIRONMENT.epochMs+ENVIRONMENT.dayDurationMs*(night?.02:.5),performance.now())
  },night)
  await expect.poll(()=>page.evaluate(async()=>(await import('/src/world/environmentState.ts' as string)).environmentFrame.night>0.9)).toBe(night)
  await expect(page.getByLabel('현재 위치와 공원 시간')).toContainText(night?'밤':'낮')
  await page.screenshot({path:path.join(directory,night?'service-followups-night.png':'service-followups-day.png')})
 }
 // Midnight remains playable away from light pools: move, open the map and inspect the exercise court.
 const before=await page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).probe().pose!.z)
 await page.locator('canvas').click();await page.keyboard.down('w')
 try{await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).probe().pose!.z)).toBeLessThan(before-.5)}finally{await page.keyboard.up('w')}
 await page.getByRole('button',{name:'공원 지도',exact:true}).click();await expect(page.locator('[data-table-id]')).toHaveCount(18)
 await page.getByRole('button',{name:'지도 닫기',exact:true}).click()
 server.place({x:-63,y:.9,z:72,yaw:Math.PI})
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).renderedOwnPosition()?.[0])).toBeCloseTo(-63,0)
 await page.screenshot({path:path.join(directory,'service-fitness-night.png')})
 expect(server.requests.filter(r=>/^JUMP_|COIN_|WALLET_/.test(r.type))).toEqual([])
 expect(errors).toEqual([])
})

test('running close to the original pigeons makes them fly away in the generated service scene',async({page})=>{
 const server=await parkFixture(page)
 await page.goto('/park')
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 const birds=await page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).migrationFollowupsProbe().birdModes)
 const bird=birds[0]!
 server.place({x:bird.x,y:bird.y+.72,z:bird.z+5,yaw:Math.PI})
 await expect.poll(()=>page.evaluate(async()=>{const p=await import('/tests/park-integration/probe.ts' as string);return p.renderedOwnPosition()?.[2]})).toBeCloseTo(bird.z+5,0)
 await page.locator('canvas').click()
 await page.keyboard.down('Shift');await page.keyboard.down('w')
 try {
  await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).migrationFollowupsProbe().birdModes.some((b:{mode:string})=>b.mode==='fly')),{timeout:10000}).toBe(true)
 }finally{await page.keyboard.up('w');await page.keyboard.up('Shift')}
})
