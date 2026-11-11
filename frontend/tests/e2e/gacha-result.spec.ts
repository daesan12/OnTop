import {test,expect,type Page} from '@playwright/test'
const inventory={tickets:2,balance:1000,availableBalance:1000,boxes:[1,2,3,4].map(grade=>({grade,quantity:1}))}
async function setup(page:Page,duplicate=false,grade=2,animated=false,name='로컬 검수 세트'){
 const modelLoaded=page.waitForResponse(r=>r.url().includes('/ssafy-black-male-v3.glb')&&r.status()===200)
 const parts=[['갓',['HAIR']],['얼굴',['FACE']],['검수 의상',['TOP','BOTTOM','SHOES']]] as const
 const product={code:'TEST_SET',name,grade,compatibility:'MALE',imageKey:'skin/ssafy-black-male/v3',itemIds:[1,2,3,4,5],components:duplicate?[]:parts.map(([name,slots],i)=>({id:'part-'+i,name,imageKey:'',slots,itemIds:i===0?[1]:i===1?[2]:[3,4,5]}))}
 const machine={roundId:'1',version:1,remaining:30,refillEndsAt:null,prizes:[1,2,4,8,15].map((initial,i)=>({grade:i+1,initial,remaining:initial,value:100}))}
 await page.route('**/api/v1/gacha',r=>r.fulfill({json:{enabled:true,ticketPrice:100,serverNow:new Date().toISOString(),inventory,products:[product],machine}}))
 await page.route('**/api/v1/gacha/boxes/open',r=>r.fulfill({json:{operationId:r.request().postDataJSON().operationId,kind:'OPEN',roundId:null,grade,product,duplicate,paidCoins:0,awardedCoins:duplicate?250:0,inventory,completedAt:new Date().toISOString()}}))
 await page.emulateMedia({reducedMotion:animated?'no-preference':'reduce'});await page.goto('/tests/fixtures/gacha-result.html')
 await page.getByRole('button',{name:`${['','S','A','B','C'][grade]}급 캡슐 1개 보유`,exact:true}).click();await page.getByRole('button',{name:'열기',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'의상 캡슐 개봉'});await expect(dialog.getByRole('button',{name:'확인',exact:true})).toBeVisible({timeout:60000});await modelLoaded;await page.waitForTimeout(300);return dialog
}
for(const size of [{width:1920,height:1080},{width:1366,height:650},{width:1280,height:600},{width:800,height:600},{width:390,height:720}])test('100% 화면에서 결과·등급·하단 버튼이 보인다 '+size.width+'x'+size.height,async({page})=>{
 await page.setViewportSize(size);const dialog=await setup(page)
 await expect(dialog.getByRole('heading',{name:'A급 캡슐 오픈!',exact:true})).toBeVisible();await expect(dialog).not.toContainText('나를 찾아온 작은 행운');await expect(dialog).not.toContainText('나의 옷장');await expect(dialog).not.toContainText('보유 엽전');await expect(dialog.locator('.open-parts')).toHaveText('착용 부위: 머리 · 얼굴 · 옷')
 const box=(await dialog.boundingBox())!;expect(box.width).toBeLessThan(size.width*.95);expect(box.height).toBeLessThanOrEqual(size.height*.89)
 for(const button of await dialog.locator('.open-result-actions button').all()){const b=(await button.boundingBox())!;expect(b.y).toBeGreaterThan(box.y);expect(b.y+b.height).toBeLessThanOrEqual(box.y+box.height);await expect(button).toBeInViewport()}
 await expect(dialog.locator('.open-grade-seal')).toHaveCount(0);await expect(dialog.locator('.open-component-rewards')).toHaveCount(0)
 if(size.width===1366){await expect(dialog.locator('.open-asset-message')).toBeHidden({timeout:20000});const canvas=(await dialog.locator('.open-center-art canvas').boundingBox())!;expect(canvas.width).toBeGreaterThan(100);expect(canvas.height).toBeGreaterThan(80);await page.screenshot({path:'../output/gacha-result-1366.png'})}
 await dialog.getByRole('button',{name:'확인',exact:true}).click();await expect(dialog).toBeHidden()
})
for(const [grade,tier] of [[1,'S'],[2,'A'],[3,'B'],[4,'C']] as const)test(tier+'급은 입체 캡슐을 유지하고 모션 축소를 지킨다',async({page})=>{
 const dialog=await setup(page,false,grade);await expect(dialog.getByRole('heading',{name:`${tier}급 캡슐 오픈!`,exact:true})).toBeVisible()
 await expect(dialog.locator('.open-capsule-scene canvas')).toBeVisible();await expect(dialog.locator('.open-display-shell,.capsule-effects,.open-wallet')).toHaveCount(0)
 expect(await dialog.locator('.open-reveal-glow').evaluate(el=>getComputedStyle(el).animationName)).toBe('none')
 if(grade===1)await page.screenshot({path:'../output/gacha-result-S.png'})
})
test('기본 모션은 반복 효과 없이 짧게 의상을 공개한다',async({page})=>{
 const dialog=await setup(page,false,1,true);await expect(dialog.locator('.open-capsule-scene canvas')).toBeVisible()
 expect(await dialog.locator('.open-reveal-glow').evaluate(el=>getComputedStyle(el).animationIterationCount)).toBe('1')
 await expect(dialog.getByRole('button',{name:'확인',exact:true})).toBeInViewport()
})

test('중복 환급과 입어 보기에서도 버튼이 보이고 결과창을 닫는다',async({page})=>{
 const dialog=await setup(page,true);await expect(dialog).toContainText('250냥');await expect(dialog).toContainText('이미 보유 중');await expect(dialog).not.toContainText('보유 엽전');await expect(dialog.locator('.open-parts')).toHaveText('착용 부위: 머리 · 얼굴 · 옷')
 await dialog.getByRole('button',{name:'옷장에서 입어 보기',exact:true}).click();await expect(dialog).toBeHidden()
})

 test('긴 상품명도 결과의 처음부터 읽고 닫을 수 있다',async({page})=>{
 await page.setViewportSize({width:800,height:600});const dialog=await setup(page,false,2,false,'봄날의 공원 산책 의상 '.repeat(20));const card=dialog.locator('.open-result-card');await card.evaluate(el=>el.scrollTop=0);const top=(await card.boundingBox())!;const heading=(await card.locator('h3').boundingBox())!;expect(heading.y).toBeGreaterThanOrEqual(top.y);await expect(dialog.getByRole('button',{name:'확인',exact:true})).toBeInViewport();await dialog.getByRole('button',{name:'확인',exact:true}).click();await expect(dialog).toBeHidden()
 })
