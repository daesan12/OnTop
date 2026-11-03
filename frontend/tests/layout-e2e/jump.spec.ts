import { test,expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { jumpProbe } from './jumpProbe'

test('planned course renders all themes and supports keyboard jumping, material feedback, manual and completion HUD',async({page})=>{
  const errors:string[]=[],consoleErrors:string[]=[],network:string[]=[]
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});page.on('request',r=>{if(/\/api\/|\/ws\/|\.glb/.test(r.url()))network.push(r.url())})
  await page.goto('/layout-preview.html');await expect(page.getByText('배치 준비 완료',{exact:true})).toBeVisible({timeout:90000})
  const probe=():Promise<ReturnType<typeof jumpProbe>>=>page.evaluate(async()=> (await import('/tests/layout-e2e/jumpProbe.ts' as string)).jumpProbe())
  const initial=await probe();expect(initial.pads).toBe(107);expect(initial.gates).toBe(6);expect(initial.models.every(Boolean)).toBe(true)
  await page.getByRole('button',{name:'점프맵 체험',exact:true}).click()
  await expect(page.getByText('첫 발판을 밟으면 시작해요.',{exact:false})).toBeVisible()
  await page.waitForTimeout(700)
  await page.keyboard.down('w');await expect.poll(async()=> (await probe()).z).toBeLessThan(initial.firstPad.z+2.6)
  await page.keyboard.press('Space');await expect.poll(async()=> (await probe()).z).toBeLessThan(initial.firstPad.z+.35);await page.keyboard.up('w')
  await expect.poll(async()=> (await probe()).active,{timeout:10000}).toBe(true)
  await expect(page.getByLabel('점프맵 도전 상태')).toContainText('석탑')
  await expect.poll(async()=> (await probe()).visual.hits).toBeGreaterThan(0)
  await page.keyboard.press('F1');await expect(page.getByRole('dialog',{name:'돌탑 점프맵 설명서'})).toBeVisible();await page.getByRole('button',{name:'설명서 닫기',exact:true}).click()
  const artifacts=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'ontop-layout-qa');await fs.mkdir(artifacts,{recursive:true})
  const shot=(name:string)=>page.screenshot({path:path.join(artifacts,name+'.png')})
  await shot('jump-first-landing')
  // Leaving an unfinished challenge must restore the whole park's ghost course.
  await page.getByRole('button',{name:'조감도',exact:true}).click()
  await expect.poll(async()=> (await probe()).maxFade).toBeLessThan(.25)
  await page.getByRole('button',{name:'점프맵 체험',exact:true}).click()
  await page.getByRole('button',{name:'전체 코스 살펴보기',exact:true}).click();await page.waitForTimeout(700);await shot('jump-entire-course')
  const review=page.getByLabel('점프맵 구간 둘러보기')
  for(const [i,theme] of ['석탑','오목돌','붕어빵','구름','청사초롱','방패연','연잎'].entries()) {
    await review.getByRole('button',{name:new RegExp(theme)}).click();await page.waitForTimeout(400);await shot('jump-stage-'+(i+1))
  }
  await page.getByRole('button',{name:'출발 자리에서 체험',exact:true}).click()
  for(let i=0;i<7;i++) {await page.evaluate(async n=>(await import('/tests/layout-e2e/jumpProbe.ts' as string)).stageLandingFixture(n),i);await page.waitForTimeout(180)}
  expect((await probe()).visual.lastTheme).toBe('lily')
  await page.evaluate(async()=> (await import('/tests/layout-e2e/jumpProbe.ts' as string)).completeJumpFixture())
  await expect(page.getByLabel('점프맵 결과')).toContainText('완주!');await expect(page.getByLabel('미리보기 엽전')).toContainText('오늘 250 / 500냥');await shot('jump-complete')
  expect(network).toEqual([]);expect(errors).toEqual([]);expect(consoleErrors).toEqual([])
})
