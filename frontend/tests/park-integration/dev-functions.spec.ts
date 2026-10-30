import {test,expect} from '@playwright/test'
import {parkFixture} from './fixture'

test('latest settings and channel refresh stay connected on the accepted new map',async({page})=>{
 const errors:string[]=[],ads:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 page.on('request',r=>{if(['image','media'].includes(r.resourceType())&&/advertisements|adv_pickus|adv_dero/.test(r.url()))ads.push(r.url())})
 const server=await parkFixture(page)
 await page.goto('/park')
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 const before=server.restRequests.filter(r=>r.path==='/api/v1/channels').length
 await page.getByRole('button',{name:'현재 공원과 접속 인원'}).click()
 await expect(page.getByLabel('채널 선택',{exact:true})).toBeVisible()
 await expect.poll(()=>server.restRequests.filter(r=>r.path==='/api/v1/channels').length).toBe(before+1)
 await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'설정',exact:true}).click()
 const settings=page.getByLabel('설정',{exact:true}).filter({has:page.getByRole('button',{name:'설정 닫기'})})
 await expect(settings).toBeVisible()
 await expect(settings.getByRole('slider')).toHaveCount(3)
 await page.getByRole('button',{name:'설정 닫기'}).click()
 await expect(settings).toBeHidden()
 expect(ads).toEqual([]);expect(errors).toEqual([])
})
