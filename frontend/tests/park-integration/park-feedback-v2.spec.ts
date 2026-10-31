import {test,expect,type Page} from '@playwright/test'
import {fixture,screenshot} from '../e2e/contractFixture'

const errors=new WeakMap<Page,string[]>()
test.beforeEach(({page})=>{
 const messages:string[]=[];errors.set(page,messages)
 page.on('pageerror',e=>messages.push(e.message))
 page.on('console',m=>{if(m.type()==='error')messages.push(m.text())})
})
test.afterEach(async({page})=>{
 expect(errors.get(page)).toEqual([])
 await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
async function load(page:Page){
 await page.goto('/park');await expect(page).toHaveTitle('OnTop')
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
}

test('both hall signs remain clear of front beams across the entire lettering face',async({page})=>{
 await fixture(page,{generatedPark:true});await load(page)
 for(const name of ['layout-vr-sign','layout-folk-sign']){
  const clear=await page.evaluate(async(name)=>{
   return (await import('/tests/park-integration/probe.ts' as string)).hallSignClearance(name)
  },name)
  expect(clear.count).toBe(1)
  expect(clear.visibleSamples).toBe(9)
  await page.evaluate(async(name)=>(await import('/tests/park-integration/probe.ts' as string)).frameHallSign(name),name)
  await screenshot(page,name+'-clear')
 }
})

for(const size of [{width:1920,height:1080},{width:390,height:844}])test(`tablet hides its scrollbar while mouse wheel reaches the final game at ${size.width}`,async({page})=>{
 await page.setViewportSize(size)
 await fixture(page,{generatedPark:true,omok:true,manualLobby:true,tabletServer:true});await load(page)
 await page.locator('canvas').focus();await page.keyboard.press('KeyE')
 const tablet=page.getByRole('dialog',{name:'게임 태블릿',exact:true}),list=tablet.getByRole('group',{name:'게임 선택',exact:true})
 await expect(tablet).toBeVisible()
 await expect.poll(()=>tablet.evaluate(el=>Number(getComputedStyle(el).opacity))).toBeGreaterThan(.99)
 expect(await list.evaluate(el=>getComputedStyle(el).scrollbarWidth)).toBe('none')
 expect(await list.evaluate(el=>getComputedStyle(el,'::-webkit-scrollbar').display)).toBe('none')
 await list.scrollIntoViewIfNeeded()
 const box=(await list.boundingBox())!
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,1000)
 await expect.poll(()=>list.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
 await expect(list.locator('.tablet-coming')).toBeInViewport()
 await screenshot(page,'tablet-hidden-scrollbar-'+size.width)
 await list.getByRole('button',{name:/원카드.*2~4인/}).click()
 await expect(tablet.locator('.tablet-selection-detail h3')).toHaveText('원카드')
})

test('a retained room discloses its game and stake before joining and requires the returning guest to agree',async({page})=>{
 const server=await fixture(page,{generatedPark:true,omok:true,manualLobby:true,tabletServer:true})
 await load(page);await page.locator('canvas').focus();await page.keyboard.press('KeyE')
 const tablet=page.getByRole('dialog',{name:'게임 태블릿',exact:true})
 await expect(tablet).toBeVisible()
 server.configureTablet({gameCode:'ONE_CARD',playerCount:2,betAmountPerPlayer:250})
 await expect(tablet.getByLabel('현재 방 설정')).toContainText('원카드 · 1인 판돈 250냥')
 await tablet.getByRole('button',{name:'일어나기',exact:true}).click();await expect(tablet).toHaveCount(0)
 server.host('102')
 await page.reload();await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 await expect(page.getByLabel('참가할 방 설정')).toHaveText('원카드 · 1인 판돈 250냥')
 await screenshot(page,'retained-room-before-seating')
 await page.evaluate(async()=>{
  const {useSession}=await import('/src/network/worldClient.ts' as string),s=useSession.getState()
  const {parkRuntime}=await import('/src/park/runtime/runtime.ts' as string)
  parkRuntime.inspectTable(s.bindings.find((b:{channelId:string})=>b.channelId===s.roomId).anchorId)
 })
 const info=page.getByRole('dialog',{name:'테이블 정보',exact:true})
 await expect(info.getByLabel('현재 방 설정')).toHaveText('원카드 · 1인 판돈 250냥')
 await info.getByRole('button',{name:'앉기',exact:true}).click()
 await expect(tablet.getByLabel('현재 방 설정')).toContainText('원카드 · 1인 판돈 250냥')
 await expect(tablet.getByRole('button',{name:'준비 완료',exact:true})).toBeDisabled()
 expect(server.sent.filter(m=>m.type==='TABLE_CONFIGURE')).toHaveLength(0)
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).tabletPortraitProbe().filter(Boolean).length)).toBe(2)
 await page.waitForTimeout(700)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 await screenshot(page,'retained-room-after-seating')
 const checkbox=tablet.getByRole('checkbox',{name:'참가 금액을 확인했어요'})
 await checkbox.check();await expect(tablet.getByRole('button',{name:'준비 완료',exact:true})).toBeEnabled()
 // A changed authoritative stake requires a fresh confirmation.
 server.configureTablet({gameCode:'ONE_CARD',playerCount:2,betAmountPerPlayer:500})
 await expect(tablet.getByLabel('현재 방 설정')).toContainText('500냥')
 await expect(checkbox).not.toBeChecked()
 await expect(tablet.getByRole('button',{name:'준비 완료',exact:true})).toBeDisabled()
 await tablet.getByRole('button',{name:'일어나기',exact:true}).click();await expect(tablet).toHaveCount(0)
})
