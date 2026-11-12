import {test,expect,type Page} from '@playwright/test'
import {parkFixture} from './fixture'
import {fixture,screenshot} from '../e2e/contractFixture'

async function load(page:Page){
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
}
async function openFish(page:Page){
  const server=await parkFixture(page);await load(page);
  const stand=await page.evaluate(async()=>{
    const {bungeoppangService}=await import('/src/features/bungeoppang/service.ts' as string);
    const {createV5PreviewService}=await import('/src/features/bungeoppang/serviceV5Preview.ts' as string);
    Object.assign(bungeoppangService,createV5PreviewService(()=>.5));
    const {bungeoppangView}=await import('/src/features/bungeoppang/bungeoppangView.ts' as string);
    return {x:bungeoppangView.standX,y:.8,z:bungeoppangView.standZ,yaw:Math.PI};
  });
  server.place(stand);
  await page.getByRole('button',{name:'E 붕어빵 굽기',exact:true}).click();
}
const errors=new WeakMap<Page,string[]>()
test.beforeEach(({page})=>{
  const messages:string[]=[];errors.set(page,messages)
  page.on('pageerror',error=>messages.push(error.message))
  page.on('console',message=>{if(message.type()==='error')messages.push(message.text())})
})
test.afterEach(async({page})=>{
  expect(errors.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('F1 pauses a solo minigame clock and cooking until the manual closes',async({page})=>{
  await openFish(page);
  await page.getByRole('button',{name:'시작',exact:true}).click();
  await expect.poll(()=>page.evaluate(async()=>(await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState().phase),{timeout:15000}).toBe('play');
  await page.locator('canvas').focus();await page.keyboard.press('KeyQ');await page.keyboard.press('Digit1');await page.keyboard.press('KeyQ');
  await page.keyboard.press('F1');
  const manual=page.getByRole('dialog',{name:'게임 설명서',exact:true});
  await expect(manual).toHaveAttribute('data-phase','open');
  await expect(manual).toContainText('미니게임 시간이 멈춰요');
  const time=()=>page.evaluate(async()=>(await import('/src/features/bungeoppang/bungeoppangView.ts' as string)).gameNow());
  const paused=await time();await page.waitForTimeout(1500);expect(await time()).toBe(paused);
  await screenshot(page,'minigame-f1-paused');
  await page.keyboard.press('Escape');await expect(manual).not.toBeVisible();
  await expect.poll(time).toBeGreaterThan(paused+500);
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'그만두기',exact:true}).click();
});

test('minigame result is compact, uses plain score copy and opens a score/combo ranking',async({page})=>{
  await openFish(page);
  await page.route('**/api/v1/minigames/bungeoppang/rankings?**',route=>{
    const at='2026-10-31T00:00:00Z',best={rank:1,userId:'102',nickname:'최고 기록',score:1300,maxCombo:15,completedAt:at};
    const me={rank:3,userId:'101',nickname:'나',score:1230,maxCombo:12,completedAt:at};
    return route.fulfill({json:{rulesVersion:'v5',durationMs:120000,period:'ALL_TIME',basis:'PERSONAL_BEST',snapshotId:'ui-result',updatedAt:at,totalParticipants:3,
      items:[best,{...best,userId:'103',nickname:'공동 순위'},me],me,nextCursor:null}});
  });
  await page.evaluate(async()=>{
    const {useBungeoppang}=await import('/src/features/bungeoppang/store.ts' as string);
    const {createGrill}=await import('/src/features/bungeoppang/rulesV5.ts' as string);
    const {BUNGEOPPANG_V5:R}=await import('/src/features/bungeoppang/config.ts' as string);
    const orders=[{orderId:'1',customerSlot:0,availableAfterSeq:0,items:{bean:2,custard:0,pizza:0,chocolate:0}}];
    useBungeoppang.setState({phase:'result',gameId:'result-ui',rules:{...R},grill:{...createGrill(Array(2048).fill(100),orders,R),made:15,score:1230,maxCombo:12},
      result:{score:1230,made:15,failed:1,golden:10,wasted:0,maxCombo:12,coinsCalculated:246,coinsGranted:246,todayEarned:246,dailyCap:1000,capReached:false},submitting:false});
  });
  const result=page.getByRole('dialog',{name:'붕어빵 결과',exact:true});
  await expect(result).toContainText('3위');await expect(result).not.toContainText('서버 확정');
  await result.locator('summary').click();await expect(result).not.toContainText('서버 정산 완료');
  await expect(result).toContainText('최고 콤보 12');
  await expect(result).toContainText('5점당 1냥');
  await page.evaluate(async()=>{const {useBungeoppang}=await import('/src/features/bungeoppang/store.ts' as string);useBungeoppang.setState(()=>({rules:{...useBungeoppang.getState().rules!,pointsPerCoin:15}}))});
  await expect(result).toContainText('15점당 1냥');
  await page.evaluate(async()=>{const {useBungeoppang}=await import('/src/features/bungeoppang/store.ts' as string);useBungeoppang.setState(()=>({rules:{...useBungeoppang.getState().rules!,pointsPerCoin:5}}))});
  await expect(result).toContainText('받은 엽전 246냥');
  for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:390,height:844}]){
    await page.setViewportSize(viewport);const box=(await result.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(480);expect(box.y).toBeGreaterThanOrEqual(0);
    expect(await result.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    const fish=(await result.locator('.bung-result-hero img').boundingBox())!;
    const stats=(await result.locator('.paper-stats').boundingBox())!;
    expect(fish.height).toBeLessThanOrEqual(96);expect(fish.y+fish.height).toBeLessThanOrEqual(stats.y);
    await screenshot(page,'minigame-result-'+viewport.width,'disabled');
  }
  await result.getByRole('button',{name:'랭킹 보기',exact:true}).click();
  const ranking=page.getByRole('dialog',{name:'붕어빵 전체 랭킹',exact:true});
  await expect(ranking.getByRole('columnheader',{name:'점수',exact:true})).toBeVisible();
  await expect(ranking.getByRole('columnheader',{name:'최대 콤보',exact:true})).toBeVisible();
  await expect(ranking.locator('tbody tr')).toHaveCount(3);await screenshot(page,'minigame-score-ranking');
});

test('preparation hides the scrollbar, keeps wheel scrolling and simplifies the shortcuts',async({page})=>{
  const server=await parkFixture(page)
  await load(page)
  const stand=await page.evaluate(async()=>{
    const {bungeoppangService}=await import('/src/features/bungeoppang/service.ts' as string)
    const {createV5PreviewService}=await import('/src/features/bungeoppang/serviceV5Preview.ts' as string)
    Object.assign(bungeoppangService,createV5PreviewService(()=>.5))
    const {bungeoppangView}=await import('/src/features/bungeoppang/bungeoppangView.ts' as string)
    return {x:bungeoppangView.standX,y:.8,z:bungeoppangView.standZ,yaw:Math.PI}
  })
  server.place(stand)
  await page.getByRole('button',{name:'E 붕어빵 굽기',exact:true}).click()
  const panel=page.getByRole('region',{name:'붕어빵 굽기 시작',exact:true})
  const keys=page.getByRole('region',{name:'붕어빵 단축키 안내'})
  await expect(keys).not.toContainText('각 틀을 클릭')
  await expect(keys).not.toContainText('양면을 구워 꺼낸 뒤')
  await expect(keys.locator('.bung-start-fillings p')).toHaveText('Space 반죽 선택')
  await expect(keys.locator('kbd')).toHaveText(['Q','W','E','A','S','D','1','2','3','4','Space','R'])
  for(const viewport of [{width:1920,height:1080},{width:1280,height:720},{width:390,height:844}]){
    await page.setViewportSize(viewport)
    await expect(panel).toBeVisible()
    const size=(await panel.boundingBox())!
    expect(size.x).toBeGreaterThanOrEqual(0);expect(size.y).toBeGreaterThanOrEqual(0)
    expect(size.x+size.width).toBeLessThanOrEqual(viewport.width)
    expect(size.y+size.height).toBeLessThanOrEqual(viewport.height)
    expect(await panel.evaluate(el=>getComputedStyle(el).scrollbarWidth)).toBe('none')
    expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
    await screenshot(page,'fish-ready-'+viewport.width,'disabled')
  }
  await panel.evaluate(el=>{el.scrollTop=0})
  const box=(await panel.boundingBox())!
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2)
  await page.mouse.wheel(0,1000)
  await expect.poll(()=>panel.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
  const start=panel.getByRole('button',{name:'시작',exact:true})
  await start.scrollIntoViewIfNeeded();await expect(start).toBeInViewport()
  await screenshot(page,'fish-ready-mobile-actions','disabled')
  await start.click()
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase',/countdown|play/)
  await expect.poll(()=>page.evaluate(async()=>(await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState().phase),{timeout:15000}).toBe('play')
  await page.mouse.move(195,420)
  await page.mouse.wheel(0,80)
  await expect.poll(()=>page.evaluate(async()=>(await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState().tool)).not.toBe('batter')
  await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'그만두기',exact:true}).click()
  await expect(page.locator('.bung-root')).toHaveCount(0)
})

test('shop menu is mounted on the outside counter and stays readable in daylight and at night',async({page})=>{
  const server=await parkFixture(page)
  await load(page)
  const stand=await page.evaluate(async()=>{
    const {MINI_PROPS}=await import('/src/park/mapConfig.ts' as string)
    const {setCameraPerspective,viewControls}=await import('/src/world/cameraPerspective.ts' as string)
    const cart=MINI_PROPS[0],yaw=cart.yaw
    setCameraPerspective('third-person');Object.assign(viewControls,{yaw,pitch:.12,distance:9})
    const distance=cart.depth/2+5.8
    return {x:cart.x+Math.sin(yaw)*distance,y:.8,z:cart.z+Math.cos(yaw)*distance,yaw:yaw+Math.PI}
  })
  server.place(stand)
  await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).renderedOwnPosition()?.[0])).toBeCloseTo(stand.x,0)
  let previous:number[]|null=null
  await expect.poll(async()=>{
    const p:number[]=await page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).cameraPosition())
    const delta=previous?Math.hypot(...p.map((n,i)=>n-previous![i]!)):Infinity;previous=p;return delta
  }).toBeLessThan(.01)
  const menu=await page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).fishShopMenuProbe())
  expect(menu.localPosition[2]).toBeGreaterThan(3.3)
  expect(menu.localPosition[1]).toBeLessThan(1.5)
  expect(menu.firstSurface).toBe('prop-sign-fishMenuSign')
  for(const night of [false,true]){
    await page.evaluate(async night=>{
      const {environmentClock,environmentConfig}=await import('/src/world/environmentState.ts' as string)
      const {ENVIRONMENT}=await import('/src/config/environment.ts' as string)
      environmentClock.reset();Object.assign(environmentConfig,ENVIRONMENT)
      environmentClock.sync(ENVIRONMENT.epochMs+ENVIRONMENT.dayDurationMs*(night?.02:.5),performance.now())
    },night)
    await expect(page.getByLabel('현재 위치와 공원 시간')).toContainText(night?'밤':'낮')
    await screenshot(page,night?'fish-menu-night':'fish-menu-day')
  }
})

for(const count of [2,4] as const)test(`${count}-player result stays compact and supports close and reopen`,async({page})=>{
  const server=await fixture(page,{generatedPark:true,omok:true,manualLobby:true,tabletServer:true,...(count===4?{onecard:4 as const}:{}),
    publicProfiles:{'102':{nickname:'아주 긴 닉네임으로 참가한 공원 산책자'}}})
  await load(page)
  await page.getByRole('button',{name:'E 테이블에 앉기',exact:true}).click()
  const tablet=page.getByRole('dialog',{name:'게임 태블릿',exact:true})
  if(count===4){
    await tablet.getByRole('button',{name:/^원카드/}).click()
    await tablet.getByRole('button',{name:'4인',exact:true}).click()
  }
  await tablet.getByLabel('1인 참가비').fill('25')
  await tablet.getByRole('button',{name:'선택하고 준비하기'}).click()
  await tablet.getByRole('checkbox',{name:'참가 금액을 확인했어요'}).check()
  await tablet.getByRole('button',{name:'준비 완료',exact:true}).click();server.readyTabletOthers(true)
  await tablet.getByRole('button',{name:'게임 시작',exact:true}).click()
  await expect(page.getByRole('region',{name:count===4?'원카드 경기':'오목 경기',exact:true})).toBeVisible()
  if(count===2){
    const pauses:string[]=[];page.on('request',request=>{if(request.url().endsWith('/manual-pause'))pauses.push(request.url())});
    await page.keyboard.press('F1');
    const manual=page.getByRole('dialog',{name:'게임 설명서',exact:true});
    await expect(manual).toContainText('제한시간은 멈추지 않아요.');
    await page.keyboard.press('Escape');await expect(manual).not.toBeVisible();expect(pauses).toEqual([]);
  }
  if(count===4)server.cardSnapshot({status:'FINISHED',stage:'FINISHED',turnUserId:null,turnDeadline:null,winnerUserIds:['101'],endReason:'LAST_PLAYER_STANDING',endedAt:new Date().toISOString()})
  server.finishGame();server.settle()
  const result=page.getByRole('dialog',{name:'경기 결과',exact:true})
  await expect(result).toBeVisible()
  await expect(result.getByRole('listitem')).toHaveCount(count)
  for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:390,height:844}]){
    await page.setViewportSize(viewport)
    const box=(await result.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(430)
    expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height)
    expect(await result.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
    const leave=result.getByRole('button',{name:'자리에서 일어나기',exact:true})
    await leave.scrollIntoViewIfNeeded();await expect(leave).toBeInViewport()
    await screenshot(page,`board-result-${count}-${viewport.width}`,'disabled')
  }
  await result.getByRole('button',{name:'결과 창 닫기',exact:true}).click()
  await expect(result).toHaveCount(0)
  await page.getByRole('button',{name:'경기 결과 다시 보기',exact:true}).click()
  await expect(result).toBeVisible()
  await page.keyboard.press('Escape');await expect(result).toHaveCount(0)
})
