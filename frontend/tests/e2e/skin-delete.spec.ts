import {expect,test,type Page} from '@playwright/test'
import {fixture} from './contractFixture'

const item={id:'11111111-1111-4111-8111-111111111111',definition:{productCode:'ITEM_DELETE',name:'삭제 검수 의상',grade:2,compatibility:'MALE',wearMode:'WHOLE',slots:['HAIR','FACE','TOP','BOTTOM','SHOES']},state:'PUBLISHED',version:2,publishedUploadId:'22222222-2222-4222-8222-222222222222',updatedAt:''}
const set={id:'33333333-3333-4333-8333-333333333333',definition:{productCode:'SET_DELETE',name:'삭제 검수 세트',grade:2,compatibility:'MALE',imageSkinId:item.id,itemIds:[item.id]},state:'PUBLISHED',version:4,publishedAt:'2026-11-13T00:00:00Z'}
async function workshop(page:Page,{sets=true,reject='',any=false}={}){
 await fixture(page)
 let hasItem=true,hasSet=sets,failure=reject
 const sent:{path:string;version:string|null}[]=[]
 await page.route('**/api/v1/admin/me',r=>r.fulfill({json:{canRead:true,canOperate:true,canGrant:false}}))
 await page.route('**/api/v1/skins/assets',r=>r.fulfill({json:[]}))
 await page.route('**/api/v1/admin/operations/skins**',async r=>{
  const path=new URL(r.request().url()).pathname
  if(r.request().method()==='DELETE'){
   sent.push({path,version:new URL(r.request().url()).searchParams.get('version')})
   expect(r.request().postData()).toBeNull()
   if(failure)return r.fulfill({status:failure==='UNAVAILABLE'?503:409,json:{code:failure}})
   if(path.includes('/sets/'))hasSet=false;else hasItem=false
   return r.fulfill({status:204})
  }
  return r.fulfill({json:path.endsWith('/settings')?{storageReady:false}:path.endsWith('/sets')?(hasSet?[any?{...set,definition:{...set.definition,compatibility:'ANY'}}:set]:[]):hasItem?[item]:[]})
 })
 await page.goto('/admin/skins')
 return {sent,allow:()=>{failure=''}}
}

test('set deletion can be cancelled and resets the selected editor only after confirmed success',async({page},info)=>{
 const {sent}=await workshop(page)
 const library=page.getByRole('region',{name:'등록된 스킨 세트 목록'})
 await library.getByRole('button',{name:'삭제 검수 세트 남자에 불러오기',exact:true}).click()
 await expect(page.getByLabel('남자 세트 이름',{exact:true})).toHaveValue(set.definition.name)
 await page.getByLabel('여자 세트 이름',{exact:true}).fill('다른 편집기의 저장 전 이름')
 page.once('dialog',d=>d.dismiss())
 await library.getByRole('button',{name:'삭제 검수 세트 세트 삭제',exact:true}).click()
 expect(sent).toHaveLength(0);await expect(library.locator('li')).toHaveCount(1)
 page.once('dialog',async d=>{expect(d.message()).toContain('기존 보유·착용');await d.accept()})
 await library.getByRole('button',{name:'삭제 검수 세트 세트 삭제',exact:true}).click()
 await expect(library.locator('li')).toHaveCount(0)
 await expect(page.getByLabel('남자 세트 이름',{exact:true})).toHaveValue('')
 await expect(page.getByLabel('여자 세트 이름',{exact:true})).toHaveValue('다른 편집기의 저장 전 이름')
 expect(sent[0]).toEqual({path:'/api/v1/admin/operations/skins/sets/'+set.id,version:'4'})
 await page.screenshot({path:info.outputPath('set-deleted.png'),fullPage:true})
 await page.getByRole('button',{name:'목록 새로고침',exact:true}).click()
 await expect(library.locator('li')).toHaveCount(0)
})

test('deleting an ANY set clears both editors that loaded that same set',async({page})=>{
 await workshop(page,{any:true})
 const library=page.getByRole('region',{name:'등록된 스킨 세트 목록'})
 await library.getByRole('button',{name:'삭제 검수 세트 남자에 불러오기',exact:true}).click()
 await library.getByRole('button',{name:'삭제 검수 세트 여자에 불러오기',exact:true}).click()
 await expect(page.getByLabel('여자 세트 이름',{exact:true})).toHaveValue(set.definition.name)
 page.once('dialog',d=>d.accept())
 await library.getByRole('button',{name:'삭제 검수 세트 세트 삭제',exact:true}).click()
 await expect(page.getByLabel('남자 세트 이름',{exact:true})).toHaveValue('')
 await expect(page.getByLabel('여자 세트 이름',{exact:true})).toHaveValue('')
})

test('failed set deletion preserves the form and can be retried',async({page})=>{
 const state=await workshop(page,{reject:'SKIN_VERSION_CHANGED'})
 const button=page.getByRole('button',{name:'삭제 검수 세트 세트 삭제',exact:true})
 await page.getByRole('button',{name:'삭제 검수 세트 남자에 불러오기',exact:true}).click()
 page.once('dialog',d=>d.accept());await button.click()
 await expect(page.getByText('다른 창에서 변경됐어요. 목록을 다시 불러온 뒤 확인해주세요.',{exact:true})).toBeVisible()
 await expect(page.getByLabel('남자 세트 이름',{exact:true})).toHaveValue(set.definition.name)
 await expect(button).toBeEnabled()
 state.allow();page.once('dialog',d=>d.accept());await button.click()
 await expect(button).toHaveCount(0)
})

test('referenced skin stays visible with guidance, then successful deletion clears its editor',async({page},info)=>{
 const state=await workshop(page,{sets:false,reject:'SKIN_IN_USE'})
 await page.getByRole('button',{name:'새 아이템 파일 등록',exact:false}).click()
 const library=page.locator('.skin-library')
 await library.locator('li').getByRole('button').first().click()
 const name=page.getByLabel('의상 이름',{exact:true})
 await name.fill('저장하지 않은 이름')
 const button=page.getByRole('button',{name:'삭제 검수 의상 스킨 삭제',exact:true})
 page.once('dialog',d=>d.dismiss());await button.click();expect(state.sent).toHaveLength(0)
 page.once('dialog',d=>d.accept());await button.click()
 await expect(page.getByText('이 스킨을 사용하는 세트를 먼저 삭제해주세요. 기존 보유·착용은 유지돼요.',{exact:true})).toBeVisible()
 await expect(name).toHaveValue('저장하지 않은 이름');await expect(button).toBeEnabled()
 await page.screenshot({path:info.outputPath('referenced-skin-retry.png'),fullPage:true})
 state.allow();page.once('dialog',d=>d.accept());await button.click()
 await expect(button).toHaveCount(0);await expect(name).toHaveValue('')
 expect(state.sent.at(-1)?.version).toBe('2')
})

test('service failure leaves a skin in the list and enables retry',async({page})=>{
 const state=await workshop(page,{sets:false,reject:'UNAVAILABLE'})
 await page.getByRole('button',{name:'새 아이템 파일 등록',exact:false}).click()
 const button=page.getByRole('button',{name:'삭제 검수 의상 스킨 삭제',exact:true})
 page.once('dialog',d=>d.accept());await button.click()
 await expect(page.getByText('처리하지 못했어요. 입력을 유지했으니 다시 시도해주세요.',{exact:true})).toBeVisible()
 await expect(button).toBeEnabled();state.allow()
 page.once('dialog',d=>d.accept());await button.click();await expect(button).toHaveCount(0)
})

test('a stale list refresh cannot restore a successfully deleted set',async({page})=>{
 await workshop(page)
 const library=page.getByRole('region',{name:'등록된 스킨 세트 목록'})
 await expect(library.locator('li')).toHaveCount(1)
 let release!:()=>void,started!:()=>void,finished!:()=>void
 const gate=new Promise<void>(r=>{release=r}),requested=new Promise<void>(r=>{started=r}),settled=new Promise<void>(r=>{finished=r})
 await page.route('**/api/v1/admin/operations/skins/sets',async route=>{
  started();await gate
  try{await route.fulfill({json:[set]})}catch{/* The successful delete aborts this stale GET. */}finally{finished()}
 })
 await page.getByRole('button',{name:'목록 새로고침',exact:true}).click();await requested
 page.once('dialog',d=>d.accept())
 await library.getByRole('button',{name:'삭제 검수 세트 세트 삭제',exact:true}).click()
 await expect(library.locator('li')).toHaveCount(0)
 release();await settled;await page.waitForTimeout(150)
 await expect(library.locator('li')).toHaveCount(0)
})
