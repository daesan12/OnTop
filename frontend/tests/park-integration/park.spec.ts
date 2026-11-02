import {test,expect,type Page} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {parkFixture,identity} from './fixture'
import bindingsFile from '../../public/park-bindings.generated.frontend-test.json' with {type:'json'}
import {PARK_DATA} from '../../src/map/park'
import {TABLES,tableSeats} from '../../src/park/mapConfig'
const state=(page:Page)=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).probe())
async function shot(page:Page,name:string){const dir=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'ontop-park-qa');await fs.mkdir(dir,{recursive:true});await page.screenshot({path:path.join(dir,name+'.png')})}

test('generated park waits for approval, renders 18 mapped tables, and supports map, seating and facilities',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 const server=await parkFixture(page,{holdConfirmation:true})
 await page.goto('/park');await expect(page).toHaveTitle('OnTop')
 await expect.poll(()=>server.requests.find(r=>r.type==='WORLD_MAP_CONFIRM')?.type,{timeout:90000}).toBe('WORLD_MAP_CONFIRM')
 expect(server.requests.some(r=>r.type==='CHANNEL_JOIN')).toBe(false)
 server.approve()
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 await expect.poll(async()=>(await state(page)).session.roomId).toBe('channel-1')
 await expect.poll(async()=>(await state(page)).facilities).toBe(true)
 const current=await state(page)
 expect(current.identity).toEqual(identity);expect(current.session.mapContractStatus).toBe('verified')
 expect(current.session.tables).toHaveLength(18)
 for(const t of current.tables)expect(t.position).toEqual(PARK_DATA.tables.find(x=>x.id===t.id)!.position)
 expect(current.mailbox?.[0]).toBe(PARK_DATA.interactions.mailbox.position[0])
 expect(server.requests.find(r=>r.type==='CHANNEL_JOIN')!.payload).toEqual({channelId:'channel-1'})
 await page.getByRole('button',{name:'공원 지도',exact:true}).click()
 await expect(page.locator('[data-table-id]')).toHaveCount(18);await shot(page,'generated-map')
 await page.getByRole('button',{name:'소리함 길 안내',exact:true}).click()
 await expect(page.locator('.navigation-map-route')).toHaveCount(1,{timeout:15000})
 await page.keyboard.press('Escape')
 await expect(page.getByRole('region',{name:'내 길 안내',exact:true})).toHaveAttribute('data-status','guiding')
 await page.getByRole('button',{name:'길 안내 취소',exact:true}).click()
 const before=(await state(page)).pose!.z
 await page.locator('canvas').click({position:{x:50,y:500}});await page.keyboard.down('KeyW')
 await expect.poll(async()=>(await state(page)).pose!.z).toBeLessThan(before-1)
 await page.keyboard.up('KeyW')
 const t=PARK_DATA.tables.find(t=>t.id==='table-16')!
 const seat=tableSeats(TABLES.find(t=>t.id==='table-16')!)[0]!
 server.place({x:t.position[0]+seat.x,y:t.position[1]+.8,z:t.position[2]+seat.z+.6})
 await page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).inspect('table-16'))
 const lobby=page.getByRole('dialog',{name:'게임 태블릿',exact:true})
 await expect(lobby).toBeVisible()
 await expect.poll(async()=>(await state(page)).session.tableId).not.toBe('')
 await lobby.getByRole('button',{name:'일어나기',exact:true}).click()
 await expect.poll(async()=>(await state(page)).session.tableId).toBe('')
 await expect(lobby).toBeHidden()
 for(const vr of PARK_DATA.tables.filter(t=>t.assetId==='procedural/vr-stone-game-table')){
  server.place({x:vr.position[0],y:vr.position[1]+.8,z:vr.position[2]+2.4})
  await page.evaluate(async(id)=>(await import('/tests/park-integration/probe.ts' as string)).inspect(id),vr.id)
  await expect(lobby).toBeVisible()
  const binding=bindingsFile.bindings.find(b=>b.channelId==='channel-1'&&b.anchorId===vr.id)!
  await expect.poll(async()=>(await state(page)).session.tableId).toBe(binding.tableId)
  server.enableFourPlayers(vr.id)
  const surfaces=()=>page.evaluate(async(id)=>(await import('/tests/park-integration/probe.ts' as string)).renderedSeatHeights(id),vr.id)
  await expect.poll(async()=>(await surfaces()).count).toBe(4)
  for(const height of (await surfaces()).heights)expect(height).toBeCloseTo(vr.position[1]+.56,3)
  await shot(page,'vr-game-'+vr.id)
  server.resetGame(vr.id)
  await expect(lobby).toBeVisible()
  await lobby.getByRole('button',{name:'일어나기',exact:true}).click()
  await expect.poll(async()=>(await state(page)).session.tableId).toBe('')
 }
 const bench=PARK_DATA.interactions.benches[0]!
 server.place({x:bench.position[0],y:bench.position[1]+.8,z:bench.position[2]})
 const hint=page.getByRole('complementary',{name:'가까운 상호작용'})
 await expect(hint).toHaveAttribute('data-target-id',bench.id)
 await hint.getByRole('button',{name:/벤치에 앉기/}).click()
 await expect.poll(async()=>(await state(page)).session.benchId).toBe(bench.id)
 await page.keyboard.press('KeyW')
 await expect.poll(async()=>(await state(page)).session.benchId).toBe('')
 for(const ring of PARK_DATA.interactions.benches.filter(b=>b.id.startsWith('bench-fitness-ring-')||b.siteId.startsWith('bench-forest-')||b.siteId.startsWith('bench-fountain-'))){
  server.place(ring.seats[0]!.exit)
  await expect(hint).toHaveAttribute('data-target-id',ring.id)
  await hint.getByRole('button',{name:/벤치에 앉기/}).click()
  await expect.poll(async()=>(await state(page)).session.benchId).toBe(ring.id)
  expect(server.requests.filter(r=>r.type==='WORLD_FACILITY_USE').at(-1)!.payload.facilityId).toBe(ring.id)
  await page.keyboard.press('KeyW')
  await expect.poll(async()=>(await state(page)).session.benchId).toBe('')
  await expect.poll(async()=>(await state(page)).pose).toEqual(ring.seats[0]!.exit)
 }
 for(const site of PARK_DATA.interactions.construction){
  const [x,y,z]=site.reachPosition;server.place({x,y,z,yaw:site.yaw})
  await expect(hint).toHaveAttribute('data-target-id',site.id)
  await expect(hint.getByRole('button')).toContainText(site.label+' · 무료 목업 체험')
 }
 const ranking=PARK_DATA.interactions.rankingBoard
 const [rankingX,rankingY,rankingZ]=ranking.reachPosition
 server.place({x:rankingX,y:rankingY,z:rankingZ,yaw:ranking.yaw})
 await expect(hint).toHaveAttribute('data-target-id',ranking.id)
 await expect(hint.getByRole('button')).toContainText('랭킹 자세히 보기')
 const rankingRequests=server.requests.filter(r=>r.type==='WORLD_FACILITY_USE').length
 await page.keyboard.press('KeyE')
 await expect.poll(async()=>(await state(page)).rankingBoardOpen).toBe(true)
 const rankingDialog=page.getByRole('dialog',{name:'온탑 랭킹'})
 await expect(rankingDialog).toBeVisible()
 await expect(rankingDialog.getByRole('heading',{name:'보유량'})).toBeVisible()
 await expect(rankingDialog.getByText('새 맵 검증')).toBeVisible()
 await expect(rankingDialog.getByText('12,580냥')).toHaveCount(2)
 await expect(rankingDialog.getByRole('heading',{name:'붕어빵 굽기'})).toBeVisible()
 await expect(rankingDialog.getByText('붕어빵 장인')).toBeVisible()
 await expect(rankingDialog.getByText('붕어빵 도전자')).toBeVisible()
 await expect(rankingDialog.getByText('2,981점')).toBeVisible()
 await expect(rankingDialog.getByRole('heading',{name:'점프맵'})).toBeVisible()
 await expect(rankingDialog.getByText('점프 고수')).toBeVisible()
 await expect(rankingDialog.getByText('공동 고수')).toBeVisible()
 await expect(rankingDialog.getByText('1분 02.543초')).toHaveCount(2)
 expect(server.restRequests.filter(r=>r.path==='/api/v1/rankings/park').length).toBeGreaterThanOrEqual(1)
 expect(server.requests.filter(r=>r.type==='WORLD_FACILITY_USE')).toHaveLength(rankingRequests)
 const movementRequests=server.requests.filter(r=>r.type==='WORLD_MOVE').length
 await page.keyboard.press('KeyW')
 expect(server.requests.filter(r=>r.type==='WORLD_MOVE')).toHaveLength(movementRequests)
 await page.keyboard.press('Escape')
 await expect(rankingDialog).toBeHidden()
 await expect.poll(async()=>(await state(page)).rankingBoardOpen).toBe(false)
 const f=PARK_DATA.interactions.fitness[0]!
 server.place({x:f.position[0],y:f.position[1]+.8,z:f.position[2]})
 await expect(hint).toHaveAttribute('data-target-id',f.id)
 await hint.getByRole('button').first().click()
 await expect.poll(async()=>(await state(page)).session.fitnessId).toBe(f.id)
 await page.keyboard.press('KeyW')
 await expect.poll(async()=>(await state(page)).session.fitnessId).toBe('')
 const telescope=PARK_DATA.interactions.telescopes[0]!
 server.place({x:telescope.position[0],y:telescope.position[1]+.8,z:telescope.position[2]})
 await expect(hint).toHaveAttribute('data-target-id',telescope.id)
 await hint.getByRole('button').first().click()
 await expect.poll(async()=>(await state(page)).session.telescopeId).toBe(telescope.id)
 await page.getByRole('button',{name:'망원경에서 나가기',exact:true}).click()
 await expect.poll(async()=>(await state(page)).session.telescopeId).toBe('')
 await expect.poll(async()=>(await state(page)).pose).toEqual({x:telescope.exit.x,y:telescope.exit.y,z:telescope.exit.z,yaw:telescope.exit.yaw})
 const [x,y,z]=PARK_DATA.interactions.notes.reachPosition;server.place({x,y,z})
 await expect(hint).toHaveAttribute('data-target-id','tower-notes')
 await hint.getByRole('button').first().click()
 await expect(page.getByRole('dialog',{name:'전망대 익명 메모'})).toBeVisible()
 await page.getByRole('button',{name:'익명 메모 닫기'}).click()
 expect((await state(page)).session.error).toBe('')
 await shot(page,'generated-facilities');await expect(page.locator('vite-error-overlay')).toHaveCount(0);expect(errors).toEqual([])
 // Swimming remains an authoritative server state; the fixture checks its FE projection only.
 const lake=PARK_DATA.surfaces.lake
 server.place({x:lake.x,y:.5,z:lake.z},true)
 await expect.poll(async()=>(await state(page)).swimming).toBe(true)
 await expect(hint).toBeHidden()
 server.mismatch()
 await expect(page.locator('.park-runtime-status')).toContainText('새로고침')
 const after=server.requests.length
 await page.locator('canvas').focus();await page.keyboard.press('KeyW')
 expect(server.requests.slice(after).filter(r=>['CHANNEL_JOIN','WORLD_MOVE','WORLD_FACILITY_USE'].includes(r.type))).toHaveLength(0)
})
test('distant table guidance disappears within three seconds without sitting and can be shown again',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
 const server=await parkFixture(page)
 await page.goto('/park');await expect(page).toHaveTitle('OnTop')
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 await expect.poll(async()=>(await state(page)).session.status).toBe('connected')
 const notice=page.locator('.park-runtime-status')
 for(let attempt=0;attempt<2;attempt++){
  expect(await page.evaluate(async()=>
   (await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.joinTable('table-1'))).toBe(false)
  await expect(notice).toContainText('테이블 의자 가까이에서 앉기를 눌러주세요.')
  if(attempt===0)await shot(page,'table-guidance-visible')
  await expect(notice).toBeHidden({timeout:2700})
  expect((await state(page)).session.tableId).toBe('')
  expect((await state(page)).session.error).toBe('')
 }
 expect(server.requests.filter(request=>request.type==='TABLE_JOIN')).toHaveLength(0)
 await shot(page,'table-guidance-expired')
 const table=PARK_DATA.tables.find(table=>table.id==='table-16')!
 const seat=tableSeats(TABLES.find(anchor=>anchor.id===table.id)!)[0]!
 server.place({x:table.position[0]+seat.x,y:table.position[1]+.8,z:table.position[2]+seat.z+.6})
 await page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).inspect('table-16'))
 await expect(page.getByRole('dialog',{name:'게임 태블릿',exact:true})).toBeVisible()
 await expect(page.locator('vite-error-overlay')).toHaveCount(0)
 expect(errors).toEqual([])
})
for(const omitted of [false,true])test(omitted?'generated map refuses missing server identity':'generated map refuses the legacy server before entry',async({page})=>{
 const server=await parkFixture(page,omitted?{omitMap:true}:{serverMap:{...identity,schemaVersion:1,mapVersion:'a'.repeat(64)}})
 await page.goto('/park');await expect(page.locator('.park-runtime-status')).toContainText('새로고침',{timeout:30000})
 await expect(page.getByRole('button',{name:'페이지 새로고침',exact:true})).toBeVisible()
 expect(server.requests.filter(r=>['WORLD_MAP_CONFIRM','CHANNEL_JOIN','GAME_RECONNECT_CHECK','WORLD_MOVE'].includes(r.type))).toHaveLength(0)
 await shot(page,omitted?'generated-no-server-map':'generated-legacy-server-blocked')
})
