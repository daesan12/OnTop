import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { notesFixture } from './notesFixture'
import { NOTES_BOX } from '../../src/config/notes'
import { MAILBOX } from '../../src/config/parkPlan'
const near={x:NOTES_BOX.x,y:NOTES_BOX.y+.8,z:NOTES_BOX.z+1.5,yaw:Math.PI}
const ids=(p:Page)=>p.evaluate(async()=>(await import('/tests/e2e/codePropsProbe.ts' as string)).heritageProbe('notes').noteIds)
async function ready(p:Page){await p.goto('/park');await expect(p.getByLabel('공원 기본 화면')).toBeVisible();await expect(p.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})}

test('world asset shows only latest six real rows, survives close, updates after ACK and purges auth',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 const world=await fixture(page,{manualMovement:true,position:near}),rest=await notesFixture(page)
 for(let i=1;i<=8;i++)rest.add('사용자가 작성한 한글 메모 '+i+' 🙂')
 await ready(page);await expect.poll(()=>ids(page)).toEqual(['8','7','6','5','4','3'])
 const reads=rest.reads;await page.waitForTimeout(2200);expect(rest.reads).toBe(reads)
 await page.evaluate(async()=>(await import('/tests/e2e/codePropsProbe.ts' as string)).heritageView('notes',.2,2.5));await screenshot(page,'live-user-notes-six')
 await page.getByLabel('가까운 상호작용').getByRole('button',{name:/익명 메모/}).click()
 const dialog=page.getByRole('dialog',{name:'전망대 익명 메모'})
 await expect(dialog.getByRole('region',{name:'익명 메모 목록'})).toHaveAttribute('aria-busy','false');expect(rest.reads).toBe(reads)
 await dialog.getByRole('button',{name:/메모 작성하기/}).click();await dialog.getByLabel('새 메모',{exact:true}).fill('승인된 새 메모만 에셋에 붙여요!')
 rest.writeMode('hold');await dialog.getByRole('button',{name:/메모 남기기/}).click();await expect.poll(()=>rest.acceptedCount).toBe(1)
 await expect.poll(()=>ids(page)).toEqual(['8','7','6','5','4','3'])
 await rest.release();await expect.poll(()=>ids(page)).toEqual(['9','8','7','6','5','4'])
 await expect(dialog.getByRole('heading',{name:'메모가 등록되었어요!'})).toBeVisible();await page.keyboard.press('Escape')
 await expect.poll(()=>ids(page)).toEqual(['9','8','7','6','5','4']);await screenshot(page,'live-user-notes-after-ack')
 world.endSession();await expect(page.locator('.login-page')).toBeVisible()
 expect(await page.evaluate(async()=>(await import('/src/features/notes/state.ts' as string)).useNotesState.getState().displayNotes)).toEqual([])
 expect(errors).toEqual([])
})

test('empty server has no decorative/example notes, failure never invents a paper',async({page})=>{
 await fixture(page,{manualMovement:true,position:near});const rest=await notesFixture(page);await ready(page)
 await expect.poll(()=>rest.reads).toBe(1);await expect.poll(()=>ids(page)).toEqual([])
 await page.getByLabel('가까운 상호작용').getByRole('button',{name:/익명 메모/}).click()
 const dialog=page.getByRole('dialog',{name:'전망대 익명 메모'});await dialog.getByRole('button',{name:/메모 작성하기/}).click()
 await dialog.getByLabel('새 메모',{exact:true}).fill('실패한 메모는 게시하지 않아요.');rest.writeMode('unavailable')
 await dialog.getByRole('button',{name:/메모 남기기/}).click();await expect(dialog.getByRole('alert')).toBeVisible();await expect.poll(()=>ids(page)).toEqual([])
 await page.keyboard.press('Escape');await expect.poll(()=>ids(page)).toEqual([])
})

test('late Korean font redraws both 3D signs after font download',async({page})=>{
 let release!:()=>void;const hold=new Promise<void>(r=>{release=r})
 await page.route('**/BusanDandiMyeongjo-700.woff2',async route=>{await hold;await route.continue()})
 await fixture(page,{manualMovement:true,position:{x:MAILBOX.x-1.5,y:.8,z:MAILBOX.z,yaw:0}})
 await ready(page)
 const signs=(kind:'mailbox'|'notes'):Promise<ReturnType<typeof import('./codePropsProbe').heritageSignProbe>>=>page.evaluate(async kind=>(await import('/tests/e2e/codePropsProbe.ts' as string)).heritageSignProbe(kind),kind)
 const before=(await signs('mailbox'))[0]!.texture;release()
 await expect.poll(async()=>(await signs('mailbox'))[0]!.texture).not.toBe(before)
 expect((await signs('mailbox'))[0]!.font).toMatch(/^(bold|700) /)
 await expect.poll(()=>page.evaluate(()=>document.fonts.check('500 32px "BusanDandiMyeongjo"','온탑 메모함'))).toBe(true)
 expect((await signs('notes')).map(s=>s.font).join(' ')).toContain('BusanDandiMyeongjo')
 await page.evaluate(async()=>(await import('/tests/e2e/codePropsProbe.ts' as string)).heritageView('mailbox',.2,2));await screenshot(page,'mailbox-korean-title')
})
