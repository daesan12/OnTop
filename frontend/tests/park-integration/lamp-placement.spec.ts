import {test,expect} from '@playwright/test'
import {parkFixture} from './fixture'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('relocated service lamps leave plaza approaches clear in daylight and at night',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 const server=await parkFixture(page)
 await page.goto('/park')
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 const directory=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'park-lamps')
 await fs.mkdir(directory,{recursive:true})
 for(const night of [false,true]) {
  await page.evaluate(async(night)=>{
   const {environmentClock,environmentConfig}=await import('/src/world/environmentState.ts' as string)
   const {ENVIRONMENT}=await import('/src/config/environment.ts' as string)
   environmentClock.reset();Object.assign(environmentConfig,ENVIRONMENT)
   environmentClock.sync(ENVIRONMENT.epochMs+ENVIRONMENT.dayDurationMs*(night?.02:.5),performance.now())
  },night)
  await expect(page.getByLabel('현재 위치와 공원 시간')).toContainText(night?'밤':'낮')
  await expect.poll(()=>page.evaluate(async()=>(await import('/src/world/environmentState.ts' as string)).environmentFrame.night>.9)).toBe(night)
  server.place({x:0,y:.98,z:65,yaw:0})
  await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).renderedOwnPosition()?.[2])).toBeCloseTo(65,0)
  await expect.poll(()=>page.evaluate(async()=>{const c=(await import('/tests/park-integration/probe.ts' as string)).cameraPosition();return Math.hypot(c[0],c[2]-65)})).toBeLessThan(12)
  await page.screenshot({path:path.join(directory,night?'plaza-night.png':'plaza-day.png')})
 }
 server.place({x:79,y:.84,z:-31,yaw:0})
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).renderedOwnPosition()?.[2])).toBeCloseTo(-31,0)
 await expect.poll(()=>page.evaluate(async()=>{const c=(await import('/tests/park-integration/probe.ts' as string)).cameraPosition();return Math.hypot(c[0]-79,c[2]+31)}),{timeout:15000}).toBeLessThan(12)
 await page.screenshot({path:path.join(directory,'shore-night.png')})
 server.place({x:-73,y:.84,z:85,yaw:0})
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).renderedOwnPosition()?.[0])).toBeCloseTo(-73,0)
 await expect.poll(()=>page.evaluate(async()=>{const c=(await import('/tests/park-integration/probe.ts' as string)).cameraPosition();return Math.hypot(c[0]+73,c[2]-85)}),{timeout:15000}).toBeLessThan(12)
 await page.screenshot({path:path.join(directory,'bench-night.png')})
 expect(errors).toEqual([])
})
