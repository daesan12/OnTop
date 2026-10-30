import {test,expect} from '@playwright/test'
import {KIOSKS} from '../../src/layout-preview/layout'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type {plazaStructureProbe,rankingBoardProbe} from './plazaStructureProbe'

test('lucky facility mocks and ranking board retain their independent models and interactions',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.goto('/layout-preview.html');await expect(page.getByText('배치 준비 완료',{exact:true})).toBeVisible({timeout:90000})
 const joints:ReturnType<typeof plazaStructureProbe>=await page.evaluate(async()=>(await import('/tests/layout-e2e/plazaStructureProbe.ts' as string)).plazaStructureProbe())
 const dir=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'ontop-plaza-structure');await fs.mkdir(dir,{recursive:true})
 for(const asset of joints){
  const k=KIOSKS.find(k=>k.kind===asset.kind)!
  expect(asset.position).toEqual([k.x,0,k.z]);expect(asset.yaw).toBe(k.yaw)
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
  await expect(page.getByRole('dialog')).toContainText(k.kind==='photo'?'공사 중':k.kind==='shop'?'행운의 돌림판':'오늘의 복권방')
  await page.keyboard.press('Escape')
 }
 const rankingBoard:ReturnType<typeof rankingBoardProbe>=await page.evaluate(async()=>
  (await import('/tests/layout-e2e/plazaStructureProbe.ts' as string)).rankingBoardProbe())
 const photo=KIOSKS.find(k=>k.kind==='photo')!
 expect(rankingBoard.position).toEqual([photo.x,0,photo.z])
 expect(rankingBoard.yaw).toBe(photo.yaw)
 expect(rankingBoard.assetId).toBe('procedural/ranking-board')
 expect(rankingBoard.meshCount).toBe(9)
 expect(rankingBoard.metrics).toMatchObject({displayPlaneCount:3,structureTextureCount:0})
 expect(rankingBoard.metrics.triangleCount).toBeLessThan(500)
 expect(errors).toEqual([])
})
