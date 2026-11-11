import {expect,test} from '@playwright/test'
import {fixture} from './contractFixture'
import {entryNewsFixture} from './entryNewsFixture'
test('접속 안내 넘김·닫기·오늘 숨김·관리자 수정·순서 저장',async({page,context})=>{
 const news=await entryNewsFixture();await fixture(page);await news.attach(page);await page.goto('/park')
 // A cold Vite park bundle must finish connecting before the entry popup can open.
 const dialog=page.getByRole('dialog',{name:'온탑 새 소식'});await expect(dialog).toBeVisible({timeout:60000});await expect(dialog.getByRole('img')).toBeVisible()
 await expect(dialog).toContainText('1 / 3');await dialog.getByRole('button',{name:'다음 소식'}).click();await expect(dialog).toContainText('2 / 3')
 await dialog.getByRole('checkbox',{name:'오늘 보지 않기'}).check();await dialog.getByRole('button',{name:'닫기',exact:true}).click();await expect(dialog).toBeHidden()
 await page.reload();await expect(page.getByRole('button',{name:'알림함'})).toBeVisible();await expect(dialog).toBeHidden()
 const admin=await context.newPage();await fixture(admin);await news.attach(admin);await admin.goto('/admin/announcements');await admin.getByRole('button',{name:'접속 안내 팝업',exact:true}).click()
 await expect(admin.getByRole('heading',{name:'공원에 들어올 때 보여줄 소식'})).toBeVisible();await admin.getByRole('button',{name:'수정·미리보기'}).first().click();await admin.getByRole('textbox',{name:'안내 제목'}).fill('수정한 소식');await admin.getByRole('button',{name:'수정 저장',exact:true}).click();await expect(admin.getByRole('list')).toContainText('수정한 소식')
 await admin.getByRole('button',{name:'수정한 소식 아래로 이동'}).click();await expect(admin.getByRole('listitem').nth(1)).toContainText('수정한 소식')
 await admin.getByRole('textbox',{name:'안내 제목'}).fill('새로 등록한 소식')
 await admin.getByLabel('안내 이미지',{exact:true}).setInputFiles({name:'entry-news.png',mimeType:'image/png',buffer:news.sampleImage()})
 await expect(admin.getByRole('img',{name:'선택한 안내 이미지 미리보기'})).toBeVisible()
 await admin.getByRole('checkbox',{name:'이용자에게 게시하기'}).check()
 await admin.getByRole('button',{name:'안내 저장',exact:true}).click();await expect(admin.getByRole('list')).toContainText('새로 등록한 소식')
 await admin.screenshot({path:'../output/entry-news-admin.png'})
 await page.evaluate(()=>localStorage.removeItem('ontop:entry-news:today:101'));await page.reload()
 await expect(dialog).toBeVisible();await expect(dialog).toContainText('1 / 4');await expect(dialog.getByRole('img')).toBeVisible()
 await dialog.getByRole('button',{name:'2번째 소식',exact:true}).click()
 await expect(dialog.getByRole('img')).toHaveAttribute('src',/^https:\/\/entry-news-cdn\.test\//)
 await expect(page.locator('.park-scene-message')).toBeHidden({timeout:60000});await page.screenshot({path:'../output/entry-news-park.png',animations:'disabled'})
})
test('CDN 이미지 실패 후 같은 안내를 다시 불러올 수 있다',async({page})=>{
 const news=await entryNewsFixture();await fixture(page);await news.attach(page);let requests=0
 await page.route(`https://entry-news-cdn.test/${news.items()[0]!.id}.png`,route=>++requests===1?route.fulfill({status:503,body:''}):route.fallback())
 await page.goto('/park');const dialog=page.getByRole('dialog',{name:'온탑 새 소식'})
 await expect(dialog.getByRole('button',{name:'다시 불러오기'})).toBeVisible()
 await dialog.getByRole('button',{name:'다시 불러오기'}).click()
 await expect(dialog.getByRole('button',{name:'다시 불러오기'})).toBeHidden()
 await expect.poll(()=>dialog.getByRole('img').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBe(1200)
 expect(requests).toBeGreaterThanOrEqual(2)
})

for(const size of [{width:1920,height:1080},{width:1366,height:768},{width:1280,height:600},{width:800,height:600},{width:640,height:480}])test('접속 안내 전체 노출 '+size.width+'x'+size.height,async({page})=>{
 await page.setViewportSize(size);const news=await entryNewsFixture();await fixture(page);await news.attach(page);await page.goto('/park');const dialog=page.getByRole('dialog',{name:'온탑 새 소식'});await expect(dialog).toBeVisible({timeout:60000});await page.waitForTimeout(300)
 const box=await dialog.boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(size.width);expect(box!.y+box!.height).toBeLessThanOrEqual(size.height)
 for(const control of [dialog.getByRole('button',{name:'새 소식 닫기'}),dialog.getByRole('button',{name:'닫기',exact:true}),dialog.getByRole('checkbox',{name:'오늘 보지 않기'})]){const button=await control.boundingBox();expect(button).not.toBeNull();expect(button!.y).toBeGreaterThanOrEqual(box!.y);expect(button!.y+button!.height).toBeLessThanOrEqual(Math.min(size.height,box!.y+box!.height));expect(button!.x).toBeGreaterThanOrEqual(0);expect(button!.x+button!.width).toBeLessThanOrEqual(size.width)}
 expect(await dialog.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true)
 const scale=Math.min(size.width/1920,size.height/1080);expect(box!.width).toBeCloseTo(1120*scale,0);expect(box!.height).toBeCloseTo(878*scale,0);expect(box!.x).toBeCloseTo((size.width-box!.width)/2,0);expect(box!.y).toBeCloseTo((size.height-box!.height)/2,0)
 if(size.width===1920){expect(box!.width/box!.height).toBeCloseTo(1120/878,2);const image=await dialog.locator('.entry-news-image').boundingBox();expect(image!.width/image!.height).toBeCloseTo(16/9,2)}
 if(size.width===1366)await page.screenshot({path:'../output/entry-news-laptop-fit.png',animations:'disabled'})
})

test('오늘 숨김 뒤에도 알림 아래 이벤트 공지 버튼으로 다시 열고 숨김 설정은 유지한다',async({page})=>{
 const news=await entryNewsFixture();await fixture(page);await news.attach(page);await page.goto('/park');const dialog=page.getByRole('dialog',{name:'온탑 새 소식'}),launcher=page.getByRole('button',{name:'이벤트/공지',exact:true});await expect(dialog).toBeVisible({timeout:60000});await dialog.getByRole('checkbox',{name:'오늘 보지 않기'}).check();await dialog.getByRole('button',{name:'닫기',exact:true}).click();await page.reload();await expect(launcher).toBeEnabled({timeout:60000});await expect(dialog).toBeHidden()
 const inbox=await page.getByRole('button',{name:/^알림함/}).boundingBox(),newsButton=await launcher.boundingBox();expect(newsButton!.y).toBeGreaterThanOrEqual(inbox!.y+inbox!.height);expect(Math.abs(newsButton!.x+newsButton!.width-inbox!.x-inbox!.width)).toBeLessThan(2)
 await page.screenshot({path:'../output/entry-news-launcher.png',animations:'disabled'});await launcher.click();await expect(dialog).toBeVisible();await expect(dialog.getByRole('img')).toBeVisible();await expect(launcher).toHaveAttribute('aria-expanded','true');await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(launcher).toBeFocused();await page.reload();await expect(launcher).toBeEnabled({timeout:60000});await expect(dialog).toBeHidden()
})
test('수동 재열기의 실패와 빈 목록도 닫기와 재시도를 제공한다',async({page})=>{
 const news=await entryNewsFixture();await fixture(page);await news.attach(page);let failed=false,calls=0;await page.route('**/api/v1/entry-news',route=>{calls++;return failed?route.fulfill({status:503}):route.fulfill({json:{serverTime:new Date().toISOString(),pages:[]}})})
 await page.goto('/park');const launcher=page.getByRole('button',{name:'이벤트/공지',exact:true}),dialog=page.getByRole('dialog',{name:'온탑 새 소식'});await expect(launcher).toBeEnabled({timeout:60000});await expect.poll(()=>calls).toBeGreaterThan(0);await expect(dialog).toBeHidden();failed=true;await launcher.click();await expect(dialog.getByRole('alert')).toContainText('소식을 불러오지 못했어요.');failed=false;await dialog.getByRole('button',{name:'다시 불러오기'}).click();await expect(dialog).toContainText('현재 등록된 이벤트·공지가 없어요.');await dialog.getByRole('button',{name:'닫기',exact:true}).click();await expect(dialog).toBeHidden()
})
