import { expect, test, type Page } from '@playwright/test'
import { parkFixture, identity } from './fixture'
import { screenshot } from '../e2e/contractFixture'
import { START, COURSE, COURSE_VERSION, RULES_VERSION, kstDate } from '../../src/features/jumpmap/course'

const scope={channelId:'channel-1',mapVersion:identity.mapVersion}
const money={todayEarned:0,dailyCap:500,earningsDate:kstDate()}
const status={...scope,...money,revision:0,enabled:true,courseVersion:COURSE_VERSION,rulesVersion:RULES_VERSION,isFirstRun:false,seenTips:[],activeRunId:null,bestFinishMs:null}
const failures=new WeakMap<Page,string[]>()
test.beforeEach(({page})=>{
  const errors:string[]=[]; failures.set(page,errors)
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
})
test.afterEach(async({page})=>{
  expect(failures.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
async function setup(page:Page){
  const server=await parkFixture(page)
  await page.route('**/api/v1/minigames/jumpmap/status?*',r=>r.fulfill({json:status}))
  await page.route('**/api/v1/minigames/jumpmap/tips',r=>r.fulfill({status:204}))
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden()
  await expect.poll(()=>page.evaluate(async()=>(await import('/src/features/jumpmap/state.ts' as string)).useJumpmap.getState().available)).toBe(true)
  await page.evaluate(async()=>{
    (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.5)
    const {viewControls}=await import('/src/world/cameraPerspective.ts' as string)
    viewControls.yaw=0; viewControls.pitch=.65
  })
  return server
}
const dialog=(page:Page)=>page.getByRole('dialog',{name:'돌탑 점프맵 준비 안내',exact:true})
const hint=(page:Page)=>page.getByRole('button',{name:/E 돌탑 점프맵 안내/})
async function pose(page:Page){return page.evaluate(async()=>{
  const {avatars,useSession}=await import('/src/network/worldClient.ts' as string)
  const p=avatars.get(useSession.getState().sessionId)!.current; return {x:p.x,y:p.y,z:p.z}
})}

test('돌탑 안내는 표식의 E로만 열리고 소리·랭킹·조작 설명과 닫기·입력 차단을 제공한다',async({page})=>{
  const server=await setup(page)
  server.place({x:START.x,y:START.y+.8,z:START.z+1.6,yaw:0})
  await expect(hint(page)).toBeVisible(); await expect(dialog(page)).toHaveCount(0)
  await page.locator('canvas').focus(); await page.keyboard.press('KeyE')
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page)).toContainText('소리들으며 플레이 하면 재미가 2배!!')
  await expect(dialog(page).getByLabel('타임어택 랭킹 안내')).toContainText('완주 시간')
  await expect(dialog(page)).toContainText('매번 확인하지 않고 첫 발판에서 바로 도전해도 돼요.')
  await expect(dialog(page).getByRole('img')).toBeVisible()
  expect(await dialog(page).getByRole('img').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  const before=await pose(page)
  await page.keyboard.down('w'); await page.keyboard.press('Space')
  await page.evaluate(()=>new Promise<void>(resolve=>{
    let frames=0; const sample=()=>{if(++frames>=15)resolve();else requestAnimationFrame(sample)}; requestAnimationFrame(sample)
  }))
  await page.keyboard.up('w'); expect(await pose(page)).toEqual(before)
  await dialog(page).press('Shift+Tab')
  await expect(dialog(page).getByRole('button',{name:'안내 닫고 출발하기',exact:true})).toBeFocused()
  await dialog(page).getByRole('button',{name:'안내 닫고 출발하기',exact:true}).press('Tab')
  await expect(dialog(page).getByRole('button',{name:'돌탑 안내 닫기',exact:true})).toBeFocused()
  await screenshot(page,'jumpmap-guide-desktop','disabled')
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0)
  await expect(page.locator('canvas')).toBeFocused(); expect(await pose(page)).toEqual(before)
  await hint(page).click(); await expect(dialog(page)).toBeVisible()
  await dialog(page).getByRole('button',{name:'안내 닫고 출발하기',exact:true}).click()
  await expect(dialog(page)).toHaveCount(0); expect(await pose(page)).toEqual(before)
  expect(server.requests.some(r=>/^JUMPMAP_|COIN_|WALLET_/.test(r.type))).toBe(false)
  expect(await page.evaluate(async()=>(await import('/src/features/jumpmap/state.ts' as string)).useJumpmap.getState().run)).toBeNull()
  // 상호작용 검증을 마친 뒤에만 근접 촬영용 카메라로 전환한다.
  server.place({x:START.x-1.8,y:START.y+.8,z:START.z+.7})
  await expect.poll(async()=>(await pose(page)).x).toBe(START.x-1.8)
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
  await page.evaluate(async()=>(await import('/tests/park-integration/jumpmapGuideProbe.ts' as string)).frameGuideMarker())
  await screenshot(page,'jumpmap-pagoda-marker','disabled')
  await page.evaluate(async()=>(await import('/tests/park-integration/jumpmapGuideProbe.ts' as string)).resumePark())
})

test('돌탑 안내를 건너뛰어 첫 발판에서 시작하고 낙하 후 다시 안내를 열 수 있다',async({page})=>{
  const server=await setup(page), first=COURSE[0]!
  server.place({x:first.x,y:first.top+.8,z:first.z})
  server.emit('JUMPMAP_STARTED',{...scope,...money,revision:1,runId:'guide-skip',courseVersion:COURSE_VERSION,rulesVersion:RULES_VERSION,serverTime:Date.now()})
  await expect(page.getByLabel('도전 현황',{exact:true})).toBeVisible()
  await expect(dialog(page)).toHaveCount(0); await expect(hint(page)).toHaveCount(0)
  server.emit('JUMPMAP_ENDED',{...scope,...money,revision:2,runId:'guide-skip',reason:'FALL',gatesPassed:0,elapsedMs:1000,runCoins:0,maxHeight:1})
  server.place({x:START.x,y:START.y+.8,z:START.z+1.6})
  await expect(hint(page)).toBeVisible(); await hint(page).click(); await expect(dialog(page)).toBeVisible()
  server.mismatch(); await expect(dialog(page)).toHaveCount(0)
})

test('돌탑 안내 독립 프리뷰는 작은 화면과 휠·키보드로 읽고 안내 없이도 반복 도전한다',async({page})=>{
  await page.goto('/jumpmap-preview.html'); await expect(page.getByRole('heading',{name:'돌탑 점프맵 · 반복 도전 HUD'})).toBeVisible()
  for(const size of [{width:1920,height:1080},{width:1366,height:768},{width:390,height:844}]){
    await page.setViewportSize(size)
    await page.getByRole('button',{name:'출발 안내 보기',exact:true}).click()
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByRole('button',{name:'돌탑 안내 닫기',exact:true})).toBeInViewport()
    const box=(await dialog(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(size.width)
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y+box.height).toBeLessThanOrEqual(size.height)
    await screenshot(page,`jumpmap-guide-${size.width}`,'disabled')
    const depart=dialog(page).getByRole('button',{name:'안내 닫고 출발하기',exact:true})
    if(size.width>650)await expect(depart).toBeInViewport()
    await dialog(page).hover(); await page.mouse.wheel(0,700)
    await depart.scrollIntoViewIfNeeded(); await expect(depart).toBeInViewport(); await depart.click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.getByLabel('도전 현황',{exact:true})).toHaveCount(0)
  }
  await page.getByRole('button',{name:'첫 발판 (테스트)',exact:true}).click()
  await expect(page.getByLabel('도전 현황',{exact:true})).toBeVisible()
})
