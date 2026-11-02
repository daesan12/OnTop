import {test,expect} from '@playwright/test'
import {parkFixture} from './fixture'
import {PARK_DATA} from '../../src/map/park'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('updated props preserve generated anchors and real feedback/notes requests',async({page})=>{
 const errors:string[]=[]
 const advertisementRequests:string[]=[]
 page.on('request',r=>{if(['image','media'].includes(r.resourceType())&&/advertisements|adv_pickus|adv_dero|dero-poster|ontap-film/.test(r.url()))advertisementRequests.push(r.url())})
 page.on('pageerror',e=>errors.push(e.message))
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 const server=await parkFixture(page)
 await page.goto('/park')
 await expect(page.locator('canvas').first()).toBeVisible({timeout:90000})
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 const detail=()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).detailProbe())
 await expect.poll(async()=>(await detail()).boardExists).toBe(true)
 const before=await detail(),mailbox=PARK_DATA.interactions.mailbox,notes=PARK_DATA.interactions.notes
 expect(before.mailbox?.[0]).toBe(mailbox.position[0]);expect(before.mailbox?.[2]).toBe(mailbox.position[2])
 expect(before.board).toEqual([...notes.position])
 expect(before.paving).toContain('layout-smooth-paths');expect(before.pavingTextures).toEqual([])
 expect(before.noteIds).toEqual([])
 expect(before.advertisements).toEqual([]);expect(before.backgroundBuildings).toHaveLength(6)
 await expect(page.locator('video')).toHaveCount(0)
 const hint=page.getByRole('complementary',{name:'가까운 상호작용'})
 const artifactDir=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'ontop-park-details')
 await fs.mkdir(artifactDir,{recursive:true})
 const [mx,my,mz]=mailbox.position;server.place({x:mx,y:my+.8,z:mz})
 await expect(hint).toHaveAttribute('data-target-id','feedback-mailbox')
 await page.keyboard.press('KeyE')
 const feedback=page.getByRole('dialog',{name:'온탑 소리함',exact:true})
 await expect(feedback).toBeVisible()
 await feedback.getByRole('textbox',{name:'의견 내용'}).fill('새 공원에서도 소리함을 이용합니다.')
 await page.screenshot({path:path.join(artifactDir,'feedback-writing.png')})
 await feedback.getByRole('button',{name:'의견 보내기',exact:true}).click()
 await expect.poll(()=>server.restRequests.filter(r=>r.path==='/api/v1/feedback').length).toBe(1)
 expect(server.restRequests.find(r=>r.path==='/api/v1/feedback')!.body).toMatchObject({channelId:'channel-1',text:'새 공원에서도 소리함을 이용합니다.'})
 await expect(page.locator('.feedback-delivery-status')).toBeVisible()
 await page.screenshot({path:path.join(artifactDir,'feedback-accepted.png')})
 await page.keyboard.press('Escape')
 const [x,y,z]=notes.reachPosition;server.place({x,y,z})
 await expect(hint).toHaveAttribute('data-target-id','tower-notes')
 await expect.poll(()=>server.restRequests.filter(r=>r.path==='/api/v1/notes'&&r.method==='GET').length).toBeGreaterThan(0)
 await page.keyboard.press('KeyE')
 const board=page.getByRole('dialog',{name:'전망대 익명 메모',exact:true})
 await expect(board).toBeVisible()
 await board.getByRole('button',{name:/메모 작성하기/}).click()
 const text='새 공원의 전망대에서 남긴 실제 메모입니다.'
 await board.getByRole('textbox',{name:'새 메모',exact:true}).fill(text)
 await page.screenshot({path:path.join(artifactDir,'notes-writing.png')})
 await board.getByRole('button',{name:/메모 남기기/}).click()
 await expect.poll(()=>server.restRequests.filter(r=>r.path==='/api/v1/notes'&&r.method==='POST').length).toBe(1)
 expect(server.restRequests.find(r=>r.path==='/api/v1/notes'&&r.method==='POST')!.body).toMatchObject({channelId:'channel-1',text})
 await expect(board.getByRole('heading',{name:'메모가 등록되었어요!'})).toBeVisible()
 await expect.poll(async()=>(await detail()).noteIds).toEqual(['1'])
 await page.screenshot({path:path.join(artifactDir,'notes-accepted.png')})
 await board.getByRole('button',{name:'익명 메모 닫기'}).click()
 await page.screenshot({path:path.join(artifactDir,'notes-board.png')})
 expect(errors).toEqual([])
 expect(advertisementRequests).toEqual([])
})
