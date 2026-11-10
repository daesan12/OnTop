import {test,expect} from '@playwright/test'
import {fixture,tableId,screenshot} from '../e2e/contractFixture'
import {renewalTables,renewalMapping,renewalAnchors} from '../../src/park-renewal/runtime/placements'
import {facilityCatalog as originalCatalog} from '../fixtures/facilityCatalog'
import type {FacilityDefinition} from '../../src/features/facilities/protocol'
const identity={mapId:'park-renewal-local',schemaVersion:2,mapVersion:renewalMapping.mappingVersion}
const facilities:FacilityDefinition[]=renewalAnchors.filter(r=>['bench','fitness','telescope'].includes(r.kind)&&r.status==='mapped').map(r=>({
 facilityId:r.id,kind:r.kind.toUpperCase()as FacilityDefinition['kind'],center:{x:r.position![0],y:r.position![1]+.8,z:r.position![2],yaw:r.yaw},radius:r.radius??3,heightTolerance:r.heightTolerance??.7,
 seats:r.seats?.map(s=>s.use)??[r.use!],exit:r.seats?.[0]?.exit??r.exit!,
}))
const catalog={...originalCatalog,mapVersion:identity.mapVersion,facilities}
for(const [id,code]of [['table-5','OMOK'],['table-6','ONE_CARD']]as const)test(`${id} ${code}: mapped seat → start → settled result → park`,async({page})=>{
 const errors:string[]=[],consoleErrors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});page.on('response',r=>{if(r.status()>=400)consoleErrors.push(r.status()+' '+r.url())})
 const anchor=renewalTables.find(t=>t.id===id)!,seat=anchor.seatUse![0]!
 const peer=await fixture(page,{anchors:renewalTables,anchorId:id,connectedMap:identity,mapVersion:identity.mapVersion,facilityCatalog:catalog,omok:true,manualLobby:true,tabletServer:true,manualMovement:true,position:{x:anchor.position[0],y:anchor.floorY!+.8,z:anchor.position[2]+1.7,yaw:Math.PI},...(code==='ONE_CARD'?{onecard:4,players:4}:{})})
 await page.route('**/generated/park-renewal/park-bindings.local.json',route=>route.fulfill({json:{emotes:[{motion:'EMOTE_CLAP',code:'CLAP'},{motion:'EMOTE_WAVE',code:'WAVE'}],bindings:[{channelId:'fixture-channel',tableId,anchorId:id}]}}))
 await page.goto('/park');await expect(page).toHaveTitle('OnTop')
 await expect(page.getByLabel('3D 공원',{exact:true}).locator('canvas')).toBeVisible({timeout:180000})
 await expect(page.getByText('공원을 준비하고 있어요…',{exact:true})).toBeHidden({timeout:180000})
 console.log('renewal initial',await page.evaluate(async()=>{const urls=performance.getEntriesByType('resource').map(e=>e.name),load=(p:string)=>import(urls.find(u=>new URL(u).pathname===p)!);const w=await load('/src/network/worldClient.ts'),i=await load('/src/features/interactions/parkInteraction.ts');const s=w.useSession.getState();return{status:s.status,map:s.mapCompatible,own:w.avatars.get(s.sessionId)?.current,target:i.getParkInteraction()}}))
 await expect(page.getByRole('button',{name:'E 테이블에 앉기',exact:true})).toBeVisible({timeout:15000})
 await page.getByLabel('3D 공원',{exact:true}).locator('canvas').focus();await page.keyboard.press('KeyE')
 const tablet=page.getByRole('dialog',{name:'게임 태블릿',exact:true});await expect(tablet).toBeVisible({timeout:25000})
 const own=()=>page.evaluate(async()=>{const url=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/network/worldClient.ts')!;const m=await import(url);const a=m.avatars.get(m.useSession.getState().sessionId)!;return{pose:a.current,seat:a.seatIndex,table:a.tableId,state:m.useSession.getState().tableId}})
 await expect.poll(async()=>(await own()).pose.y).toBeCloseTo(seat.y,4)
 expect((await own()).pose).toMatchObject(seat);expect((await own()).table).toBe(id)
 await tablet.locator(`.tablet-game-card:has([data-game="${code}"])`).click()
 if(code==='ONE_CARD')await tablet.getByRole('button',{name:'4인',exact:true}).click()
 await tablet.getByLabel('1인 참가비').fill('1');await tablet.getByRole('button',{name:'선택하고 준비하기'}).click();await tablet.getByRole('checkbox').check();await tablet.getByRole('button',{name:'준비 완료',exact:true}).click()
 peer.readyTabletOthers(true);await tablet.getByRole('button',{name:'게임 시작',exact:true}).click()
 const panel=page.getByRole('region',{name:code==='OMOK'?'오목 경기':'원카드 경기',exact:true});await expect(panel).toBeVisible()
 if(code==='ONE_CARD'){
  await page.setViewportSize({width:390,height:844});await expect(panel).toBeVisible();await screenshot(page,'renewal-onecard-mobile');await page.setViewportSize({width:1440,height:1000})
  const seated=await page.evaluate(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/network/worldClient.ts')!;const w=await import(u);return [...w.avatars.values()].filter((a:any)=>a.tableId==='table-6').map((a:any)=>({seat:a.seatIndex,pose:a.current}))})
  expect(seated).toHaveLength(4);for(const a of seated)expect(a.pose).toMatchObject(anchor.seatUse![a.seat]!)
 }
 expect(peer.sent.filter(r=>r.type==='TABLE_JOIN')).toHaveLength(1)
 await screenshot(page,`renewal-${id}-${code.toLowerCase()}-playing`)
 peer.finishGame();peer.settle()
 const result=page.getByRole('dialog',{name:'경기 결과',exact:true});await expect(result).toBeVisible()
 await screenshot(page,`renewal-${id}-result`)
 await expect(result.getByRole('button',{name:'자리에서 일어나기',exact:true})).toBeDisabled()
 peer.nextRound()
 await result.getByRole('button',{name:'자리에서 일어나기',exact:true}).click()
 await expect.poll(async()=>(await own()).state).toBe('');await expect.poll(async()=>(await own()).seat).toBe(-1)
 await expect.poll(async()=>(await own()).pose.y).toBeCloseTo(anchor.seatExits![0]!.y,4)
 expect((await own()).pose).toMatchObject(anchor.seatExits![0]!);await expect(tablet).toBeHidden()
 const before=peer.sent.filter(r=>r.type==='WORLD_MOVE').length;await page.getByLabel('3D 공원',{exact:true}).locator('canvas').focus();await page.keyboard.down('KeyW');await page.waitForTimeout(300);await page.keyboard.up('KeyW');expect(peer.sent.filter(r=>r.type==='WORLD_MOVE').length).toBeGreaterThan(before)
 // Every closed facility uses the same E interaction; no construction props remain in the scene.
 for(const s of renewalMapping.world.constructionSites){const [x,y,z]=s.reachPosition;peer.pose({x,y,z});await expect(page.locator('.park-interaction')).toHaveAttribute('data-target-id',s.id);await page.keyboard.press('KeyE');const d=page.getByRole('dialog',{name:s.label+' 공사 안내',exact:true});await expect(d).toBeVisible();await expect(d.getByRole('heading',{name:'공사 중'})).toBeVisible();await d.getByRole('button',{name:'확인',exact:true}).click()}
 await expect(page.locator('vite-error-overlay')).toHaveCount(0);expect(errors).toEqual([])
 expect(peer.sent.find(r=>r.type==='WORLD_MAP_CONFIRM')?.payload).toEqual(identity)
 console.log('renewal console errors',consoleErrors)
})
