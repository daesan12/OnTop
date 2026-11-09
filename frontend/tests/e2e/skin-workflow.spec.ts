import { test, expect } from '@playwright/test'
import { fixture } from './contractFixture'
const id='77777777-7777-4777-8777-777777777777'
async function setup(page:import('@playwright/test').Page){
 await fixture(page)
 await page.route('**/api/v1/admin/me',r=>r.fulfill({json:{canRead:true,canOperate:true,canGrant:false}}))
 await page.route('**/api/v1/skins/assets',r=>r.fulfill({json:[]}))
 let saved:Record<string,unknown>|null=null
 await page.route('**/api/v1/admin/operations/skins**',r=>{
  const p=new URL(r.request().url()).pathname
  if(p.endsWith('/settings'))return r.fulfill({json:{storageReady:true,maxModelBytes:20971520,maxImageBytes:2097152}})
  if(p.endsWith('/components')&&r.request().method()==='POST'){saved={id,definition:r.request().postDataJSON(),state:'DRAFT',version:0,publishedUploadId:null};return r.fulfill({json:saved})}
  if(p.endsWith('/components'))return r.fulfill({json:saved?[saved]:[]})
  return r.fulfill({json:[]})
 })
 await page.goto('/admin/skins');return {get saved(){return saved}}
}
test('처음부터 남녀와 바깥쪽 여섯 슬롯이 있고 불필요한 착용 방식 질문은 없다',async({page})=>{
 const result=await setup(page)
 await expect(page.getByRole('figure')).toHaveCount(2)
 await expect(page.locator('.skin-body-slot')).toHaveCount(6)
 await page.getByRole('button',{name:'＋ 새 아이템 파일 등록',exact:true}).click()
 await expect(page.getByLabel('착용 방식',{exact:true})).toHaveCount(0)
 await page.getByLabel('의상 이름',{exact:true}).fill('갓과 얼굴')
 await page.getByLabel('얼굴',{exact:true}).check()
 await page.getByRole('button',{name:'저장하고 파일 올리기 →',exact:true}).click()
 await expect(page.getByLabel('GLB 모델',{exact:true})).toBeEnabled()
 const definition=result.saved!.definition as {productCode:string;slots:string[]}
 expect(definition.productCode).toMatch(/^ITEM_[A-F0-9]{16}$/);expect(definition.slots).toEqual(['HAIR','FACE'])
})
test('아이템 등록 중 돌아가기를 취소하면 작성 내용을 유지한다',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'＋ 새 아이템 파일 등록',exact:true}).click()
 await page.getByLabel('의상 이름',{exact:true}).fill('저장 전 의상')
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'← 남녀 캐릭터 화면으로',exact:true}).click()
 await expect(page.getByLabel('의상 이름',{exact:true})).toHaveValue('저장 전 의상')
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'← 남녀 캐릭터 화면으로',exact:true}).click()
 await expect(page.getByRole('figure')).toHaveCount(2)
})
test('여자 의상을 다음 화면에 넘기면 여자 슬롯만 채워지고 남자는 그대로다',async({page})=>{
 await setup(page)
 const entry={id,definition:{productCode:'READY_HEAD',name:'여자 갓',grade:4,compatibility:'FEMALE',wearMode:'PARTS',slots:['HAIR','FACE']},state:'PUBLISHED',version:1,publishedUploadId:id}
 await page.route('**/api/v1/admin/operations/skins/components',r=>r.fulfill({json:[entry]}))
 await page.getByRole('button',{name:'＋ 새 아이템 파일 등록',exact:true}).click()
 await page.getByRole('button',{name:/여자 갓/}).click()
 await page.getByRole('button',{name:'이 의상으로 세트 만들기 →',exact:true}).click()
 await expect(page.locator('.skin-body-slots.female .occupied')).toHaveCount(2)
 await expect(page.locator('.skin-body-slots.male .occupied')).toHaveCount(0)
})
test('다른 세트 선택과 새로고침은 저장 전 내용을 보호한다',async({page})=>{
 await setup(page);await page.getByLabel('남자 세트 이름',{exact:true}).fill('작성 중인 선비 세트')
 page.once('dialog',d=>d.dismiss());await page.getByLabel('남자 기존 세트',{exact:true}).selectOption('')
 await expect(page.getByLabel('남자 세트 이름',{exact:true})).toHaveValue('작성 중인 선비 세트')
 page.once('dialog',d=>d.accept());await page.getByLabel('남자 기존 세트',{exact:true}).selectOption('')
 await expect(page.getByLabel('남자 세트 이름',{exact:true})).toHaveValue('')
})
