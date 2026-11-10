import {test,expect,type Page} from '@playwright/test'
const inventory={tickets:2,balance:1000,availableBalance:1000,boxes:[1,2,3,4].map(grade=>({grade,quantity:1}))}
async function setup(page:Page,duplicate=false){
 const parts=[['갓',['HAIR']],['얼굴',['FACE']],['검수 의상',['TOP','BOTTOM','SHOES']]] as const
 const product={code:'TEST_SET',name:'로컬 검수 세트',grade:2,compatibility:'MALE',imageKey:'skin/ssafy-black-male/v3',itemIds:[1,2,3,4,5],components:duplicate?[]:parts.map(([name,slots],i)=>({id:'part-'+i,name,imageKey:'',slots,itemIds:i===0?[1]:i===1?[2]:[3,4,5]}))}
 const machine={roundId:'1',version:1,remaining:30,refillEndsAt:null,prizes:[1,2,4,8,15].map((initial,i)=>({grade:i+1,initial,remaining:initial,value:100}))}
 await page.route('**/api/v1/gacha',r=>r.fulfill({json:{enabled:true,ticketPrice:100,serverNow:new Date().toISOString(),inventory,products:[product],machine}}))
 await page.route('**/api/v1/gacha/boxes/open',r=>r.fulfill({json:{operationId:r.request().postDataJSON().operationId,kind:'OPEN',roundId:null,grade:2,product,duplicate,paidCoins:0,awardedCoins:duplicate?250:0,inventory,completedAt:new Date().toISOString()}}))
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/tests/fixtures/gacha-result.html')
 await page.getByRole('button',{name:'A급 캡슐 1개 보유',exact:true}).click();await page.getByRole('button',{name:'열기',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'의상 캡슐 개봉'});await expect(dialog.getByRole('button',{name:'확인',exact:true})).toBeVisible({timeout:60000});return dialog
}
for(const size of [{width:1920,height:1080},{width:1366,height:650},{width:1280,height:600},{width:800,height:600},{width:390,height:720}])test('100% 화면에서 결과·등급·하단 버튼이 보인다 '+size.width+'x'+size.height,async({page})=>{
 await page.setViewportSize(size);const dialog=await setup(page)
 await expect(dialog.getByRole('heading',{name:'A급',exact:true})).toBeVisible();await expect(dialog).not.toContainText('나를 찾아온 작은 행운');await expect(dialog).not.toContainText('나의 옷장');await expect(dialog.locator('.open-parts')).toHaveText('머리 · 얼굴 · 옷')
 const box=(await dialog.boundingBox())!;expect(box.width).toBeLessThan(size.width*.95);expect(box.height).toBeLessThanOrEqual(size.height*.79)
 for(const button of await dialog.locator('.open-result-actions button').all()){const b=(await button.boundingBox())!;expect(b.y).toBeGreaterThan(box.y);expect(b.y+b.height).toBeLessThanOrEqual(box.y+box.height);await expect(button).toBeInViewport()}
 const color=await dialog.locator('.open-component-rewards strong').first().evaluate(el=>getComputedStyle(el).color);expect(color).toBe('rgb(51, 43, 32)')
 if(size.width===1366){await expect(dialog.locator('.open-asset-message')).toBeHidden({timeout:20000});await page.screenshot({path:'../output/gacha-result-1366.png'})}
 await dialog.getByRole('button',{name:'확인',exact:true}).click();await expect(dialog).toBeHidden()
})
test('중복 환급과 입어 보기에서도 버튼이 보이고 결과창을 닫는다',async({page})=>{
 const dialog=await setup(page,true);await expect(dialog).toContainText('250냥');await expect(dialog).toContainText('이미 보유 중');await expect(dialog.locator('.open-parts')).toHaveText('머리 · 얼굴 · 옷')
 await dialog.getByRole('button',{name:'옷장에서 입어 보기',exact:true}).click();await expect(dialog).toBeHidden()
})
