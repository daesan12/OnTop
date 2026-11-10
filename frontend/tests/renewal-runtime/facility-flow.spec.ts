import {test,expect,type Page} from '@playwright/test'
import {fixture,tableId,screenshot} from '../e2e/contractFixture'
import {notesFixture} from '../e2e/notesFixture'
import {feedbackFixture} from '../e2e/feedbackFixture'
import {renewalTables,renewalMapping,renewalAnchors} from '../../src/park-renewal/runtime/placements'
import {facilityCatalog as originalCatalog} from '../fixtures/facilityCatalog'
import type {FacilityDefinition} from '../../src/features/facilities/protocol'
const identity={mapId:'park-renewal-local',schemaVersion:2,mapVersion:renewalMapping.mappingVersion}
const facilities:FacilityDefinition[]=renewalAnchors.filter(r=>['bench','fitness','telescope'].includes(r.kind)&&r.status==='mapped').map(r=>({
 facilityId:r.id,kind:r.kind.toUpperCase()as FacilityDefinition['kind'],center:{x:r.position![0],y:r.position![1]+.8,z:r.position![2],yaw:r.yaw},radius:r.radius??3,heightTolerance:r.heightTolerance??.7,
 seats:r.seats?.map(s=>s.use)??[r.use!],exit:r.seats?.[0]?.exit??r.exit!,
}))
const catalog={...originalCatalog,mapVersion:identity.mapVersion,facilities}
test.use({actionTimeout:15000})
type Pose={x:number;y:number;z:number;yaw?:number}
async function state(page:Page){return page.evaluate(async()=>{
 const urls=performance.getEntriesByType('resource').map(e=>e.name),load=(p:string)=>import(urls.find(u=>new URL(u).pathname===p)!)
 const w=await load('/src/network/worldClient.ts'),f=await load('/src/features/facilities/state.ts'),i=await load('/src/features/interactions/parkInteraction.ts')
 const s=w.useSession.getState();return{ready:f.useFacilityState.getState().ready,own:f.useFacilityState.getState().occupancies[s.sessionId],pose:w.avatars.get(s.sessionId)?.current,target:i.getParkInteraction(),error:s.error}
})}
async function face(page:Page,yaw:number){await page.evaluate(async yaw=>{
 const u=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/world/cameraPerspective.ts');if(!u)throw new Error('camera module missing: '+performance.getEntriesByType('resource').map(e=>e.name).filter(u=>u.includes('cameraPerspective')||u.includes('/input.ts')).join(','));const m=await import(u)
 m.setCameraPerspective('third-person');m.viewControls.yaw=yaw;m.viewControls.pitch=.4;m.viewControls.distance=6
},yaw)}

test('new park: every bench, fitness and telescope plus notes, feedback, ranking, gacha and raffle',async({page})=>{
 test.setTimeout(600000)
 await page.addInitScript(()=>performance.setResourceTimingBufferSize(10000))
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 const first=facilities.find(d=>d.kind==='BENCH')!
 const peer=await fixture(page,{anchors:renewalTables,anchorId:'table-1',connectedMap:identity,mapVersion:identity.mapVersion,facilityCatalog:catalog,manualMovement:true,position:first.exit})
 await page.route('**/generated/park-renewal/park-bindings.local.json',r=>r.fulfill({json:{emotes:[],bindings:[{channelId:'fixture-channel',tableId,anchorId:'table-1'}]}}))
 const notes=await notesFixture(page),feedback=await feedbackFixture(page)
 const requests:string[]=[];let tickets=1,balance=1000,purchased=0
 const inventory=()=>({tickets,boxes:[1,2,3,4].map(grade=>({grade,quantity:0})),balance,availableBalance:balance})
 await page.route('**/api/v1/rankings/park',r=>r.fulfill({json:{balance:[{rank:1,userId:'101',nickname:'새 공원 좌표 검수',coinBalance:1000}],bungeoppang:[],jumpmap:[],updatedAt:new Date().toISOString()}}))
 await page.route('**/api/v1/gacha**',r=>{
  const req=r.request(),path=new URL(req.url()).pathname;requests.push(req.method()+' '+path)
  if(req.method()==='GET')return r.fulfill({json:{enabled:true,ticketPrice:100,machine:{roundId:'1',version:1,remaining:30,prizes:[1,2,4,8,15].map((n,i)=>({grade:i+1,initial:n,remaining:n,value:[1000,500,250,100,20][i]})),refillEndsAt:null},inventory:inventory(),products:[],serverNow:new Date().toISOString()}})
  expect(req.headers().authorization).toBe('Bearer fixture-access');const body=req.postDataJSON(),buy=path.endsWith('/tickets')
  if(buy){tickets++;balance-=100}else{tickets--;balance+=20}
  return r.fulfill({json:{operationId:body.operationId,kind:buy?'BUY':'DRAW',roundId:'1',grade:buy?0:5,product:null,duplicate:false,paidCoins:buy?100:0,awardedCoins:buy?0:20,inventory:inventory(),completedAt:new Date().toISOString()}})
 })
 await page.route('**/api/v1/raffles/current**',r=>{
  const req=r.request();requests.push(req.method()+' '+new URL(req.url()).pathname)
  if(req.method()==='POST'){expect(req.headers()['idempotency-key']).toBeTruthy();purchased++;return r.fulfill({json:{ticketId:15,roundId:3,ticketNumber:3150,purchasePrice:100,purchasedAt:new Date().toISOString(),balanceAfter:900,purchasedCount:1,remainingCount:9}})}
  return r.fulfill({json:{roundId:3,weekStartDate:'2026-11-09',salesStatus:'OPEN',salesStartsAt:'2026-11-08T15:00:00Z',salesEndsAt:'2026-11-15T15:00:00Z',ticketPrice:100,weeklyLimit:10,purchasedCount:purchased,remainingCount:10-purchased,balance:1000-purchased*100,reservedBalance:0,availableBalance:1000-purchased*100,tickets:purchased?[{ticketId:15,ticketNumber:3150,purchasedAt:new Date().toISOString()}]:[]}})
 })
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.goto('/park');await expect(page.getByLabel('3D 공원',{exact:true}).locator('canvas')).toBeVisible({timeout:180000})
 await expect(page.getByText('공원을 준비하고 있어요…',{exact:true})).toBeHidden({timeout:180000})
 await expect.poll(async()=>(await state(page)).ready,{timeout:30000}).toBe(true)
 console.log('facility-ready',identity)
 const approach=async(p:Pose,yaw:number,id:string)=>{
  peer.pose(p);await face(page,yaw);await page.locator('canvas').focus()
  await expect.poll(async()=>(await state(page)).target?.id,{message:'target '+id,timeout:8000}).toBe(id)
 }
 const moving=async()=>{const n=peer.sent.filter(m=>m.type==='WORLD_MOVE').length;await page.locator('canvas').focus();await page.keyboard.down('KeyW');await page.waitForTimeout(220);await page.keyboard.up('KeyW');expect(peer.sent.filter(m=>m.type==='WORLD_MOVE').length).toBeGreaterThan(n)}
 for(const d of process.env.RENEWAL_QA_PANELS_ONLY?[]:facilities){
  const r=renewalAnchors.find(r=>r.id===d.facilityId&&r.kind.toUpperCase()===d.kind)!
  // Approach the actual model from its front. Pose injection is test navigation only; E uses the real runtime.
  const yaw=r.yaw??0,p=d.kind==='TELESCOPE'?d.seats[0]!:d.kind==='FITNESS'?d.exit:{x:d.center.x+Math.sin(yaw)*1.5,y:d.center.y,z:d.center.z+Math.cos(yaw)*1.5,yaw:yaw+Math.PI}
  await approach(p,Math.atan2(p.x-d.center.x,p.z-d.center.z),d.facilityId)
  await page.keyboard.press('KeyE');await expect.poll(async()=>(await state(page)).own?.facilityId).toBe(d.facilityId)
  await expect.poll(async()=>(await state(page)).pose).toMatchObject((await state(page)).own!.pose)
  if(d.kind==='TELESCOPE'){
   const panel=page.getByRole('complementary',{name:'전망 망원경',exact:true});await expect(panel).toBeVisible()
   const n=peer.sent.filter(m=>m.type==='WORLD_FACILITY_AIM').length
   await page.mouse.move(700,350);await page.mouse.down();await page.mouse.move(940,430,{steps:12});await page.mouse.up()
   await expect.poll(()=>peer.sent.filter(m=>m.type==='WORLD_FACILITY_AIM').length).toBeGreaterThan(n)
   const zoom=await page.getByLabel('확대 배율').innerText();await page.mouse.wheel(0,-500);await expect.poll(async()=>await page.getByLabel('확대 배율').innerText()).not.toBe(zoom)
   await panel.getByRole('button',{name:'망원경에서 나가기',exact:true}).click()
  }else await page.keyboard.press('KeyW') // Existing benches/fitness exit on movement, not a second E.
  await expect.poll(async()=>(await state(page)).own).toBeUndefined()
  await expect.poll(async()=>(await state(page)).pose).toMatchObject({...d.exit})
  console.log('facility-pass',d.kind,d.facilityId)
 }
 await moving()
 // Exact mapped reach and correct height are required for each kiosk; do not open panels directly.
 for(const [kind,id,label]of [['notes','tower-notes','전망대 익명 메모'],['interaction','feedback-mailbox','온탑 소리함'],['interaction','layout-photo','온탑 랭킹'],['interaction','layout-shop','의상 뽑기'],['interaction','layout-drink','복권방 행운의 뽑기']]as const){
  const r=renewalAnchors.find(r=>r.kind===kind&&(kind==='notes'||r.id===id))!,p=kind==='notes'?{...r.reach!,x:r.reach!.x+Math.sin(r.yaw)*1.6,z:r.reach!.z+Math.cos(r.yaw)*1.6}:r.reach!
  peer.pose({...p,y:p.y+5});await face(page,r.yaw??0);await expect.poll(async()=>(await state(page)).target?.id).not.toBe(id)
  await approach(p,Math.atan2(p.x-r.position![0],p.z-r.position![2]),id)
  await page.keyboard.press('KeyE');const dialog=page.getByRole('dialog',{name:label,exact:true});await expect(dialog).toBeVisible()
  const blocked=peer.sent.filter(m=>m.type==='WORLD_MOVE').length;await page.keyboard.press('KeyW');expect(peer.sent.filter(m=>m.type==='WORLD_MOVE').length).toBe(blocked)
  if(id==='tower-notes'){
   await dialog.getByRole('button',{name:/메모 작성하기/}).click();await dialog.getByLabel('새 메모').fill('새 공원 전망대 메모 좌표 검수')
   await dialog.getByRole('button',{name:/메모 남기기/}).click();await expect.poll(()=>notes.acceptedCount).toBe(1)
   await dialog.getByRole('button',{name:'익명 메모 닫기',exact:true}).click()
  }else if(id==='feedback-mailbox'){
   await dialog.getByLabel('의견 내용').fill('새 공원 소리함 좌표 검수입니다.');await dialog.locator('.feedback-send').click();await expect.poll(()=>feedback.acceptedCount).toBe(1)
   await expect(dialog).toBeHidden({timeout:10000})
  }else if(id==='layout-photo'){
   await expect(dialog).toContainText('새 공원 좌표 검수');await dialog.getByRole('button',{name:'새로 조회',exact:true}).click();await dialog.getByRole('button',{name:'랭킹 닫기',exact:true}).click()
  }else if(id==='layout-shop'){
   await dialog.getByRole('button',{name:'뽑기권 구매 100냥',exact:true}).click();await expect(dialog).toContainText('뽑기권 1장을 받았어요');await dialog.locator('.art-result').getByRole('button',{name:'확인',exact:true}).click()
   await dialog.getByRole('button',{name:'뽑기권 1장 사용',exact:true}).click();await expect(dialog).toContainText('20냥 당첨!',{timeout:20000});await dialog.locator('.art-result').getByRole('button',{name:'확인',exact:true}).click()
   await dialog.getByRole('button',{name:'뽑기 닫기',exact:true}).click()
  }else{
   await dialog.locator('.raffle-draw').click();await expect.poll(()=>purchased).toBe(1);await expect(dialog.getByRole('group',{name:'뽑은 응모 번호'})).toBeVisible({timeout:15000})
   await dialog.getByRole('group',{name:'뽑은 응모 번호'}).getByRole('button',{name:'확인',exact:true}).click()
   await expect(dialog).toContainText('3150')
   await dialog.getByRole('button',{name:'복권방 닫기',exact:true}).click()
  }
  await expect(dialog).toBeHidden();await moving();console.log('panel-pass',id)
 }
 await screenshot(page,'renewal-facilities-complete')
 expect(requests).toContain('POST /api/v1/gacha/tickets');expect(requests).toContain('POST /api/v1/gacha/draws');expect(requests).toContain('POST /api/v1/raffles/current/tickets')
 await expect(page.locator('vite-error-overlay')).toHaveCount(0);expect(errors).toEqual([])
})
