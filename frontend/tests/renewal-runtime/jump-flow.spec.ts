import {test,expect,type Page} from '@playwright/test'
import {fixture,tableId,screenshot} from '../e2e/contractFixture'
import {renewalMapping,renewalTables,renewalAnchors} from '../../src/park-renewal/runtime/placements'
import {JUMP_SEQUENCE,JUMP_REWARDS,JUMP_FINISH,JUMP_START,containsPad} from '../../src/park-renewal/jump10Plan'
import {facilityCatalog as originalCatalog} from '../fixtures/facilityCatalog'
import type {FacilityDefinition} from '../../src/features/facilities/protocol'
const identity={mapId:'park-renewal-local',schemaVersion:2,mapVersion:renewalMapping.mappingVersion}
const catalog={...originalCatalog,mapVersion:identity.mapVersion,facilities:renewalAnchors.filter(r=>['bench','fitness','telescope'].includes(r.kind)&&r.status==='mapped').map(r=>({facilityId:r.id,kind:r.kind.toUpperCase(),center:{x:r.position![0],y:r.position![1]+.8,z:r.position![2],yaw:r.yaw},radius:r.radius??3,heightTolerance:r.heightTolerance??.7,seats:r.seats?.map(s=>s.use)??[r.use!],exit:r.seats?.[0]?.exit??r.exit!}))as FacilityDefinition[]}
async function probe(page:Page,id?:string){return page.evaluate(async id=>{
 const urls=performance.getEntriesByType('resource').map(e=>e.name),load=(p:string)=>import(urls.find(u=>new URL(u).pathname===p)!)
 const s=await load('/src/features/jumpmap/state.ts'),m=await load('/src/park-renewal/runtime/jumpMotion.ts'),g=await load('/src/park-renewal/jumpGimmicks.ts'),c=await load('/src/features/jumpmap/course.ts')
 const fiber=await import(urls.find(u=>u.includes('@react-three_fiber.js'))!),scene=fiber._roots.get(document.querySelector('canvas')).store.getState().scene,visible=new Set<string>(),poses:Record<string,number>={}
 scene.traverse((o:any)=>{if(!o.userData.padIds||!o.instanceMatrix)return;for(const [i,p]of o.userData.padIds.entries()){const a=o.instanceMatrix.array,k=i*16;if(Math.hypot(a[k],a[k+1],a[k+2])>.001){visible.add(p);poses[p]=a[k+13]}}})
 const p=id?c.COURSE.find((p:any)=>p.id===id):undefined
 return{state:s.useJumpmap.getState(),visible:[...visible],renderY:id?poses[id]:undefined,pad:p?g.jumpPadPose(p,m.renewalJumpMotion):undefined,motionTime:m.renewalJumpMotion.time,contact:id?m.renewalJumpMotion.contacts.get(id):undefined,stages:c.STAGE_COUNT,total:c.COURSE.length,version:c.COURSE_VERSION}
},id)}
test('new jump course: first-pad visibility, moving pads, all ten stages and 250 server-confirmed coins',async({page})=>{
 test.setTimeout(600000);test.slow();await page.addInitScript(()=>performance.setResourceTimingBufferSize(10000))
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader|React/.test(m.text()))errors.push(m.text())})
 const peer=await fixture(page,{anchors:renewalTables,connectedMap:identity,mapVersion:identity.mapVersion,facilityCatalog:catalog,manualMovement:true,position:{x:JUMP_START.x,y:JUMP_START.y+.8,z:JUMP_START.z+2,yaw:Math.PI}})
 await page.route('**/generated/park-renewal/park-bindings.local.json',r=>r.fulfill({json:{emotes:[],bindings:[{channelId:'fixture-channel',tableId,anchorId:'table-1'}]}}))
 const scope={channelId:'fixture-channel',mapVersion:identity.mapVersion},date=new Date(Date.now()+9*3600000).toISOString().slice(0,10),earnings={earningsDate:date,dailyCap:500,todayEarned:0}
 let revision=0,coins=0,running=false,passed=0,final=false,lastRun:object|null=null
 const run={runId:'new-jump-run',elapsedMs:0,gatesPassed:0,finalReached:false,maxHeight:0,runCoins:0}
 await page.route('**/api/v1/minigames/jumpmap/status?*',r=>r.fulfill({json:{...scope,...earnings,todayEarned:coins,revision,enabled:true,courseVersion:'park220-jump10-v1',rulesVersion:'v4',isFirstRun:true,seenTips:[],activeRunId:running?run.runId:null,activeRun:running?run:null,lastRun,bestFinishMs:lastRun?100000:null}}))
 await page.route('**/api/v1/minigames/jumpmap/tips',r=>r.fulfill({status:204}))
 await page.goto('/park');await expect(page).toHaveTitle('OnTop');await expect(page.getByLabel('3D 공원',{exact:true}).locator('canvas')).toBeVisible({timeout:180000});await expect(page.getByText('공원을 준비하고 있어요…',{exact:true})).toBeHidden({timeout:180000})
 await expect.poll(async()=>(await probe(page)).state.available,{timeout:30000}).toBe(true)
 expect((await probe(page)).stages).toBe(10);expect((await probe(page)).visible).toEqual([JUMP_SEQUENCE[0]!.id])
 // The test wire peer acts as the server authority, based on feet contacts. No client start/reward calls.
 const emit=(type:string,p:object)=>peer.jumpmapEvent(type,{...scope,...earnings,todayEarned:coins,revision:++revision,runId:run.runId,...p})
 const land=(p:typeof JUMP_SEQUENCE[number],height=p.height)=>{
  peer.pose({x:p.x,y:height+.8,z:p.z,yaw:p.yaw,moving:false})
  expect(containsPad(p,p.x,p.z)).toBe(true)
  if(!running&&p.id===JUMP_SEQUENCE[0]!.id){running=true;emit('JUMPMAP_STARTED',{courseVersion:'park220-jump10-v1',rulesVersion:'v4',serverTime:Date.now()})}
  if(running){emit('JUMPMAP_STEP',{playerId:'101',block:JUMP_SEQUENCE.findIndex(b=>b.id===p.id)});if(p.gate===passed+1){passed++;coins+=JUMP_REWARDS[passed-1]!;Object.assign(run,{gatesPassed:passed,runCoins:coins});peer.setWalletBalance(100+coins);emit('JUMPMAP_GATE',{gate:passed,elapsedMs:passed*10000,coinsCalculated:JUMP_REWARDS[passed-1],coinsGranted:JUMP_REWARDS[passed-1],pending:false,runCoins:coins})}}
 }
 const future=JUMP_SEQUENCE.find(p=>p.stage===7)!;peer.pose({x:future.x,y:future.height+.8,z:future.z});await page.waitForTimeout(150);expect((await probe(page)).state.run).toBeNull();expect((await probe(page)).visible).toEqual([JUMP_SEQUENCE[0]!.id])
 land(JUMP_SEQUENCE[0]!);await expect.poll(async()=>(await probe(page)).visible.length).toBe(JUMP_SEQUENCE.length)
 console.log('jump-start-visible',JUMP_SEQUENCE.length)
 for(const p of JUMP_SEQUENCE){
  const landedAt=Date.now()
  land(p)
  if(p.theme==='lily'&&p===JUMP_SEQUENCE.find(b=>b.theme==='lily')){
   await expect.poll(async()=>(await probe(page,p.id)).pad!.solid,{timeout:7000}).toBe(false)
   expect(Date.now()-landedAt).toBeGreaterThanOrEqual(2900)
   expect(Number.isFinite((await probe(page,p.id)).contact!.fallAt)).toBe(true)
   await expect.poll(async()=>(await probe(page,p.id)).renderY??-100).toBeLessThan(p.height-.3)
   console.log('lily-3s-fall-pass')
  }
  if(p.theme==='mole'&&p===JUMP_SEQUENCE.find(b=>b.theme==='mole')){
   await expect.poll(async()=>(await probe(page,p.id)).pad!.offset,{timeout:2000}).toBeLessThan(-.2)
   peer.pose({x:p.x+4,z:p.z,y:p.height+2});await expect.poll(async()=>(await probe(page,p.id)).pad!.offset,{timeout:2000}).toBeCloseTo(0,2)
   console.log('mole-dip-return-pass')
  }
  if(p.theme==='pigeon'&&p===JUMP_SEQUENCE.find(b=>b.theme==='pigeon')){
   const heights:number[]=[];for(let i=0;i<6;i++){heights.push((await probe(page,p.id)).renderY!);await page.waitForTimeout(250)}expect(Math.max(...heights)-Math.min(...heights)).toBeGreaterThan(.2);console.log('pigeon-motion-pass')
  }
  if(p.gate){await expect.poll(async()=>(await probe(page)).state.run?.gatesPassed).toBe(p.gate);expect((await probe(page)).state.run!.runCoins).toBe(coins);await expect(page.getByLabel('도전 현황')).toContainText(`${Math.min(10,p.gate+1)} / 10구간`);console.log('jump-gate',p.gate,JUMP_REWARDS[p.gate-1],coins)}
 }
 expect(JUMP_SEQUENCE.at(-1)!.theme).toBe('duck');final=true;run.finalReached=true;emit('JUMPMAP_FINAL_PAD',{});await expect.poll(async()=>(await probe(page)).state.run?.finalReached).toBe(true)
 expect(coins).toBe(210);peer.pose({x:JUMP_FINISH.x,y:JUMP_FINISH.y+.8,z:JUMP_FINISH.z,moving:false})
 expect(final&&passed===9).toBe(true);coins+=JUMP_REWARDS[9];Object.assign(run,{gatesPassed:10,runCoins:250});peer.setWalletBalance(350);emit('JUMPMAP_GATE',{gate:10,elapsedMs:100000,coinsCalculated:40,coinsGranted:40,pending:false,runCoins:coins})
 const result={...run,reason:'FINISH',gatesPassed:10,maxHeight:50,runCoins:250,elapsedMs:100000,finishMs:100000,bestFinishMs:100000,newBest:true};running=false;lastRun=result;emit('JUMPMAP_ENDED',result)
 const dialog=page.getByRole('dialog',{name:'점프맵 완료',exact:true});await expect(dialog).toBeVisible();await expect(dialog).toContainText('10 / 10');await expect(dialog).toContainText('250');await expect(dialog).toContainText('호수섬')
 await dialog.getByText('구간 보상 자세히',{exact:true}).click();for(const n of JUMP_REWARDS)await expect(dialog.locator('.jm-reward-detail')).toContainText(`${n}냥`)
 expect((await probe(page)).state.result?.runCoins).toBe(250);await screenshot(page,'renewal-jump-ten-complete')
 await dialog.getByRole('button',{name:'계속하기',exact:true}).click();await expect(dialog).toBeHidden();await expect.poll(async()=>(await probe(page)).visible).toEqual([JUMP_SEQUENCE[0]!.id])
 const moves=peer.sent.filter(m=>m.type==='WORLD_MOVE').length;await page.locator('canvas').focus();await page.keyboard.down('KeyW');await page.waitForTimeout(250);await page.keyboard.up('KeyW');expect(peer.sent.filter(m=>m.type==='WORLD_MOVE').length).toBeGreaterThan(moves)
 expect(peer.sent.filter(m=>m.type.startsWith('JUMPMAP_'))).toEqual([]);expect(peer.walletReads).toBeGreaterThan(1);expect(errors).toEqual([]);await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
