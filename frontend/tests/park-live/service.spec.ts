import {test,expect} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('shared placements, real Java admission/physics, table mapping and authoritative movement',async({page})=>{
  const info=JSON.parse(await fs.readFile(process.env.PARK_JAVA_INFO!,'utf8'))
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/api/v1/**',async route=>{
    const u=new URL(route.request().url()),p=u.pathname
    const body=p==='/api/v1/auth/refresh'?{accessToken:'test-principal'}:p==='/api/v1/users/me'?{userId:101,nickname:'맵 통합 검증',characterGender:'MALE'}:p==='/api/v1/auth/websocket-ticket'?{ticket:'test-proxy-principal'}:p==='/api/v1/channels'?{items:[{channelId:'park-contract',name:'계약 검증',capacity:4,currentUsers:0,joinable:true}]}:p==='/api/v1/tables'?info.tables:null
    if(body===null){await route.fulfill({status:404,json:{message:'Not part of map verification'}});return}
    await route.fulfill({json:body})
  })
  await page.route('**/park-bindings.json',r=>r.fulfill({json:{bindings:[]}}))
  await page.goto('/park');await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:60000})
  const state=()=>page.evaluate(async()=>{
    const {useSession,avatars}=await import('/src/network/worldClient.ts' as string)
    const s=useSession.getState();return {room:s.roomId,status:s.status,map:s.serverMap,compatible:s.mapCompatible,error:s.error,pose:avatars.get(s.sessionId)?.current,bindings:s.bindings}
  })
  await expect.poll(async()=>(await state()).room,{timeout:10000}).toBe('park-contract')
  expect((await state()).map).toEqual(info.map);expect((await state()).compatible).toBe(true)
  expect((await state()).bindings).toEqual(info.tables.bindings)
  const visual=await page.evaluate(async()=>{
    return (await import('/tests/park-live/probe.ts' as string)).parkLiveProbe()
  })
  expect(visual.identity).toEqual(info.map)
  expect(visual.table).toEqual(info.data.tables.find((t:{id:string})=>t.id==='table-1').position)
  expect(visual.mailbox[0]).toBe(info.data.interactions.mailbox.position[0])
  const start=(await state()).pose!
  await page.locator('canvas').focus();await page.keyboard.down('KeyW')
  await expect.poll(async()=>(await state()).pose!.z,{timeout:5000}).toBeLessThan(start.z-2)
  await page.keyboard.up('KeyW')
  await page.getByRole('button',{name:'지도',exact:false}).first().click()
  await expect(page.locator('[data-table-id="table-1"]')).toHaveAttribute('cx',String(visual.table[0]))
  const artifacts=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'ontop-park-live-qa');await fs.mkdir(artifacts,{recursive:true})
  await page.screenshot({path:path.join(artifacts,`park-live-${info.map.mapVersion.slice(0,12)}.png`)})
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);expect(errors).toEqual([])
})
