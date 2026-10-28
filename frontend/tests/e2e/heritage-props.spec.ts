import { expect, test } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { feedbackFixture } from './feedbackFixture'
import { notesFixture } from './notesFixture'
import { MAILBOX } from '../../src/config/parkPlan'
import { NOTES_BOX } from '../../src/config/notes'

for(const kind of ['mailbox','notes'] as const)test(`${kind} reference detail retains world bounds, LOD and E interaction`,async({page})=>{
  const p=kind==='notes'?NOTES_BOX:MAILBOX,base=kind==='notes'?NOTES_BOX.y:0,errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())})
  await fixture(page,{manualMovement:true,position:{x:p.x,y:base+.8,z:p.z+1.5,yaw:Math.PI}})
  if(kind==='notes')await notesFixture(page);else await feedbackFixture(page)
  await page.goto('/park');await expect(page.getByLabel('공원 기본 화면')).toBeVisible();await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
  const view=async(yaw:number,distance=3.1)=>page.evaluate(async({kind,yaw,distance})=>{
    (await import('/tests/e2e/codePropsProbe.ts' as string)).heritageView(kind,yaw,distance)
  },{kind,yaw,distance})
  const probe=()=>page.evaluate(async kind=>(await import('/tests/e2e/codePropsProbe.ts' as string)).heritageProbe(kind),kind)
  await page.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.6));await view(.2)
  await expect.poll(async()=>(await probe()).lod).toBe(0)
  const state=await probe(),half=kind==='notes'?[.65,.48]:[MAILBOX.bodyHalfWidth,MAILBOX.bodyHalfDepth]
  expect(state.position).toEqual([p.x,base,p.z]);expect(state.min[0]).toBeGreaterThanOrEqual(p.x-half[0]!-.001);expect(state.max[0]).toBeLessThanOrEqual(p.x+half[0]!+.001)
  expect(state.min[2]).toBeGreaterThanOrEqual(p.z-half[1]!-.001);expect(state.max[2]).toBeLessThanOrEqual(p.z+half[1]!+.001);expect(state.max[1]).toBeLessThanOrEqual(base+(kind==='notes'?1.72:MAILBOX.height)+.001)
  expect(state.far).toBeLessThan(state.near*.7);await page.waitForTimeout(400);await screenshot(page,`heritage-v2-${kind}-front`)
  await view(.95);await page.waitForTimeout(300);await screenshot(page,`heritage-v2-${kind}-side`)
  await page.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.05));await page.waitForTimeout(400);await screenshot(page,`heritage-v2-${kind}-night`)
  await view(.25,28);await expect.poll(async()=>(await probe()).lod).toBe(1)
  await view(.2);await expect.poll(async()=>(await probe()).lod).toBe(0)
  await page.getByLabel('가까운 상호작용').getByRole('button',{name:kind==='notes'?/익명 메모/:/소리함/}).click()
  const dialog=page.getByRole('dialog',{name:kind==='notes'?'전망대 익명 메모':'온탑 소리함',exact:true});await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();expect(errors).toEqual([])
})
