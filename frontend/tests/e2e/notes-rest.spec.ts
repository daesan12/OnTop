import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { notesFixture } from './notesFixture'
import { NOTES_BOX } from '../../src/config/notes'
const near={x:NOTES_BOX.x-1.5,y:NOTES_BOX.y+.8,z:NOTES_BOX.z,yaw:0}
const body='오늘도 좋은 하루 보내세요. 전망대에서 마음 한 장 남겨요.'
const dialog=(p:Page)=>p.getByRole('dialog',{name:'전망대 익명 메모',exact:true})
const area=(p:Page)=>dialog(p).getByLabel('새 메모',{exact:true})
const wall=(p:Page)=>dialog(p).getByRole('region',{name:'익명 메모 목록'})
const probe=(p:Page)=>p.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).notesProbe())
async function open(p:Page){
 await p.getByLabel('가까운 상호작용').getByRole('button',{name:/익명 메모 소리함 열기/}).click()
 await expect(dialog(p)).toBeVisible();await expect(wall(p)).toHaveAttribute('aria-busy','false')
}
async function compose(p:Page){await dialog(p).getByRole('button',{name:/메모 작성하기/}).click();await expect(area(p)).toBeFocused()}
async function board(p:Page){await dialog(p).getByRole('button',{name:'메모함으로 돌아가기',exact:false}).click()}
async function loaded(p:Page){
 await p.goto('/park');await expect(p.getByLabel('공원 기본 화면')).toBeVisible()
 await expect(p.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90_000})
 await p.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).orbit(0,.35,6.8));await open(p)
}
async function delivered(p:Page){await expect(dialog(p).getByRole('heading',{name:'메모가 등록되었어요!'})).toBeVisible();await dialog(p).getByRole('button',{name:'메모함 보러가기'}).click()}

test('M08 opens a stable board, never polls, acknowledges one post then refreshes explicitly',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 const server=await fixture(page,{manualMovement:true,position:near}),rest=await notesFixture(page);await loaded(page)
 await expect(wall(page)).toContainText('아직 메모가 없어요');const reads=rest.reads
 await page.waitForTimeout(4400);expect(rest.reads).toBe(reads)
 await compose(page);rest.writeMode('hold');const raw='  '+body+'\u200b\n';await area(page).fill(raw)
 await dialog(page).getByRole('button',{name:/메모 남기기/}).click()
 await expect.poll(()=>rest.acceptedCount).toBe(1);await expect(area(page)).toHaveValue(raw);await expect(area(page)).toHaveJSProperty('readOnly',true)
 await expect(dialog(page).getByRole('heading',{name:'메모가 등록되었어요!'})).toHaveCount(0)
 await rest.release();await expect(page.locator('.notes-fold-stage')).toBeVisible();await delivered(page)
 await expect(wall(page).getByText(body,{exact:true})).toHaveCount(1);expect(rest.reads).toBe(reads)
 rest.add('다른 이웃이 남긴 새 메모');await page.waitForTimeout(2400);expect(rest.reads).toBe(reads)
 await expect(wall(page)).not.toContainText('다른 이웃이 남긴 새 메모')
 await dialog(page).getByRole('button',{name:'새로고침',exact:true}).click();await expect(wall(page)).toContainText('다른 이웃이 남긴 새 메모')
 expect(rest.requests[0]).toMatchObject({channelId:'fixture-channel',text:body});expect((await probe(page)).publicData).not.toContain(body);expect(JSON.stringify(server.sent)).not.toContain(body)
 await screenshot(page,'m08-traditional-rest-board');await page.keyboard.press('Escape');await expect(dialog(page)).toBeHidden()
 const final=rest.reads;await page.waitForTimeout(2200);expect(rest.reads).toBe(final)
 await page.keyboard.down('KeyW');await expect.poll(()=>server.sent.some(m=>m.type==='WORLD_MOVE'&&(m.payload.dx||m.payload.dz))).toBe(true);await page.keyboard.up('KeyW');expect(errors).toEqual([])
})
test('M08 preserves a lost acknowledgement draft and retries exactly the same request once',async({page})=>{
 await fixture(page,{manualMovement:true,position:near});const rest=await notesFixture(page);rest.writeMode('acceptThenLose');await loaded(page);await compose(page);await area(page).fill(body)
 await dialog(page).getByRole('button',{name:/메모 남기기/}).click();await expect(dialog(page).getByRole('alert')).toContainText('메모 요청 결과를 확인하지 못했습니다')
 const original={...rest.requests[0]!};await expect(area(page)).toHaveValue(body);await board(page)
 await dialog(page).getByRole('button',{name:'새로고침',exact:true}).click();await expect(wall(page).getByText(body,{exact:true})).toHaveCount(1)
 await compose(page);await expect(area(page)).toHaveValue(body);await dialog(page).getByRole('button',{name:'같은 메모 다시 붙이기',exact:true}).click()
 await delivered(page);expect(rest.requests).toEqual([original,original]);expect(rest.acceptedCount).toBe(1);await expect(wall(page).getByText(body,{exact:true})).toHaveCount(1)
})
test('M08 keeps login on distance refusal, honors write cooldown and terminal retry on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});const server=await fixture(page,{manualMovement:true,position:near}),rest=await notesFixture(page);rest.readMode('outOfRange');await loaded(page)
 await expect(dialog(page).getByRole('alert')).toContainText('전망대 정상 메모함 가까이');expect(server.connections).toBe(1)
 rest.readMode('normal');const refresh=dialog(page).getByRole('button',{name:'새로고침',exact:true});await expect(refresh).toBeEnabled();await refresh.click();await expect(wall(page)).toContainText('아직 메모가 없어요')
 rest.writeMode('writeCooldown');await compose(page);await area(page).fill(body);await dialog(page).getByRole('button',{name:/메모 남기기/}).click()
 await expect(dialog(page).getByRole('button',{name:/초 후 붙이기/})).toBeDisabled();expect((await probe(page)).nextAllowedAt).toBe(Date.parse(rest.deadline));await expect(area(page)).toHaveValue(body)
 rest.writeMode('expired');const retry=dialog(page).getByRole('button',{name:'같은 메모 다시 붙이기',exact:true});await expect(retry).toBeEnabled({timeout:10000});await retry.click()
 await expect(dialog(page)).toContainText('재확인 기간이 만료');await expect(retry).toBeDisabled();expect(rest.requests[1]!.operationId).toBe(rest.requests[0]!.operationId)
 await screenshot(page,'m08-traditional-mobile-failure');await page.keyboard.press('Escape');await open(page);await compose(page);await expect(retry).toBeDisabled();expect(rest.requests).toHaveLength(2)
 await area(page).fill('새로 작성한 마음 한 장');await expect(dialog(page).getByRole('button',{name:/메모 남기기/})).toBeEnabled()
 const box=await dialog(page).boundingBox();expect(box!.x+box!.width).toBeLessThanOrEqual(390);expect(box!.y+box!.height).toBeLessThanOrEqual(844)
})
test('M08 keeps existing notes during a slow read and never retries read deadlines automatically',async({page})=>{
 await fixture(page,{manualMovement:true,position:near});const rest=await notesFixture(page);rest.add('이전에 확인한 메모');await loaded(page);rest.readMode('holdRead')
 const refresh=dialog(page).getByRole('button',{name:'새로고침',exact:true});await expect(refresh).toBeEnabled();await refresh.click();await expect.poll(()=>rest.reads).toBe(2)
 await expect(wall(page)).toContainText('이전에 확인한 메모');await page.waitForTimeout(2400);expect(rest.reads).toBe(2);await rest.release();await expect(refresh).toBeEnabled()
 rest.readMode('readCooldown');await refresh.click();await expect(dialog(page).getByRole('alert')).toContainText('목록 조회 간격');await expect(wall(page)).toContainText('이전에 확인한 메모')
 rest.readMode('normal');await expect(refresh).toBeEnabled({timeout:10000});expect(rest.reads).toBe(3);await refresh.click();await expect.poll(()=>rest.reads).toBe(4)
 expect(rest.readTimes[3]!-rest.readTimes[2]!).toBeGreaterThanOrEqual(5900);await expect(dialog(page).getByRole('alert')).toHaveCount(0)
})
test('M08 cancels late replies across reconnect, forced movement and auth end without losing draft',async({page})=>{
 const server=await fixture(page,{manualMovement:true,position:near}),rest=await notesFixture(page);await loaded(page);await compose(page);rest.writeMode('hold');await area(page).fill(body);await dialog(page).getByRole('button',{name:/메모 남기기/}).click()
 await expect.poll(()=>rest.acceptedCount).toBe(1);const original={...rest.requests[0]!};server.close(1013);await expect(dialog(page)).toBeHidden();await expect.poll(()=>server.connections).toBe(2)
 const reads=rest.reads;await page.waitForTimeout(2200);expect(rest.reads).toBe(reads);await open(page);await compose(page);await expect(area(page)).toHaveValue(body)
 rest.writeMode('normal');await dialog(page).getByRole('button',{name:'같은 메모 다시 붙이기',exact:true}).click();await delivered(page);expect(rest.requests).toEqual([original,original]);expect(rest.acceptedCount).toBe(1)
 await compose(page);await area(page).fill('새로 작성 중인 메모');await rest.release();await expect(area(page)).toHaveValue('새로 작성 중인 메모');server.pose({...near,y:.8});await expect(dialog(page)).toBeHidden();expect((await probe(page)).draft).toBe('새로 작성 중인 메모')
 server.pose(near);await open(page);server.endSession();await expect(page.locator('.login-page')).toBeVisible();expect((await probe(page)).draft).toBe('')
})
test('M08 refreshes auth using the identical POST payload before showing success',async({page})=>{
 await fixture(page,{manualMovement:true,position:near});const rest=await notesFixture(page);await loaded(page);await compose(page);rest.writeMode('unauthorizedOnce');await area(page).fill(body)
 await dialog(page).getByRole('button',{name:/메모 남기기/}).click();await delivered(page);expect(rest.requests).toHaveLength(2);expect(rest.requests[0]).toEqual(rest.requests[1]);expect(rest.acceptedCount).toBe(1)
})
test('M08 preserves auth termination for an undocumented forbidden response',async({page})=>{
 await fixture(page,{manualMovement:true,position:near});await notesFixture(page);await loaded(page);await compose(page)
 await page.route('**/api/v1/notes',route=>route.fulfill({status:403,json:{code:'FORBIDDEN',message:'권한 없음'}}));await area(page).fill(body);await dialog(page).getByRole('button',{name:/메모 남기기/}).click();await expect(page.locator('.login-page')).toBeVisible();expect((await probe(page)).draft).toBe('')
})
