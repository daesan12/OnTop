import {test,expect,type Page} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {parkFixture,identity} from './fixture'
import {PARK_DATA} from '../../src/map/park'
const state=(page:Page)=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).probe())
async function shot(page:Page,name:string){const dir=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'ontop-park-qa');await fs.mkdir(dir,{recursive:true});await page.screenshot({path:path.join(dir,name+'.png')})}

test('generated park waits for approval, renders 16 mapped tables, and supports map, seating and facilities',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 const server=await parkFixture(page,{holdConfirmation:true})
 await page.goto('/park');await expect(page).toHaveTitle('OnTop')
 await expect.poll(()=>server.requests[0]?.type).toBe('WORLD_MAP_CONFIRM')
 expect(server.requests.some(r=>r.type==='CHANNEL_JOIN')).toBe(false)
 server.approve()
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 await expect.poll(async()=>(await state(page)).session.roomId).toBe('channel-1')
 await expect.poll(async()=>(await state(page)).facilities).toBe(true)
 const current=await state(page)
 expect(current.identity).toEqual(identity);expect(current.session.mapContractStatus).toBe('verified')
 expect(current.session.tables).toHaveLength(16)
 for(const t of current.tables)expect(t.position).toEqual(PARK_DATA.tables.find(x=>x.id===t.id)!.position)
 expect(current.mailbox?.[0]).toBe(PARK_DATA.interactions.mailbox.position[0])
 expect(server.requests.find(r=>r.type==='CHANNEL_JOIN')!.payload).toEqual({channelId:'channel-1'})
 await page.getByRole('button',{name:'공원 지도',exact:true}).click()
 await expect(page.locator('[data-table-id]')).toHaveCount(16);await shot(page,'generated-map')
 await page.getByRole('button',{name:'소리함 길 안내',exact:true}).click()
 await expect(page.locator('.navigation-map-route')).toHaveCount(1)
 await page.keyboard.press('Escape')
 await expect(page.getByRole('region',{name:'내 길 안내',exact:true})).toHaveAttribute('data-status','guiding')
 await page.getByRole('button',{name:'길 안내 취소',exact:true}).click()
 const before=(await state(page)).pose!.z
 await page.locator('canvas').click({position:{x:50,y:500}});await page.keyboard.down('KeyW')
 await expect.poll(async()=>(await state(page)).pose!.z).toBeLessThan(before-1)
 await page.keyboard.up('KeyW')
 const t=PARK_DATA.tables.find(t=>t.id==='table-16')!
 server.place({x:t.position[0],y:t.position[1]+.8,z:t.position[2]+3})
 await page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).inspect('table-16'))
 const lobby=page.getByRole('dialog',{name:'테이블 정보',exact:true})
 await expect(lobby).toBeVisible();await lobby.getByRole('button',{name:'앉기',exact:true}).click()
 await expect.poll(async()=>(await state(page)).session.tableId).not.toBe('')
 await lobby.getByRole('button',{name:'일어나기',exact:true}).click()
 await expect.poll(async()=>(await state(page)).session.tableId).toBe('')
 await lobby.getByRole('button',{name:'테이블 정보 닫기'}).click()
 const bench=PARK_DATA.interactions.benches[0]!
 server.place({x:bench.position[0],y:bench.position[1]+.8,z:bench.position[2]})
 const hint=page.getByRole('complementary',{name:'가까운 상호작용'})
 await expect(hint).toHaveAttribute('data-target-id',bench.id)
 await hint.getByRole('button',{name:/벤치에 앉기/}).click()
 await expect.poll(async()=>(await state(page)).session.benchId).toBe(bench.id)
 await hint.getByRole('button',{name:'벤치에서 일어나기'}).click()
 await expect.poll(async()=>(await state(page)).session.benchId).toBe('')
 const f=PARK_DATA.interactions.fitness[0]!
 server.place({x:f.position[0],y:f.position[1]+.8,z:f.position[2]})
 await expect(hint).toHaveAttribute('data-target-id',f.id)
 await hint.getByRole('button').first().click()
 await expect.poll(async()=>(await state(page)).session.fitnessId).toBe(f.id)
 await hint.getByRole('button',{name:'운동기구에서 내려오기'}).click()
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
for(const omitted of [false,true])test(omitted?'generated map refuses missing server identity':'generated map refuses the legacy server before entry',async({page})=>{
 const server=await parkFixture(page,omitted?{omitMap:true}:{serverMap:{...identity,schemaVersion:1,mapVersion:'a'.repeat(64)}})
 await page.goto('/park');await expect(page.locator('.park-runtime-status')).toContainText('새로고침',{timeout:30000})
 await expect(page.getByRole('button',{name:'페이지 새로고침',exact:true})).toBeVisible()
 expect(server.requests.filter(r=>['WORLD_MAP_CONFIRM','CHANNEL_JOIN','GAME_RECONNECT_CHECK','WORLD_MOVE'].includes(r.type))).toHaveLength(0)
 await shot(page,omitted?'generated-no-server-map':'generated-legacy-server-blocked')
})
