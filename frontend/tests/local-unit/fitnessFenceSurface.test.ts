import {expect,it} from 'vitest'
import {buildFitnessFence} from '../../park-renewal-preview/fitnessFenceGeometry'
import {FITNESS_FENCE,fitnessFenceSegments} from '../../park-renewal-preview/motionPlan'
import {heightAt} from '../../park-renewal-preview/plan'

it('운동장 울타리 기둥과 덮개에 동일한 삼각형을 중복 생성하지 않는다',()=>{
 const art=buildFitnessFence()
 try{
  for(const geometry of Object.values(art)){
   const positions=geometry.getAttribute('position'),indices=geometry.index,faces=new Set<string>()
   const count=indices?.count??positions.count
   for(let i=0;i<count;i+=3){
    const vertices=[0,1,2].map(offset=>{
     const vertex=indices?indices.getX(i+offset):i+offset
     return [positions.getX(vertex),positions.getY(vertex),positions.getZ(vertex)].map(value=>value.toFixed(5)).join(',')
    }).sort().join('|')
    expect(faces.has(vertices),vertices).toBe(false)
    faces.add(vertices)
   }
  }
  const caps=art.tile!
  caps.computeBoundingBox()
  const points=fitnessFenceSegments().flatMap(({a,z})=>[a,z])
  expect(caps.boundingBox!.min.x).toBeCloseTo(Math.min(...points.map(p=>p[0]))-.125,4)
  expect(caps.boundingBox!.max.x).toBeCloseTo(Math.max(...points.map(p=>p[0]))+.125,4)
  expect(caps.boundingBox!.max.y).toBeCloseTo(Math.max(...points.map(p=>heightAt(...p)))+FITNESS_FENCE.height,4)
  art.wood!.computeBoundingBox()
  expect(art.wood!.boundingBox!.max.y).toBeLessThanOrEqual(caps.boundingBox!.max.y-.0999)
 }finally{Object.values(art).forEach(geometry=>geometry.dispose())}
})
