import {describe,it,expect} from 'vitest'
import {FITNESS_STATIONS,isOnLakeCrossing} from '../../src/park/mapConfig'
import {DRAFT_FITNESS_STATIONS} from '../../src/layout-preview/layout'
import {fitnessAnchors} from '../../src/features/fitness/anchors'
import {renewalAnchors} from '../../src/park-renewal/runtime/placements'
import {renewalPigeonHabitat} from '../../src/park-renewal/LakeAndParkDetails'
import {stepBird} from '../../src/world/pigeons/pigeonSimulation'
import {createPigeonVisitorSampler} from '../../src/world/pigeons/visitorMotion'
import {accessWalkPatches,localPoint} from '../../src/park-renewal/accessSurfaces'
import {renewalWalkSupports} from '../../src/park-renewal/walkSupportExport'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
import {canTravel,clearSolidMotion} from '../../src/park-renewal/travelMotion'
import {BRIDGE,site,heightAt,REST_PAVILIONS,SUB_PAVILION_SCALE} from '../../src/park-renewal/plan'
import {renewalSolidBoxes,blocksSolidPoint} from '../../src/park-renewal/solidCollision'

describe('latest park interaction and traversal contracts',()=>{
 it('uses the visible inversion station kind/name/base height while keeping its persistent ID',()=>{
  for(const visible of DRAFT_FITNESS_STATIONS){
   const runtime=FITNESS_STATIONS.find(s=>s.id===visible.id)!,mapped=renewalAnchors.find(r=>r.kind==='fitness'&&r.id===visible.id)!
   expect(runtime.kind).toBe(visible.kind);expect(runtime.name).toBe(visible.name)
   expect(fitnessAnchors(runtime.id).use.y).toBeCloseTo(mapped.use!.y,8)
  }
  expect(FITNESS_STATIONS.find(s=>s.id==='backmassage')!.kind).toBe('inversion')
  expect(FITNESS_STATIONS.find(s=>s.id==='backmassage')!.name).toContain('거꾸로 매달리기')
 })
 it('gives every compact spawn a reachable escape landing, while walking stays quiet',()=>{
  for(let flock=0;flock<renewalPigeonHabitat.sites.length;flock++)for(const [i,bird]of renewalPigeonHabitat.spawn(flock).entries()){
   const visitors=[{x:bird.x-2.5,y:bird.y+.8,z:bird.z,vx:8,vz:0}]
   stepBird(bird,.05,visitors,renewalPigeonHabitat.sites[flock],renewalPigeonHabitat.environment)
   expect(bird.mode,`flock ${flock} bird ${i}`).toBe('fly')
   const old={x:bird.x,z:bird.z};stepBird(bird,.05,[],renewalPigeonHabitat.sites[flock],renewalPigeonHabitat.environment)
   expect(Math.hypot(bird.x-old.x,bird.z-old.z)).toBeGreaterThan(0)
  }
  const bird=renewalPigeonHabitat.spawn(0)[0]!
  stepBird(bird,.05,[{x:bird.x-2.5,y:bird.y+.8,z:bird.z,vx:2,vz:0}],renewalPigeonHabitat.sites[0],renewalPigeonHabitat.environment)
  expect(bird.mode).not.toBe('fly')
 })
 it('samples actual display motion and drops departed visitors without a stale velocity',()=>{
  const sample=createPigeonVisitorSampler()
  expect(sample('a',{x:0,y:4.8,z:0},0,true,8).vx).toBe(0)
  expect(sample('a',{x:.128,y:4.8,z:0},16,true,8).vx).toBeCloseTo(8)
  expect(sample('a',{x:.256,y:4.8,z:0},32,false,8).vx).toBe(0)
  sample.retain(new Set())
  expect(sample('a',{x:.384,y:4.8,z:0},48,true,8).vx).toBe(0)
 })
 it('exports both the bridge above water and all three tower turns with upward support normals',()=>{
  const {meshes}=renewalWalkSupports()
  expect(meshes.some(m=>m.id==='renewal-lake-bridge')).toBe(true)
  const ramp=meshes.find(m=>m.id==='renewal-tower-ramp')!
  expect(Math.max(...ramp.vertices.filter((_,i)=>i%3===1))-Math.min(...ramp.vertices.filter((_,i)=>i%3===1))).toBeCloseTo(40)
  for(const mesh of meshes)for(let i=0;i<mesh.indices.length;i+=3){
   const [a,b,c]=mesh.indices.slice(i,i+3).map(n=>mesh.vertices.slice(n*3,n*3+3))
   const up=(b![2]!-a![2]!)*(c![0]!-a![0]!)-(b![0]!-a![0]!)*(c![2]!-a![2]!)
   expect(up,mesh.id).toBeGreaterThan(0)
  }
  expect(isOnLakeCrossing((BRIDGE.x0+BRIDGE.x1)/2,BRIDGE.z)).toBe(true)
  let x:number=BRIDGE.x0,y=parkWalkSurface(x,BRIDGE.z)
  for(let i=1;i<=220;i++){
   const next=BRIDGE.x0+(BRIDGE.x1-BRIDGE.x0)*i/220,top=parkWalkSurface(next,BRIDGE.z)
   expect(canTravel([x,BRIDGE.z],[next,BRIDGE.z],y,'walk',Math.PI/2)).toBe(true)
   expect(canTravel([next,BRIDGE.z],[x,BRIDGE.z],top,'walk',-Math.PI/2)).toBe(true)
   x=next;y=top
  }
 })
 it('keeps small consecutive stair height changes and permits both directions through the real entries',()=>{
  for(const patch of accessWalkPatches().filter(p=>p.id.includes('stairs'))){
   const [a,b,c,d]=patch.outline,start=[(a![0]+b![0])/2,(a![1]+b![1])/2]as const,end=[(c![0]+d![0])/2,(c![1]+d![1])/2]as const
   const count=Math.ceil(Math.hypot(end[0]-start[0],end[1]-start[1])/.05)
   let previous=start,y=parkWalkSurface(...previous)
   for(let i=1;i<=count;i++){
    const point=[start[0]+(end[0]-start[0])*i/count,start[1]+(end[1]-start[1])*i/count]as const,next=parkWalkSurface(...point,y)
    expect(Math.abs(next-y),patch.id).toBeLessThan(.12)
    expect(canTravel(previous,point,y,'walk',0),patch.id+' down').toBe(true)
    expect(canTravel(point,previous,next,'walk',Math.PI),patch.id+' up').toBe(true)
    previous=point;y=next
   }
  }
 })
 it('blocks table bodies, pillars and plinth sides while leaving the sub-pavilion entry open',()=>{
  for(const r of renewalAnchors.filter(r=>r.kind==='table'&&r.status==='mapped'))expect(canTravel([r.position![0]-.1,r.position![2]],[r.position![0],r.position![2]],r.floorY!,'walk',0),r.id).toBe(false)
  const main=site('pavilion')
  expect(canTravel([main.x+10,main.z],[main.x+8,main.z],heightAt(main.x,main.z)+.085,'walk',0)).toBe(false)
  const [x,z]=REST_PAVILIONS[0]!,yaw=site('rest-1').yaw!,unit=1.1*SUB_PAVILION_SCALE
  const a=localPoint(0,3.76*unit,x,z,yaw),b=localPoint(0,3.71*unit,x,z,yaw)
  expect(canTravel(a,b,parkWalkSurface(...a),'walk',yaw)).toBe(true)
 })
 it('activates outdoor side-stool collision only with the approved presented chair count',()=>{
  const rows=renewalAnchors,table=rows.find(r=>r.kind==='table'&&r.status==='mapped'&&!r.pavilionId)!,seat=table.seats![2]!.use,boxes=renewalSolidBoxes(rows)
  expect(blocksSolidPoint(boxes,seat.x,seat.z,table.floorY!,new Map([[table.id,2]]))).toBe(false)
  expect(blocksSolidPoint(boxes,seat.x,seat.z,table.floorY!,new Map([[table.id,4]]))).toBe(true)
 })
 it('keeps solid table sweeps while airborne and permits passing above their finite height',()=>{
  const table=renewalAnchors.find(r=>r.kind==='table'&&r.status==='mapped'&&!r.pavilionId)!,[x,,z]=table.position!,floor=table.floorY!
  expect(clearSolidMotion([x-3,z],[x+3,z],floor+1)).toBe(false)
  expect(clearSolidMotion([x-3,z],[x+3,z],floor+4)).toBe(true)
 })
})
