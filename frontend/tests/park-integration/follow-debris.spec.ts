import {test,expect} from '@playwright/test'
import {fixture,screenshot} from '../e2e/contractFixture'

const consoleErrors=new WeakMap<import('@playwright/test').Page,string[]>()
test.beforeEach(({page})=>{
 const errors:string[]=[];consoleErrors.set(page,errors)
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
})
test.afterEach(async({page})=>{
 expect(consoleErrors.get(page)).toEqual([])
 await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

async function load(page:import('@playwright/test').Page){
 await page.goto('/park');await expect(page).toHaveTitle('OnTop')
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
}
test('follow status stays compact and can stop without blocking chat or movement',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 const server=await fixture(page,{generatedPark:true,manualMovement:true,publicProfiles:{'102':{nickname:'장대마운틴'}}})
 await load(page)
 await expect.poll(()=>page.evaluate(async()=>(await import('/src/features/follow/state.ts' as string)).useFollow.getState().ready)).toBe(true)
 await page.evaluate(async()=>{(await import('/src/features/follow/FollowMenu.tsx' as string)).openAvatarMenu({id:'102',x:600,y:300})})
 await page.getByRole('menuitem',{name:'따라가기',exact:true}).click()
 const status=page.getByRole('complementary',{name:'따라가기 상태',exact:true})
 await expect(status).toContainText('장대마운틴')
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){
  await page.setViewportSize(viewport)
  await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
  const bounds=await status.boundingBox();expect(bounds!.height).toBeLessThan(48);expect(bounds!.width).toBeLessThan(365)
  await screenshot(page,'follow-compact-'+viewport.width)
 }
 await page.keyboard.press('Enter')
 await expect(page.getByRole('textbox',{name:'주변 채팅 메시지'})).toBeFocused()
 await page.keyboard.press('Escape')
 await status.getByRole('button',{name:'따라가기 종료'}).click()
 await expect(status).toHaveCount(0)
 expect(server.sent.some(m=>m.type==='WORLD_FOLLOW_STOP')).toBe(true)
 expect(errors).toEqual([])
})

for(const gameCode of ['OMOK','DICE_LEDGER'] as const)test(`${gameCode} duel forfeit throws the board and coins, retains them on reload and accepts per-object cleaning`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 const server=await fixture(page,{generatedPark:true,omok:true,...(gameCode==='DICE_LEDGER'?{ledger:2 as const}:{}),forfeit:true,parkDebris:true,manualLobby:true,tabletServer:true})
 await load(page)
 await page.getByRole('button',{name:'E 테이블에 앉기',exact:true}).click()
 const tablet=page.getByRole('dialog',{name:'게임 태블릿',exact:true})
 await tablet.getByLabel('1인 참가비').fill('25')
 await tablet.getByRole('button',{name:'선택하고 준비하기'}).click()
 await tablet.getByRole('checkbox',{name:'참가 금액을 확인했어요'}).check()
 await tablet.getByRole('button',{name:'준비 완료',exact:true}).click();server.readyTabletOthers(true)
 await tablet.getByRole('button',{name:'게임 시작',exact:true}).click()
 const panel=page.getByRole('region',{name:gameCode==='DICE_LEDGER'?'주사위 장부':'오목 경기',exact:true})
 await expect(panel).toBeVisible()
 const forfeitControls=gameCode==='DICE_LEDGER'?page.getByRole('navigation',{name:'게임 메뉴',exact:true}):panel
 await forfeitControls.getByRole('button',{name:'기권',exact:true}).click()
 await page.getByRole('button',{name:'기권 확정',exact:true}).click()
 const probe=()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).debrisRenderProbe())
 await expect.poll(async()=>(await probe()).length).toBe(1)
 await expect(page.getByRole('dialog',{name:'경기 결과',exact:true})).toHaveCount(0)
 await expect.poll(async()=>{const p=(await probe())[0]!;return p.visible&&!p.sourceVisible&&p.board![1]!>1.4},{intervals:[50]}).toBe(true)
 expect(server.debris()[0]!.gameCode).toBe(gameCode)
 if(gameCode==='OMOK')await expect.poll(async()=>{
  const p=(await probe())[0]!
  return p.stones.length===5&&p.stones.some((s:{position:number[]})=>Math.hypot(s.position[0]!-p.board![0]!,s.position[2]!-p.board![2]!)>.8)
 },{intervals:[50]}).toBe(true)
 await screenshot(page,gameCode+'-forfeit-board-flying')
 await expect.poll(async()=>(await probe())[0]?.settled,{timeout:10000}).toBe(true)
 await expect(page.getByRole('dialog',{name:'경기 결과',exact:true})).toBeVisible()
 const landed=(await probe())[0]!
 const partCount=gameCode==='OMOK'?18:13
 expect(landed.parts).toHaveLength(partCount)
 expect(landed.stones).toHaveLength(gameCode==='OMOK'?5:0)
 for(const stone of landed.stones)expect(Math.hypot(stone.position[0]!-landed.board![0]!,stone.position[2]!-landed.board![2]!)).toBeGreaterThan(1)
 await page.getByRole('dialog',{name:'경기 결과',exact:true}).getByRole('button',{name:'결과 창 닫기',exact:true}).click()
 await screenshot(page,gameCode+'-forfeit-park-litter')
 await page.reload()
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 await expect.poll(async()=>(await probe())[0]?.settled).toBe(true)
 expect((await probe())[0]!.board).toEqual(landed.board)
 expect((await probe())[0]!.stones).toEqual(landed.stones)
 server.cleanDebris(server.debris()[0]!.id,'coin-0')
 await expect.poll(async()=>(await probe())[0]!.parts.length).toBe(partCount-1)
 if(gameCode==='OMOK'){
  server.cleanDebris(landed.id,'stone-0')
  await expect.poll(async()=>(await probe())[0]!.stones.length).toBe(4)
  expect((await probe())[0]!.parts).toContain('board')
 }
 for(const part of [...server.debris()[0]!.parts])server.cleanDebris(landed.id,part)
 await expect.poll(async()=>(await probe()).length).toBe(0)
 expect(errors).toEqual([])
})
