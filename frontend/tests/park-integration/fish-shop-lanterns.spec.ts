import {test,expect} from '@playwright/test'
import {parkFixture} from './fixture'
import {screenshot} from '../e2e/contractFixture'

test('fish shop lanterns remain clear of the awning and glow only after dusk',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 const server=await parkFixture(page)
 await page.goto('/park')
 await expect(page).toHaveTitle('OnTop')
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 const stand=await page.evaluate(async()=>{
  const {MINI_PROPS}=await import('/src/park/mapConfig.ts' as string)
  const {setCameraPerspective,viewControls}=await import('/src/world/cameraPerspective.ts' as string)
  const cart=MINI_PROPS[0],yaw=cart.yaw
  setCameraPerspective('third-person');Object.assign(viewControls,{yaw,pitch:.12,distance:9})
  const distance=cart.depth/2+5.8
  return {x:cart.x+Math.sin(yaw)*distance,y:.8,z:cart.z+Math.cos(yaw)*distance,yaw:yaw+Math.PI}
 })
 server.place(stand)
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).renderedOwnPosition()?.[0])).toBeCloseTo(stand.x,0)
 let previous:number[]|null=null
 await expect.poll(async()=>{
  const p:number[]=await page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).cameraPosition())
  const delta=previous?Math.hypot(...p.map((n,i)=>n-previous![i]!)):Infinity;previous=p;return delta
 }).toBeLessThan(.01)
 for(const night of [false,true,false]){
  await page.evaluate(async(night)=>{
   const {environmentClock,environmentConfig}=await import('/src/world/environmentState.ts' as string)
   const {ENVIRONMENT}=await import('/src/config/environment.ts' as string)
   environmentClock.reset();Object.assign(environmentConfig,ENVIRONMENT)
   environmentClock.sync(ENVIRONMENT.epochMs+ENVIRONMENT.dayDurationMs*(night?.02:.5),performance.now())
  },night)
  await expect(page.getByLabel('현재 위치와 공원 시간')).toContainText(night?'밤':'낮')
  await screenshot(page,night?'fish-shop-night':'fish-shop-day')
  await expect.poll(()=>page.evaluate(async()=>{
   const {fishShopLanternProbe}=await import('/tests/park-integration/probe.ts' as string)
   const p=fishShopLanternProbe();return p.emissive&&p.emission>.9
  })).toBe(night)
 }
 await expect(page.locator('vite-error-overlay')).toHaveCount(0)
 expect(errors).toEqual([])
})
