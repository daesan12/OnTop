import {test,expect} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {PARK_DATA} from '../../src/map/park'
import type {facilityCompletionProbe} from './facilityCompletionProbe'

test('restores fountain seats, seats all forest benches, and separates the active ranking board from construction notices',async({page})=>{
  const errors:string[]=[],requests:string[]=[]
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  page.on('request',r=>{if(/\/api\/|\/ws\//.test(r.url()))requests.push(r.url())})
  await page.setViewportSize({width:1280,height:720})
  await page.goto('/layout-preview.html');await expect(page).toHaveTitle('OnTop · 180m 공원 배치 시안')
  await expect(page.getByText('배치 준비 완료',{exact:true})).toBeVisible({timeout:90000})
  const probe=():Promise<ReturnType<typeof facilityCompletionProbe>>=>page.evaluate(async()=>(await import('/tests/layout-e2e/facilityCompletionProbe.ts' as string)).facilityCompletionProbe())
  const p=await probe()
  expect(p.vrTables.every(t=>t.exists)).toBe(true);expect(p.benches).toHaveLength(7)
  for(const b of p.benches){expect(b.exists).toBe(true);for(const top of b.tops)expect(top).toBeCloseTo(b.expectedTop,3)}
  const dir=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'ontop-facility-completion')
  await fs.mkdir(dir,{recursive:true})
  const shot=(name:string)=>page.screenshot({path:path.join(dir,name+'.png')})
  const select=(pattern:RegExp)=>page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:pattern}).click()
  await select(/06.*분수/);await page.waitForTimeout(500);await shot('fountain-four-benches')
  await page.getByRole('button',{name:'분수 벤치 1 체험',exact:true}).click()
  const hud=page.getByRole('region',{name:'공원 벤치 이용'})
  await expect(hud).toBeVisible();await hud.getByRole('button',{name:'1번 좌석에 앉기'}).click()
  await expect.poll(async()=>(await probe()).seated?.benchId).toBe('bench-76')
  await page.keyboard.press('KeyE');await expect.poll(async()=>(await probe()).seated).toBeNull()
  const forests=PARK_DATA.interactions.benches.filter(b=>b.siteId.startsWith('bench-forest-'))
  for(const [i,b] of forests.entries()){
    await select(/09.*수목/);await page.getByRole('button',{name:`숲 벤치 ${i+1} 체험`,exact:true}).click()
    await expect(hud).toBeVisible()
    for(const seat of [1,2]){
      await hud.getByRole('button',{name:`${seat}번 좌석에 앉기`}).click()
      await expect.poll(async()=>(await probe()).seated?.benchId).toBe(b.id)
      await page.keyboard.press('KeyE');await expect.poll(async()=>(await probe()).seated).toBeNull()
      expect((await probe()).position).toEqual([b.seats[seat-1]!.exit.x,b.seats[seat-1]!.exit.z])
    }
  }
  await page.getByRole('button',{name:'조감도',exact:true}).click()
  await select(/14.*복권방/)
  await page.getByRole('button',{name:'무료 목업 체험',exact:true}).click()
  const lottery=page.getByRole('dialog',{name:/복권방 행운의 뽑기/})
  await expect(lottery).toBeVisible();await expect(lottery.getByRole('heading',{level:2})).toHaveText('행운의 뽑기')
  await shot('lottery-14')
  await page.keyboard.press('Escape');await expect(lottery).toBeHidden()
  await select(/15.*랭킹 보드/)
  await expect(page.getByRole('button',{name:'공사 안내 보기',exact:true})).toHaveCount(0)
  await expect(page.getByLabel('선택한 시설')).toContainText('보유량·승부사·승수 표시용 보드')
  await select(/14.*복권방/)
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'무료 목업 체험',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:/복권방 행운의 뽑기/}),bounds=await dialog.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390)
  await shot('construction-mobile')
  expect(errors).toEqual([]);expect(requests).toEqual([]);await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
