import {describe,expect,it} from 'vitest'
import {buildServiceJumpPadArt,jumpArt} from '../../src/layout-preview/jumpGeometry'
import {vrBoothArt} from '../../src/world/art/activityPropGeometry'

describe('current park feedback visuals',()=>{
 it('keeps a single flat cloud cap at the landing height in both art profiles',()=>{
  for(const geometry of [jumpArt.cloud.paint!,buildServiceJumpPadArt().cloud.paint!]){
   const positions=geometry.getAttribute('position')
   const cap:number[]=[]
   for(let i=0;i<positions.count;i++){
    if(positions.getY(i)===0)cap.push(Math.hypot(positions.getX(i),positions.getZ(i)))
   }
   expect(cap.length).toBeGreaterThan(3)
   expect(Math.max(...cap)).toBeLessThan(.68)
   geometry.computeBoundingBox()
   expect(geometry.boundingBox!.max.y).toBe(0)
  }
 })
 it('gives the pastry a full rounded body while preserving its landing plane',()=>{
  const geometry=jumpArt.fish.paint!
  geometry.computeBoundingBox()
  const box=geometry.boundingBox!
  expect(box.max.y-box.min.y).toBeGreaterThan(1)
  expect(box.max.y).toBeLessThan(.08)
  expect(box.min.y).toBeLessThan(-1)
 })
 it('separates the hall apron from the generated paving and its own stone trim',()=>{
  const p=vrBoothArt.stone!.getAttribute('position'),ys:number[]=[]
  for(let i=0;i<p.count;i++)if(Math.abs(Math.abs(p.getX(i))-6.25)<.001&&Math.abs(Math.abs(p.getZ(i))-4.3)<.001)ys.push(p.getY(i))
  expect(ys.length).toBeGreaterThan(0)
  expect(Math.max(...ys)).toBeCloseTo(.16,5)
  expect(Math.max(...ys)-.14).toBeGreaterThan(.015)
 })
})
