import {expect,it} from 'vitest'
import {buildFitnessFence} from '../../park-renewal-preview/fitnessFenceGeometry'
import {FITNESS_FENCE,fitnessFenceSegments} from '../../park-renewal-preview/motionPlan'
import {heightAt} from '../../park-renewal-preview/plan'

it('현재 울타리 선분은 네 출입구 사이에서 같은 방향으로 끊김 없이 이어진다',()=>{
 const segments=fitnessFenceSegments(),key=(point:readonly number[])=>point.map(value=>value.toFixed(6)).join(',')
 const degree=new Map<string,number>()
 for(const {a,z} of segments)for(const point of [a,z])degree.set(key(point),(degree.get(key(point))??0)+1)
 let runs=0
 for(let i=0;i<segments.length;i++){
  const segment=segments[i]!,previous=segments[i-1]
  if(!previous||key(previous.z)!==key(segment.a)){
   // 연결점인데 순서/방향이 바뀌었다면 출입구로 오인하지 않고 실패한다.
   expect(degree.get(key(segment.a))).toBe(1)
   if(previous)expect(degree.get(key(previous.z))).toBe(1)
   runs++
  }
 }
 expect(degree.get(key(segments.at(-1)!.z))).toBe(1)
 expect(runs).toBe(4)
 expect([...degree.values()].filter(count=>count===1)).toHaveLength(8)
 expect([...degree.values()].every(count=>count===1||count===2)).toBe(true)
})

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
