import {test,expect,type Page} from '@playwright/test'
import {fixture,screenshot} from '../e2e/contractFixture'
import {generatedFacilityCatalog} from './fixture'
import {benchTable} from '../../src/features/interactions/benchSpectator'
import {PARK_MAP_VERSION} from '../../src/map/park/generated/mapVersion'

const errors=new WeakMap<Page,string[]>()
test.beforeEach(({page})=>{const list:string[]=[];errors.set(page,list);page.on('pageerror',e=>list.push(e.message));page.on('console',m=>{if(m.type()==='error')list.push(m.text())})})
test.afterEach(async({page})=>{expect(errors.get(page)).toEqual([]);await expect(page.locator('vite-error-overlay')).toHaveCount(0)})
const visual=(page:Page)=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).gameVisualProbe())
async function load(page:Page){
 await page.goto('/park');await expect(page).toHaveTitle('OnTop');await expect(page).toHaveURL(/\/park$/)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 await expect.poll(()=>page.evaluate(async()=>{
  const {probe,sceneReady}=await import('/tests/park-integration/probe.ts' as string)
  return sceneReady()?probe().identity:null
 }),{timeout:90000}).toMatchObject({schemaVersion:2,mapVersion:PARK_MAP_VERSION})
}
async function prepare(page:Page,code:string,count=2){
 await page.getByRole('button',{name:'E 테이블에 앉기',exact:true}).click()
 const tablet=page.getByRole('dialog',{name:'게임 태블릿',exact:true})
 await tablet.locator(`.tablet-game-card:has([data-game="${code}"])`).click()
 if(count>2)await tablet.getByRole('button',{name:`${count}인`,exact:true}).click()
 await tablet.getByLabel('1인 참가비').fill('1')
 await tablet.getByRole('button',{name:'선택하고 준비하기'}).click()
 await tablet.getByRole('checkbox').check();await tablet.getByRole('button',{name:'준비 완료',exact:true}).click()
 return tablet
}
for(const count of [2,4] as const)test(`new map onecard ${count}: shuffle, sequential deal, aligned card and unclipped chat`,async({page})=>{
 const server=await fixture(page,{generatedPark:true,omok:true,manualLobby:true,tabletServer:true,onecard:count,players:count,spectatorEvents:true})
 await load(page);const tablet=await prepare(page,'ONE_CARD',count);server.readyTabletOthers(true)
 await tablet.getByRole('button',{name:'게임 시작',exact:true}).click()
 await expect.poll(async()=>(await visual(page)).phase,{intervals:[25]}).toBe('shuffle')
 expect((await visual(page)).counts.slice(0,count)).toEqual(Array(count).fill(0))
 await expect.poll(async()=>(await visual(page)).phase,{intervals:[25]}).toBe('deal')
 await screenshot(page,`feedback-onecard-${count}-dealing`)
 await expect.poll(async()=>(await visual(page)).counts.slice(0,count)).toEqual(Array(count).fill(7))
 await expect.poll(async()=>(await visual(page)).opening).toBe(false)
 expect((await visual(page)).topRotation?.every((angle:number)=>Math.abs(angle)<1e-6)).toBe(true)
 await expect(page.locator('.onecard-public .onecard-card')).toHaveCSS('transform','none')
 const chat=page.getByRole('region',{name:'경기 채팅',exact:true})
 for(let i=0;i<8;i++)server.spectatorEvent('chat',{senderUserId:'102',text:`줄이 잘리지 않는 경기 채팅 ${i}`})
 await chat.getByRole('button',{name:'채팅 기록 보기'}).click()
 await expect(chat.locator('.park-chat__messages')).toHaveCSS('border-radius','0px')
 await expect(chat.getByRole('log')).toContainText('경기 채팅 7')
 for(const viewport of [{width:1920,height:1080},{width:390,height:844}]){
  await page.setViewportSize(viewport)
  await chat.getByRole('button',{name:'채팅 입력창 열기'}).click()
  const input=chat.getByRole('textbox');await input.fill('채팅 입력 중')
  const bounds=(await chat.boundingBox())!,composer=(await chat.locator('.park-chat__composer').boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width)
  expect(composer.y+composer.height).toBeLessThanOrEqual(bounds.y+bounds.height+1)
  await screenshot(page,`feedback-onecard-chat-${count}-${viewport.width}`)
  await chat.getByRole('button',{name:'채팅 입력창 닫기'}).click()
 }
 server.cardSnapshot({turnCount:2});await expect.poll(async()=>(await visual(page)).opening).toBe(false)
})
test('reduced motion shows all cards and permits drawing immediately without an invisible opening lock',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'})
 const server=await fixture(page,{generatedPark:true,omok:true,manualLobby:true,tabletServer:true,onecard:2,players:2})
 await load(page);const tablet=await prepare(page,'ONE_CARD');server.readyTabletOthers(true)
 await tablet.getByRole('button',{name:'게임 시작',exact:true}).click()
 const draw=page.getByRole('button',{name:'드로우',exact:true})
 await expect(draw).toBeEnabled()
 const timing=await page.evaluate(async()=>{
  const game=(await import('/src/game/store.ts' as string)).useGame.getState().game
  const opening=await import('/src/game/onecard/opening.ts' as string)
  const actions=await import('/src/game/onecard/actions.ts' as string)
  return {stillOpening:opening.openingActive(game.onecard,game.version,Date.now()),allowed:actions.canActOneCard('101',{kind:'draw'})}
 })
 expect(timing).toEqual({stillOpening:true,allowed:true})
 await expect(page.getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(7)
 await expect(page.locator('.onecard-opening-status')).toHaveCount(0)
 const hand=server.cardHand()
 server.cardReply({kind:'draw'},{turnUserId:'102',players:server.cardState().players.map(p=>p.userId==='101'?{...p,cardCount:8}:p)},
  {...hand,hand:[...hand.hand,{id:'clubs-8',suit:'clubs',rank:'8'}],playableCardIds:[],canDraw:false})
 await draw.click();await expect(page.getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(8)
 expect(server.sent.filter(m=>m.type==='GAME_ACTION_SEND')).toHaveLength(1)
})
test('a full waiting table keeps its public information without attempting to watch a nonexistent match',async({page})=>{
 const server=await fixture(page,{generatedPark:true,omok:true,publicSpectator:true,manualMovement:true})
 await load(page)
 server.publicMatch(null)
 await expect(page.getByRole('button',{name:'E 테이블 경기 보기',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'E 테이블 경기 보기',exact:true}).click()
 const information=page.getByRole('dialog',{name:'테이블 정보',exact:true})
 await expect(information).toBeVisible();await expect(information).toContainText('현재 확정된 진행 경기가 없습니다.')
 await expect(information.getByRole('button',{name:'경기 관전',exact:true})).toBeDisabled()
 expect(server.sent.some(m=>m.type==='GAME_WATCH'||m.type==='TABLE_JOIN')).toBe(false)
})
for(const seated of [false,true])test(`new map omok watch ${seated?'pavilion seated':'stone standing'}: no table panel and compact chat`,async({page})=>{
 const bench=generatedFacilityCatalog.facilities.find(b=>b.kind==='BENCH'&&benchTable(b.facilityId)?.pavilionId==='P1')!
 const anchor=seated?benchTable(bench.facilityId)!:undefined
 const server=await fixture(page,{generatedPark:true,omok:true,spectatorEvents:true,publicSpectator:true,manualMovement:true,
  ...(seated?{anchorId:anchor!.id,position:bench.center}:{})})
 await load(page)
 if(seated){
  expect(await page.evaluate(async id=>(await import('/src/features/interactions/benchController.ts' as string)).sitBench(id,0),bench.facilityId)).toBe(true)
  // Even an explicit table inspection cannot overlay the seated spectator.
  await page.evaluate(async id=>(await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.inspectTable(id),anchor!.id)
  await expect(page.getByRole('dialog',{name:'테이블 정보',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'가까이 관전',exact:true}).click()
 }else await page.getByRole('button',{name:'E 테이블 경기 보기',exact:true}).click()
 await expect(page.locator('.omok-spectator-hud')).toBeVisible()
 await expect(page.getByRole('dialog',{name:'테이블 정보',exact:true})).toHaveCount(0)
 const session=await page.evaluate(async()=>{const s=(await import('/src/network/worldClient.ts' as string)).useSession.getState();return{bench:s.benchId,table:s.tableId}})
 expect(session.table).toBe('');expect(!!session.bench).toBe(seated)
 for(const viewport of [{width:1920,height:1080},{width:390,height:844}]){
  await page.setViewportSize(viewport)
  const chat=page.getByRole('form',{name:'오목 관전 채팅',exact:true})
  expect((await chat.boundingBox())!.width).toBeLessThanOrEqual(280)
  // The production spectator channel permits one message per second.
  await page.waitForTimeout(1050)
  await page.locator('canvas').focus();await page.keyboard.press('Enter')
  await chat.getByRole('textbox').fill('작은 채팅창에서도 관전 대화')
  await chat.getByRole('textbox').press('Enter');await expect(chat.getByRole('status')).toHaveText('전달 요청이 승인됐어요.')
  await screenshot(page,`feedback-watch-${seated?'seated':'standing'}-${viewport.width}`)
  await chat.getByRole('textbox').press('Escape')
 }
 expect(server.sent.some(m=>m.type==='TABLE_JOIN'||m.type==='GAME_ACTION_SEND')).toBe(false)
 await page.getByRole('button',{name:'관전 종료',exact:true}).click()
 await expect(page.locator('.omok-spectator-hud')).toHaveCount(0)
 await expect(page.getByRole('dialog',{name:'테이블 정보',exact:true})).toHaveCount(0)
})
for(const code of ['ONE_CARD','DICE_LEDGER'] as const)test(`new map ${code} forfeit throws separate pieces and removes every asset after 15 seconds`,async({page})=>{
 const server=await fixture(page,{generatedPark:true,omok:true,manualLobby:true,tabletServer:true,forfeit:true,parkDebris:true,
  ...(code==='ONE_CARD'?{onecard:2 as const}:{ledger:2 as const})})
 await load(page);const tablet=await prepare(page,code);server.readyTabletOthers(true)
 await tablet.getByRole('button',{name:'게임 시작',exact:true}).click()
 await expect(page.getByRole('button',{name:'기권',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'기권',exact:true}).click()
 await page.getByRole('button',{name:'기권 확정',exact:true}).click()
 await expect.poll(async()=>(await visual(page)).debris[0]?.pieces).toBe(code==='ONE_CARD'?14:5)
 expect(server.debris()[0]!.parts).toHaveLength(code==='ONE_CARD'?27:18)
 await expect.poll(async()=>{const p=(await visual(page)).debris[0];return !!p&&p.pieceHeight>1.4&&p.sourceVisible===false},{intervals:[25]}).toBe(true)
 await screenshot(page,`feedback-${code}-pieces-flying`)
 await expect.poll(async()=>(await visual(page)).debris[0]?.visible,{timeout:20000,intervals:[100,250,500]}).toBe(false)
 await expect.poll(async()=>(await visual(page)).debris[0]?.present,{timeout:2000}).toBe(false)
 await screenshot(page,`feedback-${code}-after-15s`)
})
