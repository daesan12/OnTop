import {test,expect} from '@playwright/test'
import {KIOSKS,KIOSK_FENCE_RUNS} from '../../src/layout-preview/layout'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type {plazaStructureProbe,rankingBoardProbe,plazaPlacementProbe} from './plazaStructureProbe'

test('lucky facility mocks and ranking board retain their independent models and interactions',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.goto('/layout-preview.html');await expect(page.getByText('배치 준비 완료',{exact:true})).toBeVisible({timeout:90000})
 const joints:ReturnType<typeof plazaStructureProbe>=await page.evaluate(async()=>(await import('/tests/layout-e2e/plazaStructureProbe.ts' as string)).plazaStructureProbe())
 const dir=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'ontop-plaza-structure');await fs.mkdir(dir,{recursive:true})
 for(const asset of joints){
  const k=KIOSKS.find(k=>k.kind===asset.kind)!
  expect(asset.position).toEqual([k.x,0,k.z]);expect(asset.yaw).toBeCloseTo(k.yaw,12)
  expect(asset.assetId).toBe('procedural/plaza-'+k.kind);expect(asset.boundsValid).toBe(true)
  expect(asset.roofJoints.every(Boolean)).toBe(true)
  expect(asset.signBrackets.every(Boolean)).toBe(true)
  expect(asset.pillarJoints.every(Boolean)).toBe(true)
  expect(asset.wheelOnly).toBe(true)
  if(asset.kind==='shop'){expect(asset.minY).toBeCloseTo(0);expect(asset.width).toBeGreaterThan(3);expect(asset.width).toBeLessThan(k.width)}
  expect(asset.boardPosts.every(p=>p.wood&&p.floor)).toBe(true)
  const no={shop:'13',drink:'14',photo:'15'}[k.kind]
  await page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:new RegExp('^'+no)}).click()
  await page.waitForTimeout(700);await page.screenshot({path:path.join(dir,k.kind+'-connected.png')})
  await page.getByRole('button',{name:k.kind==='photo'?'공사 안내 보기':'무료 목업 체험',exact:true}).click()
  await expect(page.getByRole('dialog')).toContainText(k.kind==='photo'?'공사 중':k.kind==='shop'?'행운의 돌림판':'응모·추첨 안내')
  await page.keyboard.press('Escape')
 }
 const rankingBoard:ReturnType<typeof rankingBoardProbe>=await page.evaluate(async()=>
  (await import('/tests/layout-e2e/plazaStructureProbe.ts' as string)).rankingBoardProbe())
 const photo=KIOSKS.find(k=>k.kind==='photo')!
 expect(rankingBoard.position).toEqual([photo.x,0,photo.z])
 expect(rankingBoard.yaw).toBe(photo.yaw)
 expect(rankingBoard.scale).toEqual([1.06,1.06,1.06])
 expect(rankingBoard.assetId).toBe('procedural/ranking-board')
 expect(rankingBoard.meshCount).toBe(9)
 expect(rankingBoard.metrics).toMatchObject({displayPlaneCount:3,structureTextureCount:0})
 expect(rankingBoard.metrics.triangleCount).toBeLessThan(1000)
 await fs.writeFile(path.join(dir,'ranking-board-metrics.json'),JSON.stringify(rankingBoard.metrics,null,2))
 for(const side of ['front','back'] as const){
  const capture=await page.evaluate(async side=>
   (await import('/tests/layout-e2e/plazaStructureProbe.ts' as string)).rankingBoardDetailCapture(side),side)
  await fs.writeFile(path.join(dir,'ranking-'+side+'-connected.png'),Buffer.from(capture.split(',')[1]!,'base64'))
 }
 expect(errors).toEqual([])
})

test('the full facility outlines and courtyard fences stay inside their lawn pockets',async({page})=>{
 await page.goto('/layout-preview.html')
 await expect(page.getByText('배치 준비 완료',{exact:true})).toBeVisible({timeout:90000})
 const bounds:ReturnType<typeof plazaPlacementProbe>=await page.evaluate(async()=>
  (await import('/tests/layout-e2e/plazaStructureProbe.ts' as string)).plazaPlacementProbe())
 for(const b of bounds){
  const [left,right,north,south]=b.name==='fish-bread-shop-exterior'?[-37,-20,28,44]:
   ['ranking-board-preview','feedback-mailbox'].includes(b.name)?[20,37,28,44]:[20,37,48,60]
  expect(b.min[0],b.name+' west').toBeGreaterThan(left!+.2)
  expect(b.max[0],b.name+' east').toBeLessThan(right!-.2)
  expect(b.min[2],b.name+' north').toBeGreaterThan(north!+.2)
  expect(b.max[2],b.name+' south').toBeLessThan(south!-.2)
  const nearestX=Math.max(b.min[0]!,Math.min(0,b.max[0]!))
  const nearestZ=Math.max(b.min[2]!,Math.min(46,b.max[2]!))
  expect(Math.hypot(nearestX,nearestZ-46),b.name+' plaza clearance').toBeGreaterThan(24.35)
 }
 for(const fence of KIOSK_FENCE_RUNS){
  const [north,south]=fence.id.startsWith('kiosk-photo-')?[28,44]:[48,60]
  // Posts/caps extend .17m beyond each fence endpoint.
  for(const [x,z] of [fence.from,fence.to]){
   expect(x-.17,fence.id).toBeGreaterThan(20)
   expect(x+.17,fence.id).toBeLessThan(37)
   expect(z-.17,fence.id).toBeGreaterThan(north!)
   expect(z+.17,fence.id).toBeLessThan(south!)
  }
 }
 await expect(page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:/^13/})).toHaveCount(0)
 const approach=await page.evaluate(async()=>
  (await import('/tests/layout-e2e/plazaStructureProbe.ts' as string)).plazaLawnProbe())
 expect(approach.every(Boolean)).toBe(true)
 const mailbox=await page.evaluate(async()=>
  (await import('/tests/layout-e2e/plazaStructureProbe.ts' as string)).mailboxPoseProbe())
 expect(mailbox.position).toEqual([24.2,0,30.4])
 expect(mailbox.scale).toEqual([1.9,1.9,1.9])
 expect(mailbox.yaw).toBeCloseTo(Math.atan2(-24.2,46-30.4),12)
 const dir=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'ontop-plaza-placement-qa')
 await fs.mkdir(dir,{recursive:true})
 await fs.writeFile(path.join(dir,'placement-bounds.json'),JSON.stringify(bounds,null,2))
 const capture=await page.evaluate(async()=>
  (await import('/tests/layout-e2e/plazaStructureProbe.ts' as string)).plazaPlanCapture())
 await fs.writeFile(path.join(dir,'after-plan.png'),Buffer.from(capture.split(',')[1]!,'base64'))
 await page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:/^15/}).click()
 await page.waitForTimeout(500)
 await page.screenshot({path:path.join(dir,'ranking-mailbox.png')})
 await page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:/^28/}).click()
 await page.waitForTimeout(500)
 await page.screenshot({path:path.join(dir,'fish-grove.png')})
})
