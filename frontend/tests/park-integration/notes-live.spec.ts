import {test,expect} from '@playwright/test'
import {parkFixture} from './fixture'
import {PARK_DATA} from '../../src/map/park'
import {NOTES_BOX as legacyNotes} from '../../src/config/notes'
import {screenshot} from '../e2e/contractFixture'

test('generated park memo coordinates, categories, notifications and real note papers stay connected',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
 const server=await parkFixture(page),notes=PARK_DATA.interactions.notes
 expect(notes.position).not.toEqual([legacyNotes.x,legacyNotes.y,legacyNotes.z])
 await page.goto('/park')
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 const detail=()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).detailProbe())
 expect((await detail()).board).toEqual([...notes.position])
 const [x,y,z]=notes.reachPosition;server.place({x,y,z:z+1.7})
 const hint=page.getByRole('complementary',{name:'가까운 상호작용'})
 await expect(hint).toHaveAttribute('data-target-id','tower-notes')
 await page.keyboard.press('KeyE')
 const dialog=page.getByRole('dialog',{name:'전망대 익명 메모',exact:true})
 const reads=()=>server.restRequests.filter(r=>r.path==='/api/v1/notes'&&r.method==='GET').length
 await expect(dialog.getByRole('region',{name:'익명 메모 목록'})).toHaveAttribute('aria-busy','false')
 await dialog.getByRole('button',{name:/메모 작성하기/}).click()
 await dialog.getByRole('button',{name:/고민/}).click()
 const area=dialog.getByRole('textbox',{name:'새 메모',exact:true}),draft='새 공원에서 작성 중인 마음'
 await area.fill(draft)
 await area.evaluate((el:HTMLTextAreaElement)=>el.setSelectionRange(3,8))
 const before=reads();await page.waitForTimeout(1200);expect(reads()).toBe(before)
 server.addNote('새 공원 이웃의 응원','cheer')
 await expect.poll(reads).toBe(before+1)
 await expect(area).toHaveValue(draft)
 await expect(area).toBeFocused()
 expect(await area.evaluate((el:HTMLTextAreaElement)=>[el.selectionStart,el.selectionEnd])).toEqual([3,8])
 await expect(dialog.getByRole('button',{name:/고민/})).toHaveAttribute('aria-pressed','true')
 await expect.poll(async()=>(await detail()).noteIds).toEqual(['1'])
 server.emit('NOTES_CHANGED',{revision:'1'});await page.waitForTimeout(1200);expect(reads()).toBe(before+1)
 const text='새 공원에서도 주제와 메모가 보존돼요. '.repeat(30).slice(0,299)+'!'
 await area.fill(text);await expect(area).toHaveAttribute('maxlength','300')
 await dialog.getByRole('button',{name:/메모 남기기/}).click()
 await expect(dialog.getByRole('heading',{name:'메모가 등록되었어요!'})).toBeVisible()
 const post=server.restRequests.filter(r=>r.path==='/api/v1/notes'&&r.method==='POST')
 expect(post).toHaveLength(1);expect(post[0]!.body).toMatchObject({channelId:'channel-1',text,category:'worry'})
 await expect.poll(async()=>(await detail()).noteIds).toEqual(['2','1'])
 await dialog.getByRole('button',{name:'메모함 보러가기'}).click()
 await dialog.getByRole('button',{name:'응원',exact:true}).click()
 await expect(dialog.getByRole('region',{name:'익명 메모 목록'})).toContainText('새 공원 이웃의 응원')
 await screenshot(page,'generated-notes-live-board')
 await dialog.getByRole('button',{name:'익명 메모 닫기'}).click()
 await page.evaluate(async()=>{
  (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.5)
  ;(await import('/tests/park-integration/probe.ts' as string)).notesBoardView()
 })
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).notesPaperVisible())).toMatchObject({paper:true,textured:true,scale:2})
 await screenshot(page,'generated-notes-summit-papers')
 const closedReads=reads();server.addNote('닫힌 동안의 새 메모')
 await page.waitForTimeout(1200);expect(reads()).toBe(closedReads)
 await page.keyboard.press('KeyE');await expect(dialog.getByRole('region',{name:'익명 메모 목록'})).toContainText('닫힌 동안의 새 메모')
 await expect.poll(async()=>(await detail()).noteIds).toEqual(['3','2','1'])
 expect(server.requests.filter(r=>r.type==='WORLD_MAP_CONFIRM')).toHaveLength(1)
 expect(server.requests.some(r=>r.type.includes('NOTES'))).toBe(false)
 expect(errors).toEqual([])
})
