import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'
import { BENCH_PAVILIONS } from '../../src/config'
import { PARK_LAYOUT } from '../../src/map/park'
import { generatedFacilityCatalog } from './fixture'

const errors=new WeakMap<Page,string[]>()
test.beforeEach(({page})=>{
  const messages:string[]=[]; errors.set(page,messages)
  page.on('pageerror',e=>messages.push(e.message))
  page.on('console',m=>{if(m.type()==='error')messages.push(m.text())})
})
test.afterEach(async({page})=>{
  expect(errors.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
async function load(page:Page){
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
}
const probe=(page:Page):Promise<ReturnType<typeof import('./omokPolishProbe').omokPolishProbe>>=>page.evaluate(async()=>(await import('/tests/park-integration/omokPolishProbe.ts' as string)).omokPolishProbe())
const ready=(page:Page)=>expect.poll(()=>page.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).omokCameraProbe().ready)).toBe(true)
async function stableCamera(page:Page){
  let previous:number[]|null=null
  await expect.poll(async()=>{
    const position:number[]=await page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).cameraPosition())
    const distance=previous?Math.hypot(...position.map((v,i)=>v-previous![i]!)):Infinity
    previous=position; return distance
  }).toBeLessThan(.005)
}

for(const own of ['101','102'] as const) test(`${own} 좌석에서 내 차례와 임박 시간을 구분하고 판 안의 네 모서리에 정확히 착수한다`,async({page})=>{
  const server=await fixture(page,{generatedPark:true,omok:true,ownUserId:own,manualLobby:true,tabletServer:true})
  await load(page)
  await page.getByRole('button',{name:'E 테이블에 앉기',exact:true}).click(); server.host(own)
  const tablet=page.getByRole('dialog',{name:'게임 태블릿',exact:true})
  await tablet.getByLabel('1인 참가비').fill('1')
  await tablet.getByRole('button',{name:'선택하고 준비하기'}).click()
  await tablet.getByRole('checkbox',{name:'참가 금액을 확인했어요'}).check()
  await tablet.getByRole('button',{name:'준비 완료',exact:true}).click(); server.readyTabletOthers(true)
  await tablet.getByRole('button',{name:'게임 시작',exact:true}).click()
  server.omokColors(own); await ready(page)
  const clock=page.getByLabel('남은 착수 시간',{exact:true})
  await expect(clock).toHaveAttribute('data-my-turn','true')
  await expect(clock).toContainText('지금 착수하세요')
  await expect(clock.locator('strong')).toHaveCSS('font-size','54px')
  const activeBackground=await clock.evaluate(el=>getComputedStyle(el).backgroundImage)
  expect(activeBackground).toContain('linear-gradient')
  const geometry=await probe(page)
  const clockBox=(await clock.boundingBox())!
  expect(Math.min(...geometry.frameCorners.map(p=>p.y))).toBeGreaterThan(clockBox.y+clockBox.height+6)
  expect(geometry.coordinateBounds.minX).toBeGreaterThan(geometry.surfaceBounds.minX+.008)
  expect(geometry.coordinateBounds.maxX).toBeLessThan(geometry.surfaceBounds.maxX-.008)
  expect(geometry.coordinateBounds.minZ).toBeGreaterThan(geometry.surfaceBounds.minZ+.008)
  expect(geometry.coordinateBounds.maxZ).toBeLessThan(geometry.surfaceBounds.maxZ-.008)
  expect(geometry.bowls).toHaveLength(2)
  for(const bowl of geometry.bowls){
    expect(Math.max(Math.abs(bowl.minX),Math.abs(bowl.maxX))).toBeLessThan(1.05)
    expect(Math.min(Math.abs(bowl.minX),Math.abs(bowl.maxX))).toBeGreaterThan(.8)
  }
  for(const [index,cell] of [[0,0],[14,0],[0,14],[14,14]].entries()){
    server.turnTo(own); await expect(clock).toHaveAttribute('data-my-turn','true'); await ready(page)
    const point=(await probe(page)).corners[index]!
    await page.mouse.click(point.x,point.y)
    await expect.poll(()=>server.sent.filter(m=>m.type==='GAME_ACTION_SEND').length).toBe(index+1)
    expect(server.sent.filter(m=>m.type==='GAME_ACTION_SEND')[index]!.payload.input).toEqual({x:cell[0],y:cell[1]})
  }
  server.turnTo(own); await expect(clock).toHaveAttribute('data-my-turn','true')
  await screenshot(page,`omok-qa-player-${own}`)
  server.turnTo(own==='101'?'102':'101')
  await expect(clock).toHaveAttribute('data-my-turn','false')
  expect(await clock.evaluate(el=>getComputedStyle(el).backgroundImage)).not.toBe(activeBackground)
  server.turnTo(own,new Date(Date.now()+8500).toISOString())
  await expect(clock).toHaveAttribute('data-urgent','true')
  await page.emulateMedia({reducedMotion:'reduce'})
  await expect(clock).toHaveCSS('animation-name','none')
  await screenshot(page,`omok-qa-urgent-${own}`)
  server.turnTo(own,new Date(Date.now()-1000).toISOString())
  await expect(clock).toContainText('종료 판정 대기')
  await expect(page.getByRole('region',{name:'오목 경기',exact:true})).toBeVisible()
  expect(server.sent.filter(m=>m.type==='GAME_ACTION_SEND')).toHaveLength(4)
})

test('관전 도구와 접이식 채팅이 판을 가리지 않고 시점 전환·추천·채팅·종료를 유지한다',async({page})=>{
  const server=await fixture(page,{generatedPark:true,omok:true,publicSpectator:true,ownUserId:'505',spectatorEvents:true})
  await load(page); await page.getByRole('button',{name:'E 관전하기',exact:true}).click()
  await expect(page.getByLabel('오목 관전 경기 정보',{exact:true})).toBeVisible(); await ready(page)
  const toolbar=page.locator('.omok-spectator-toolbar'), chat=page.getByRole('region', { name: '경기 채팅',exact:true})
  await expect(toolbar.getByRole('button')).toHaveText(['주변 보기','판 보기','게임 설명 · F1','관전 종료'])
  await expect(toolbar.locator('details,summary,.omok-spectator-meta,.omok-ping-status')).toHaveCount(0)
  await expect(chat.getByRole('textbox')).toBeHidden()
  expect((await toolbar.boundingBox())!.width).toBeLessThanOrEqual(641)
  await page.getByRole('button',{name:'주변 보기',exact:true}).click()
  await stableCamera(page)
  await screenshot(page,'omok-qa-spectator-surroundings')
  await page.getByRole('button',{name:'판 보기',exact:true}).click(); await ready(page)
  for(const size of [{width:1920,height:1080},{width:1366,height:768},{width:390,height:844}]){
    await page.setViewportSize(size)
    await expect.poll(async()=>{
      const frame=(await probe(page)).frameCorners
      const header=(await page.getByLabel('오목 관전 경기 정보',{exact:true}).boundingBox())!, bottom=(await toolbar.boundingBox())!
      return frame.every(p=>p.x>0&&p.x<size.width&&p.y>header.y+header.height&&p.y<bottom.y)
    }).toBe(true)
    await expect(toolbar.getByRole('button',{name:'관전 종료',exact:true})).toBeInViewport()
    await screenshot(page,`omok-qa-spectator-board-${size.width}`)
    await expect(toolbar.getByRole('button')).toHaveCount(4)
    await expect(toolbar.locator('details,summary')).toHaveCount(0)
    await toolbar.getByRole('button',{name:'주변 보기',exact:true}).focus()
    await page.keyboard.press('Tab')
    await expect(toolbar.getByRole('button',{name:'판 보기',exact:true})).toBeFocused()
    await expect(page.getByRole('button',{name:'판 보기',exact:true})).toHaveAttribute('aria-pressed','true')
    await chat.getByRole('button',{name:'채팅 입력창 열기',exact:true}).click()
    await expect(chat.getByRole('textbox')).toBeFocused()
    await chat.getByRole('textbox').fill('좋은 수예요')
    await expect(chat.getByRole('button',{name:'메시지 보내기',exact:true})).toBeEnabled()
    if(size.width===390){
      await expect.poll(async()=>{
        const frame=(await probe(page)).frameCorners, bounds=(await chat.boundingBox())!
        return frame.every(p=>p.y>bounds.y+bounds.height)
      }).toBe(true)
      await screenshot(page,'omok-qa-spectator-mobile-chat')
    }
    await page.keyboard.press('Escape')
    await expect(chat.getByRole('textbox')).toBeHidden()
  }
  await page.setViewportSize({width:1920,height:1080}); await ready(page)
  await page.locator('canvas').focus(); await page.keyboard.press('Enter')
  await expect(chat.getByRole('textbox')).toBeFocused()
  await chat.getByRole('textbox').fill('중앙을 살펴보세요'); await chat.getByRole('button',{name:'메시지 보내기',exact:true}).click()
  await expect.poll(()=>server.sent.filter(m=>m.type==='GAME_SPECTATOR_CHAT_SEND').length).toBe(1)
  await expect(chat.getByRole('textbox')).toHaveCount(0); await page.keyboard.press('Escape')
  await ready(page)
  const corners=(await probe(page)).corners
  await page.mouse.click((corners[0]!.x+corners[3]!.x)/2,(corners[0]!.y+corners[3]!.y)/2)
  await expect.poll(()=>server.sent.filter(m=>m.type==='OMOK_SPECTATOR_PING_SEND').length).toBe(1)
  expect(server.sent.filter(m=>m.type==='GAME_ACTION_SEND')).toHaveLength(0)
  await page.getByRole('button',{name:'관전 종료',exact:true}).click()
  await expect(page.getByLabel('오목 관전 경기 정보',{exact:true})).toHaveCount(0)
  await expect.poll(()=>server.sent.filter(m=>m.type==='GAME_UNWATCH').length).toBe(1)
})

test('팔각정 벤치에서도 관전 도구와 판 외형을 표시하고 관전 종료 후 벤치로 돌아온다',async({page})=>{
  const benchId='bench-'+BENCH_PAVILIONS.indexOf('P1')
  const bench=generatedFacilityCatalog.facilities.find(f=>f.facilityId===benchId)!
  const anchor=PARK_LAYOUT.DRAFT_TABLES.find(t=>t.pavilionId==='P1')!
  const server=await fixture(page,{generatedPark:true,omok:true,publicSpectator:true,ownUserId:'505',
    anchorId:anchor.id,position:bench.center,manualMovement:true})
  await load(page)
  expect(await page.evaluate(async id=>(await import('/src/features/interactions/benchController.ts' as string)).sitBench(id,0),benchId)).toBe(true)
  await page.getByRole('button',{name:'가까이 관전',exact:true}).click()
  await expect(page.getByLabel('오목 관전 경기 정보',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'주변 보기',exact:true}).click(); await stableCamera(page)
  await screenshot(page,'omok-qa-pavilion-spectator')
  await page.getByRole('button',{name:'판 보기',exact:true}).click(); await ready(page)
  const frame=await probe(page)
  expect(frame.coordinateBounds.minX).toBeGreaterThan(frame.surfaceBounds.minX)
  await screenshot(page,'omok-qa-pavilion-board')
  await page.getByRole('button',{name:'관전 종료',exact:true}).click()
  await expect(page.getByLabel('오목 관전 경기 정보',{exact:true})).toHaveCount(0)
  await expect.poll(()=>page.evaluate(async()=>(await import('/src/network/worldClient.ts' as string)).useSession.getState().benchId)).toBe(benchId)
  expect(server.sent.filter(m=>m.type==='GAME_ACTION_SEND')).toHaveLength(0)
})
