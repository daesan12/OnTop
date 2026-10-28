import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { bungeoppangFixture } from './bungeoppangFixture'

const map=(page:Page)=>page.getByRole('dialog',{name:'공원 지도창',exact:true})
const guide=(page:Page)=>page.getByRole('region',{name:'내 길 안내',exact:true})
async function loaded(page:Page){await page.goto('/park');await expect(page).toHaveTitle('OnTop');await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000});await page.locator('canvas').focus()}
async function select(page:Page,name:string,status='guiding'){await page.keyboard.press('KeyM');await expect(map(page)).toBeVisible();await map(page).getByRole('button',{name:new RegExp(name+' 길 안내$')}).click();if(status==='guiding')await expect(map(page).locator('.navigation-map-route')).toHaveCount(1);await page.keyboard.press('KeyM');await expect(map(page)).toHaveCount(0);await expect(guide(page)).toHaveAttribute('data-status',status)}
const arrows=(page:Page)=>page.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).routeArrowsProbe() as number)
const nav=(page:Page)=>page.evaluate(async()=>{const s=(await import('/src/features/navigation/navigationState.ts' as string)).useNavigation.getState();return {...s}})

test('M15 original map, authoritative positions, zone/list selection and cancellation never send movement/game/navigation actions',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  const server=await fixture(page,{omok:true,players:8,position:{x:0,y:.8,z:34,yaw:Math.PI}});await loaded(page)
  await page.getByRole('button',{name:'공원 지도',exact:true}).click();await expect(map(page)).toBeVisible()
  await expect(map(page).getByRole('group',{name:'공원 구역과 현재 위치'})).toBeVisible()
  await expect(map(page).getByLabel('현재 내 위치')).toHaveAttribute('cx','0')
  await expect(map(page).getByLabel('현재 내 위치')).toHaveAttribute('cy','34')
  await expect(map(page).getByRole('img',{name:/위치$/})).toHaveCount(7)
  await map(page).getByRole('img',{name:/산책자 102 위치/}).focus();await expect(map(page).getByRole('status').filter({hasText:'산책자 102 · 현재 위치'})).toBeVisible();expect((await nav(page)).target).toBeNull()
  await map(page).getByRole('button',{name:'소리함 길 안내',exact:true}).focus();await page.keyboard.press('Enter')
  await expect(map(page).locator('.navigation-map-route')).toHaveCount(1)
  expect((await nav(page)).target).toMatchObject({x:-10.8,z:16,name:'소리함 · 입구/주변'})
  await screenshot(page,'m15-map-reference')
  await page.keyboard.press('KeyW');await page.keyboard.press('KeyE');await page.keyboard.press('Space');await page.keyboard.press('Enter');await page.keyboard.press('KeyG')
  expect(server.sent.some(m=>m.type==='WORLD_MOVE'&&(m.payload.dx||m.payload.dz||m.payload.jump))).toBe(false)
  expect(server.sent.some(m=>/TABLE_JOIN|GAME_ACTION|WORLD_CHAT_SEND|WORLD_EMOTE_SEND/.test(m.type))).toBe(false)
  await page.getByRole('button',{name:'지도 닫기',exact:true}).click();await expect(map(page)).toHaveCount(0)
  await expect(page.getByRole('button',{name:'공원 지도',exact:true})).toBeFocused()
  await expect(guide(page)).toHaveAttribute('data-status','guiding');await expect(guide(page)).toContainText('직접 이동')
  // The route is painted on the ground ahead of the avatar while guiding, and cleared with the guidance.
  await expect.poll(()=>arrows(page)).toBeGreaterThan(0)
  await screenshot(page,'m15-navigation-hud')
  await guide(page).getByRole('button',{name:'길 안내 취소'}).click();await expect(guide(page)).toHaveCount(0)
  expect((await nav(page)).path).toEqual([])
  await expect.poll(()=>arrows(page)).toBe(0)
  expect(server.sent.some(m=>/NAVIGATION|MAP|TELEPORT/.test(m.type))).toBe(false)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);expect(errors).toEqual([])
})

test('M15 M/F1 ownership, held movement, IME/chat and G wheel do not leak or trap input',async({page})=>{
  const server=await fixture(page,{omok:true,emoteBindings:true,position:{x:0,y:.8,z:34,yaw:Math.PI}});await loaded(page)
  await select(page,'소리함')
  await page.locator('canvas').focus();await page.keyboard.down('KeyW');await expect.poll(()=>server.sent.filter(m=>m.type==='WORLD_MOVE'&&m.payload.dz).length).toBeGreaterThan(0)
  await page.keyboard.press('KeyM');await expect(map(page)).toBeVisible();await page.keyboard.up('KeyW')
  const sent=server.sent.filter(m=>m.type==='WORLD_MOVE'&&(m.payload.dx||m.payload.dz)).length
  await page.waitForTimeout(350);expect(server.sent.filter(m=>m.type==='WORLD_MOVE'&&(m.payload.dx||m.payload.dz))).toHaveLength(sent)
  await page.keyboard.press('F1');await expect(map(page)).toHaveCount(0)
  await expect(page.getByRole('dialog',{name:'게임 설명서',exact:true})).toHaveAttribute('data-phase','open')
  await expect(guide(page)).toHaveCount(0);await page.keyboard.press('KeyM');await expect(map(page)).toHaveCount(0)
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'게임 설명서',exact:true})).toHaveCount(0)
  await expect(guide(page)).toBeVisible()
  const owns=await page.evaluate(async()=>({...((await import('/src/world/inputOwnership.ts' as string)).inputState)}))
  expect(owns).toMatchObject({manualOpen:false,mapOpen:false})
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe('')
  await page.getByRole('button',{name:'채팅 입력창 열기',exact:true}).click()
  const chat=page.getByRole('textbox',{name:'주변 채팅 메시지'});await chat.fill('m 지도 확인')
  await page.keyboard.press('KeyM');await expect(map(page)).toHaveCount(0)
  await page.keyboard.press('Escape');await page.locator('canvas').focus()
  await page.evaluate(()=>{for(const flags of [{isComposing:true},{repeat:true},{ctrlKey:true},{altKey:true},{metaKey:true}])window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM',bubbles:true,...flags}))})
  await expect(map(page)).toHaveCount(0)
  await page.keyboard.down('KeyG');await expect(page.getByRole('dialog',{name:'감정표현 선택'})).toBeVisible()
  await page.keyboard.press('KeyM');await expect(map(page)).toHaveCount(0);await page.keyboard.press('Escape');await page.keyboard.up('KeyG')
  await page.keyboard.press('KeyM');await expect(map(page)).toBeVisible();await page.keyboard.press('Escape')
  await page.locator('canvas').focus();await page.keyboard.down('KeyW');await expect.poll(()=>server.sent.filter(m=>m.type==='WORLD_MOVE'&&(m.payload.dx||m.payload.dz)).length).toBeGreaterThan(sent);await page.keyboard.up('KeyW')
})

test('M15 route uses server-approved movement, replans deviation, arrives, and refuses open water/tower shortcuts',async({page})=>{
  const server=await fixture(page,{manualMovement:true,position:{x:0,y:.8,z:34,yaw:Math.PI}});await loaded(page);await select(page,'소리함')
  const before=await nav(page), midpoint=before.path[Math.floor(before.path.length/2)]!
  server.pose({...midpoint});await expect.poll(async()=>Number((await guide(page).textContent())?.match(/약 (\d+)/)?.[1])).toBeLessThan(40)
  server.pose({x:14,z:40});await expect.poll(async()=> (await nav(page)).path[0]).toEqual({x:14,z:40})
  // Use the open west approach; the former south test point is inside furniture.
  const approach=(distance:number)=>({x:-10.8+distance*Math.cos(3.5),z:16+distance*Math.sin(3.5)})
  const outside=approach(3.5),nearby=approach(2.5)
  server.pose(outside)
  await expect.poll(()=>page.evaluate(async()=>(await import('/src/network/worldClient.ts' as string)).avatars.get('101')?.current.z)).toBe(outside.z)
  await page.waitForTimeout(400);await expect(guide(page)).toHaveAttribute('data-status','guiding')
  server.pose(nearby);await expect(guide(page)).toHaveAttribute('data-status','arrived');await expect(guide(page)).toContainText('도착')
  await expect.poll(()=>arrows(page)).toBe(0)
  await screenshot(page,'navigation-nearby-arrival')
  await expect(guide(page)).toHaveCount(0,{timeout:6000})
  expect((await nav(page)).target).toBeNull()
  await page.keyboard.press('KeyM');await expect(map(page)).toBeVisible()
  // An actual pointer click in the current SVG's world-coordinate space.
  const point=await map(page).getByRole('group',{name:'공원 구역과 현재 위치'}).evaluate(svg=>{const matrix=(svg as SVGSVGElement).getScreenCTM()!;const p=new DOMPoint(56,-25).matrixTransform(matrix);return{x:p.x,y:p.y}})
  await page.mouse.click(point.x,point.y);await page.keyboard.press('Escape')
  await expect(guide(page)).toHaveAttribute('data-status','unreachable');expect((await nav(page)).path).toEqual([])
  await screenshot(page,'m15-navigation-water-rejected')
  await guide(page).getByRole('button',{name:'길 안내 취소'}).click()
  server.pose({x:65.5,y:10,z:50});await select(page,'소리함','paused')
  await expect(guide(page)).toHaveAttribute('data-status','paused');expect((await nav(page)).path).toEqual([])
  server.pose({x:65.5,y:.8,z:50});await expect(guide(page)).toHaveAttribute('data-status','guiding')
})

test('a clicked map point completes nearby while its route is still loading and cannot resume from a late result',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  const server=await fixture(page,{manualMovement:true,position:{x:0,y:.8,z:34,yaw:Math.PI}});await loaded(page)
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/navigation.worker.ts*',async route=>{await gate;await route.continue()})
  try {
    await page.keyboard.press('KeyM');await expect(map(page)).toBeVisible()
    const point=await map(page).getByRole('group',{name:'공원 구역과 현재 위치'}).evaluate(svg=>{
      const p=new DOMPoint(0,26).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);return{x:p.x,y:p.y}
    })
    await page.mouse.click(point.x,point.y);await page.keyboard.press('Escape')
    await expect(guide(page)).toHaveAttribute('data-status','planning')
    const target=(await nav(page)).target!
    expect(target.name).toBe('선택한 지점')
    server.pose({x:target.x,z:target.z+2.5})
    await expect(guide(page)).toHaveAttribute('data-status','arrived')
    await expect.poll(()=>arrows(page)).toBe(0)
    release();await page.waitForTimeout(1000)
    await expect(guide(page)).toHaveAttribute('data-status','arrived')
    await expect(guide(page)).toHaveCount(0,{timeout:6000})
    expect((await nav(page)).target).toBeNull()
    await expect.poll(()=>page.workers().length).toBe(0)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);expect(errors).toEqual([])
  } finally { release() }
})

test('M15 navigation is per browser and clears on account exit; a mismatched map cannot guide',async({page,browser})=>{
  const server=await fixture(page,{players:2,position:{x:0,y:.8,z:34,yaw:Math.PI}});await loaded(page);await select(page,'소리함')
  const other=await browser.newPage();await fixture(other);await loaded(other)
  expect((await nav(other)).target).toBeNull();await other.close()
  server.endSession();await expect(guide(page)).toHaveCount(0);await expect.poll(async()=> (await nav(page)).target).toBeNull()
  await page.goto('/');await fixture(page,{mapVersion:'unmatched-test-map'});await loaded(page)
  await page.keyboard.press('KeyM');await expect(map(page)).toBeVisible();await expect(map(page).getByRole('alert')).toContainText('맵 버전')
  await expect(map(page).getByRole('button',{name:'10. 소리함',exact:true})).toBeDisabled()
  await page.keyboard.press('Escape');expect((await nav(page)).target).toBeNull()
})

test('existing bungeoppang map lock cancels guidance and allows a new route on return',async({page})=>{
  await bungeoppangFixture(page);await loaded(page);await select(page,'소리함')
  await page.locator('canvas').focus();await page.keyboard.press('KeyE')
  await expect(page.getByRole('region',{name:'붕어빵 굽기 시작',exact:true})).toBeVisible();await expect(guide(page)).toHaveCount(0)
  // ParkMap's existing gameplayMenusLocked effect clears the route on mini-game entry.
  expect((await nav(page)).target).toBeNull()
  await page.keyboard.press('KeyM');await expect(map(page)).toHaveCount(0)
  await page.getByRole('button',{name:'ESC 나가기',exact:true}).click();await expect(guide(page)).toHaveCount(0)
  await select(page,'소리함')
})

test('M15 guidance preserves table entry/exit and never covers the settings panel',async({page})=>{
  const server=await fixture(page,{omok:true,m09:true});await loaded(page);await select(page,'소리함')
  const target=(await nav(page)).target
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(page.getByRole('region',{name:'설정',exact:true})).toBeVisible()
  await expect(guide(page)).toHaveCount(0)
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click();await expect(guide(page)).toBeVisible()
  await page.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
  const lobby=page.getByRole('dialog',{name:'테이블 정보',exact:true})
  await lobby.getByRole('button',{name:'앉기',exact:true}).click();await expect(guide(page)).toHaveCount(0)
  await page.keyboard.press('KeyM');await expect(map(page)).toHaveCount(0)
  await lobby.getByRole('button',{name:'일어나기',exact:true}).click();await expect(guide(page)).toBeVisible()
  expect((await nav(page)).target).toEqual(target)
  expect(server.sent.some(m=>m.type==='GAME_ACTION_SEND')).toBe(false)
})

test('M15 map stays usable on a small PC viewport and Tab remains inside the map',async({page})=>{
  await page.setViewportSize({width:1280,height:720});await fixture(page,{position:{x:0,y:.8,z:34,yaw:Math.PI}});await loaded(page)
  await page.getByRole('button',{name:'공원 지도',exact:true}).click();await expect(map(page)).toBeVisible()
  await expect(map(page).getByRole('button',{name:'지도 닫기',exact:true})).toBeInViewport()
  const last=map(page).getByRole('button',{name:'11. 중앙 석탑',exact:true});await last.focus();await page.keyboard.press('Tab')
  expect(await page.evaluate(()=>document.activeElement?.closest('#park-map-panel')!==null)).toBe(true)
  await screenshot(page,'m15-map-1280')
  await page.keyboard.press('Escape');await expect(map(page)).toHaveCount(0)
})

test('M15 long-route worker leaves UI timers and existing movement alive, and releases its caches',async({page})=>{
  const server=await fixture(page,{manualMovement:true,position:{x:0,y:.8,z:34,yaw:Math.PI}});await loaded(page)
  await expect.poll(()=>page.evaluate(async()=>(await import('/src/world/inputOwnership.ts' as string)).roamingInput.ready)).toBe(true)
  const calculation=page.evaluate(async()=>{
    const {createRoutePlanner}=await import('/src/features/navigation/routePlanner.ts' as string)
    const planner=createRoutePlanner(),at=performance.now();let pulses=0
    const timer=setInterval(()=>pulses++,10)
    try{const result=await planner.plan({x:0,z:34},{x:65.5,z:50});return{...result,pulses,wallMs:performance.now()-at}}
    finally{clearInterval(timer);planner.dispose()}
  })
  await page.keyboard.down('KeyW')
  await expect.poll(()=>server.sent.some(m=>m.type==='WORLD_MOVE'&&(m.payload.dx||m.payload.dz))).toBe(true)
  const result=await calculation;await page.keyboard.up('KeyW')
  expect(result.path!.length).toBeGreaterThan(1);expect(result.pulses).toBeGreaterThanOrEqual(2)
  expect(server.sent.some(m=>m.type==='WORLD_MOVE'&&(m.payload.dx||m.payload.dz))).toBe(true)
  await expect.poll(()=>page.workers().length).toBe(0)
  console.log('Local route worker timing',JSON.stringify({ms:result.durationMs,wallMs:result.wallMs,pulses:result.pulses}))
})

test('M15 unavailable worker reports failure without a fake route; a new destination retries cleanly',async({page})=>{
  await fixture(page,{position:{x:0,y:.8,z:34,yaw:Math.PI}});await loaded(page)
  await page.route('**/navigation.worker.ts*',route=>route.abort())
  await page.keyboard.press('KeyM');await map(page).getByRole('button',{name:'소리함 길 안내',exact:true}).click();await page.keyboard.press('Escape')
  await expect(guide(page)).toHaveAttribute('data-status','unavailable');expect((await nav(page)).path).toEqual([])
  await page.unroute('**/navigation.worker.ts*');await select(page,'소리함')
  await guide(page).getByRole('button',{name:'길 안내 취소'}).click();await expect.poll(()=>page.workers().length).toBe(0)
})
