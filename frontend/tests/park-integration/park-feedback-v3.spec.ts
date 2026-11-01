import {test,expect,type Page} from '@playwright/test'
import {fixture,screenshot} from '../e2e/contractFixture'
import {parkFixture,identity} from './fixture'
import {COURSE_VERSION,RULES_VERSION,kstDate} from '../../src/features/jumpmap/course'

async function loaded(page:Page){
 await expect(page).toHaveTitle('OnTop')
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}
const errors=new WeakMap<Page,string[]>()
test.beforeEach(({page})=>{const e:string[]=[];errors.set(page,e);page.on('pageerror',x=>e.push(x.message));page.on('console',m=>{if(m.type()==='error')e.push(m.text())})})
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]))

test('latest park has a visible VR start marker and keeps the approach walkable',async({page})=>{
 const server=await fixture(page,{generatedPark:true});await page.goto('/park');await loaded(page)
 const entrance=await page.evaluate(async()=>(await import('/src/features/vrZone/parkBridge.ts' as string)).parkVrEntrance)
 server.pose(entrance)
 await page.getByRole('button',{name:/E VR 게임 선택/}).click()
 await expect(page.getByRole('dialog',{name:'VR 게임 선택',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'VR 게임 선택 닫기',exact:true}).click()
 // Keep the inlay visible beside the avatar and inspect it in both lighting states.
 const beside={...entrance,x:entrance.x-Math.cos(entrance.yaw)*2.1,z:entrance.z+Math.sin(entrance.yaw)*2.1}
 server.pose(beside)
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).renderedOwnPosition()?.[2])).toBeCloseTo(beside.z,1)
 await page.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.5))
 await expect.poll(()=>page.evaluate(async()=>(await import('/src/world/environmentState.ts' as string)).environmentFrame.daylight)).toBeGreaterThan(.95)
 const marker=await page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).frameVrEntrance())
 expect(marker.children).toBe(3);await screenshot(page,'feedback-v3-vr-entrance')
 await page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).frameVrEntrance(true))
 await screenshot(page,'vr-stone-inlay-detail-day')
 await page.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.02))
 await expect.poll(()=>page.evaluate(async()=>(await import('/src/world/environmentState.ts' as string)).environmentFrame.night)).toBeGreaterThan(.9)
 await screenshot(page,'vr-stone-inlay-detail-night')
})

test('jumpmap standalone preview supports start, fall, final-pad result and close',async({page})=>{
 await page.goto('/jumpmap-preview.html')
 await expect(page.getByRole('heading',{name:'돌탑 점프맵 · 반복 도전 HUD'})).toBeVisible()
 await page.getByRole('button',{name:'첫 발판 (테스트)',exact:true}).click()
 await expect(page.getByLabel('점프맵 경과 시간')).toBeVisible()
 await page.getByRole('button',{name:'낙하 (테스트)',exact:true}).click()
 await expect(page.getByText('첫 발판으로 돌아가 다시 도전해요',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'첫 발판 (테스트)',exact:true}).click()
 await page.getByRole('button',{name:'마지막 발판 (테스트)',exact:true}).click()
 const result=page.getByRole('dialog',{name:'점프맵 완료',exact:true})
 await expect(result.getByLabel('완주 시간')).toHaveText('272.180초')
 await result.getByRole('button',{name:'타임어택 랭킹 보기'}).click()
 await expect(result).toContainText('미리보기에서는 실제 랭킹에 연결하지 않아요.')
 await result.getByRole('button',{name:'계속하기',exact:true}).click()
 await expect(result).toBeHidden()
})

test('the ready sheet leads with game and stake for two and four players',async({page})=>{
 const server=await fixture(page,{generatedPark:true,omok:true,manualLobby:true,tabletServer:true})
 await page.goto('/park');await loaded(page);await page.locator('canvas').focus();await page.keyboard.press('KeyE')
 const tablet=page.getByRole('dialog',{name:'게임 태블릿',exact:true})
 for(const count of [2,4]){
  server.configureTablet({gameCode:'ONE_CARD',playerCount:count,betAmountPerPlayer:250})
  await expect(tablet.getByRole('heading',{name:'원카드',exact:true})).toBeVisible()
  await expect(tablet.locator('.tablet-bet-confirm')).toContainText('250냥')
  const layout=await tablet.evaluate(node=>{const a=node.querySelector('.tablet-bet-confirm')!.getBoundingClientRect(),b=node.querySelector('.tablet-roster')!.getBoundingClientRect(),art=node.querySelector('.tablet-bet-confirm .tablet-game-art')!.getBoundingClientRect();return {primaryBottom:a.bottom,secondaryTop:b.top,aspect:art.width/art.height}})
  expect(layout.secondaryTop).toBeGreaterThan(layout.primaryBottom);expect(layout.aspect).toBeCloseTo(2,1)
  await screenshot(page,`feedback-v3-ready-${count}`)
 }
 await tablet.getByRole('checkbox',{name:'참가 금액을 확인했어요'}).check()
 await expect(tablet.getByRole('button',{name:'준비 완료',exact:true})).toBeEnabled()
})

test('bungeoppang entry fits in the first viewport without scrolling',async({page})=>{
 const server=await fixture(page,{generatedPark:true});await page.goto('/park');await loaded(page)
 const stand=await page.evaluate(async()=>{
  const {bungeoppangService}=await import('/src/features/bungeoppang/service.ts' as string)
  const {createV5PreviewService}=await import('/src/features/bungeoppang/serviceV5Preview.ts' as string)
  Object.assign(bungeoppangService,createV5PreviewService(()=>.5))
  const {bungeoppangView:v}=await import('/src/features/bungeoppang/bungeoppangView.ts' as string)
  return {x:v.standX,y:.8,z:v.standZ,yaw:Math.PI}
 })
 server.pose(stand);await page.locator('canvas').focus();await page.keyboard.press('KeyE')
 const panel=page.getByRole('region',{name:'붕어빵 굽기 시작'})
 await expect(panel).toBeVisible()
 for(const size of [{width:1920,height:1080},{width:1366,height:768},{width:800,height:600},{width:390,height:844}]){
  await page.setViewportSize(size)
  await expect.poll(()=>panel.evaluate(node=>node.scrollHeight-node.clientHeight)).toBeLessThanOrEqual(1)
  for(const button of [panel.getByRole('button',{name:'시작',exact:true}),panel.getByRole('button',{name:'ESC 나가기',exact:true})]){
   const box=await button.boundingBox();expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(size.height)
  }
  await screenshot(page,`feedback-v3-bungeoppang-${size.width}`)
 }
})

test('jumpmap resets on fall and finishes with server time and tied rankings on the final pad',async({page})=>{
 const scope={channelId:'channel-1',mapVersion:identity.mapVersion}, money={earningsDate:kstDate(),dailyCap:500,todayEarned:0}
 const server=await parkFixture(page)
 await page.route('**/api/v1/rankings/park**',r=>r.fulfill({json:{items:[],me:null,nextCursor:null}}))
 await page.route('**/api/v1/minigames/jumpmap/status?*',r=>r.fulfill({json:{...scope,...money,revision:0,enabled:true,courseVersion:COURSE_VERSION,rulesVersion:RULES_VERSION,isFirstRun:true,seenTips:[],activeRunId:null,bestFinishMs:null}}))
 await page.route('**/api/v1/minigames/jumpmap/rankings',r=>r.fulfill({json:{items:[{rank:1,userId:'202',nickname:'먼저도착',finishMs:90000,finishedAt:'2026-10-31T01:00:00Z'},{rank:1,userId:'101',nickname:'나',finishMs:90000,finishedAt:'2026-10-31T01:01:00Z'}],me:{rank:1,userId:'101',nickname:'나',finishMs:90000,finishedAt:'2026-10-31T01:01:00Z'}}}))
 await page.goto('/park');await loaded(page)
 await expect.poll(()=>page.evaluate(async()=>(await import('/src/features/jumpmap/state.ts' as string)).useJumpmap.getState().available)).toBe(true)
 const emit=(type:string,revision:number,extra:object)=>server.emit(type,{...scope,...money,revision,runId:'feedback-run',...extra})
 emit('JUMPMAP_STARTED',1,{rulesVersion:RULES_VERSION,courseVersion:COURSE_VERSION,serverTime:Date.now()})
 await expect(page.getByLabel('점프맵 경과 시간')).toBeVisible()
 emit('JUMPMAP_ENDED',2,{reason:'FALL',gatesPassed:1,maxHeight:2,elapsedMs:9000,runCoins:2})
 await expect(page.getByText('첫 발판으로 돌아가 다시 도전해요',{exact:true})).toBeVisible()
 await expect(page.getByText('첫 발판으로 돌아가 다시 도전해요',{exact:true})).toBeHidden({timeout:3000})
 emit('JUMPMAP_STARTED',3,{runId:'finish-run',rulesVersion:RULES_VERSION,courseVersion:COURSE_VERSION,serverTime:Date.now()})
 emit('JUMPMAP_FINAL_PAD',4,{runId:'finish-run'})
 emit('JUMPMAP_ENDED',5,{runId:'finish-run',reason:'FINISH',gatesPassed:7,maxHeight:47,elapsedMs:90000,finishMs:90000,bestFinishMs:90000,newBest:true,runCoins:100,todayEarned:100})
 const result=page.getByRole('dialog',{name:'점프맵 완료'})
 await expect(result.getByLabel('완주 시간')).toHaveText('90.000초')
 await result.getByRole('button',{name:'타임어택 랭킹 보기'}).click()
 await expect(result.locator('.jm-ranking li')).toHaveText(['1위먼저도착90.000초','1위나90.000초'])
 await screenshot(page,'feedback-v3-jumpmap-result-ranking')
})

for(const kind of ['onecard','dice','ledger','bridge'] as const)test(`${kind} spectators can cycle with Tab`,async({page})=>{
 await fixture(page,{generatedPark:true,omok:true,publicSpectator:true,onecard:kind==='onecard'?2:undefined,dice:kind==='dice',ledger:kind==='ledger'?2:undefined,bridge:kind==='bridge'?2:undefined})
 await page.goto('/park');await loaded(page)
 await page.evaluate(async()=>{
  const {TABLES}=await import('/src/park/mapConfig.ts' as string),{parkRuntime}=await import('/src/park/runtime/runtime.ts' as string)
  parkRuntime.inspectTable(TABLES[0].id)
 })
 await page.getByRole('dialog',{name:'테이블 정보',exact:true}).getByRole('button',{name:'경기 관전',exact:true}).click()
 const read=()=>page.evaluate(async()=>(await import('/src/features/tableLobby/state.ts' as string)).useTableLobby.getState().spectatorView)
 await expect.poll(()=>page.evaluate(async()=>(await import('/src/game/store.ts' as string)).useGame.getState().game?.role)).toBe('SPECTATOR')
 await page.locator('canvas').focus();const before=await read();await page.keyboard.press('Tab')
 await expect.poll(read).toBe(before==='board'?'table':'board')
 await page.keyboard.press('Shift+Tab');await expect.poll(read).toBe(before)
})

test('skewer hides all scrollbars while the wheel still scrolls overflowing content',async({page})=>{
 await page.setViewportSize({width:1000,height:600});await page.goto('/skewer.html')
 await expect(page.locator('.sk-app')).toBeVisible()
 const scroller=page.locator('.sk-preparation')
 await expect.poll(()=>scroller.evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true)
 expect(await scroller.evaluate(node=>getComputedStyle(node).scrollbarWidth)).toBe('none')
 await scroller.hover();await page.mouse.wheel(0,500)
 await expect.poll(()=>scroller.evaluate(node=>node.scrollTop)).toBeGreaterThan(0)
 await screenshot(page,'feedback-v3-skewer-wheel')
})

test('spectator Tab changes the board view and preserves text-entry keys',async({page})=>{
 await fixture(page,{generatedPark:true,omok:true,publicSpectator:true,spectatorEvents:true})
 await page.goto('/park');await loaded(page)
 await page.evaluate(async()=>{
  const {TABLES}=await import('/src/park/mapConfig.ts' as string)
  const {parkRuntime}=await import('/src/park/runtime/runtime.ts' as string)
  parkRuntime.inspectTable(TABLES[0].id)
 })
 await page.getByRole('dialog',{name:'테이블 정보',exact:true}).getByRole('button',{name:'경기 관전',exact:true}).click()
 const read=()=>page.evaluate(async()=>(await import('/src/features/tableLobby/state.ts' as string)).useTableLobby.getState().spectatorView)
 await page.locator('canvas').focus();const before=await read();await page.keyboard.press('Tab')
 await expect.poll(read).toBe(before==='board'?'table':'board')
 await page.keyboard.press('Shift+Tab');await expect.poll(read).toBe(before)
 const input=page.getByRole('form',{name:'오목 관전 채팅'}).getByRole('textbox')
 await input.fill('관전 입력 중');await input.press('Tab');expect(await read()).toBe(before)
 await screenshot(page,'feedback-v3-spectator-tab')
})

test('omok shows the server toss, blocks early moves and reveals the same first player',async({page})=>{
 const server=await fixture(page,{generatedPark:true,omok:true,manualLobby:true,tabletServer:true})
 await page.goto('/park');await loaded(page);await page.locator('canvas').focus();await page.keyboard.press('KeyE')
 const tablet=page.getByRole('dialog',{name:'게임 태블릿',exact:true})
 server.configureTablet({gameCode:'OMOK',playerCount:2,betAmountPerPlayer:25})
 await tablet.getByRole('checkbox',{name:'참가 금액을 확인했어요'}).check()
 await tablet.getByRole('button',{name:'준비 완료',exact:true}).click();server.readyTabletOthers(true)
 await tablet.getByRole('button',{name:'게임 시작',exact:true}).click()
 await expect(page.getByRole('region',{name:'오목 경기',exact:true})).toBeVisible()
 server.coinToss(new Date(Date.now()+2500).toISOString())
 await expect(page.getByText('동전을 던지는 중…',{exact:true})).toBeVisible()
 expect(await page.evaluate(async()=>{const m=await import('/src/game/store.ts' as string);return m.canPlace(m.useGame.getState().game.omok.blackUserId,7,7)})).toBe(false)
 await expect(page.locator('.omok-coin-toss strong')).toContainText('흑돌 선공')
 await screenshot(page,'feedback-v3-omok-coin')
 await expect(page.locator('.omok-coin-toss')).toBeHidden({timeout:4000})
 expect(await page.evaluate(async()=>{const m=await import('/src/game/store.ts' as string);return m.canPlace(m.useGame.getState().game.omok.blackUserId,7,7)})).toBe(true)
})
