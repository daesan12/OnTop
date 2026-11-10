import {expect,it} from 'vitest'
import {SIGNPOSTS} from '../../src/park-renewal/landscapePlan'
import {plantings,treeOverlapCleanup,treeCount} from '../../src/park-renewal/landscape'
import {treeEnvelope,treesOverlap} from '../../src/park-renewal/treeSpacing'
import {fitnessWorldTrees} from '../../src/park-renewal/fitnessTreesPlan'
import {PERIMETER_COLLIDERS,PERIMETER_COLLISION} from '../../src/park-renewal/perimeterCollision'
import {boundaryFrame} from '../../src/park-renewal/contextPlan'
import {insideMovementBoundary,clearMotionSegment} from '../../src/park-renewal/motionPlan'
import {jumpFenceRuns,jumpFenceOpening} from '../../src/park-renewal/jumpFencePlan'
import {hillEdgeSections} from '../../src/park-renewal/hillEdgesPlan'
import {distanceToSegment,site,NODES} from '../../src/park-renewal/plan'
import {factory} from '../../src/park-renewal/assetFactories'
import {orientWayfinding} from '../../src/park-renewal/wayfindingArt'
import {WEST_REST_ROW} from '../../src/park-renewal/landscapeRefinementPlan'

it('모든 이정표 화살표와 한글 표기는 실제 연결된 길의 다음 방향으로 함께 회전한다',()=>{
 expect(SIGNPOSTS).toHaveLength(8)
 for(const sign of SIGNPOSTS){const model=orientWayfinding(factory('sign',sign.boards.length===3?{variant:'crossroads',destinations:sign.boards.map(b=>({label:b.label,direction:'right'}))}:{variant:'wood-arrow',label:sign.boards[0]!.label}),sign)
  expect(model.userData.directions).toHaveLength(sign.boards.length)
  for(const b of sign.boards){const l=Math.hypot(...b.direction);expect(Math.cos(b.yaw)).toBeCloseTo(b.direction[0]/l,8);expect(-Math.sin(b.yaw)).toBeCloseTo(b.direction[1]/l,8);expect(b.path.length).toBeGreaterThan(1);expect(b.path.at(-1)).toEqual(NODES[site(b.target).node])}
 }
 const stele=site('stele'),x=-Math.cos(stele.yaw!),z=Math.sin(stele.yaw!),dx=NODES.jumpEntry![0]-stele.x,dz=NODES.jumpEntry![1]-stele.z
 expect((x*dx+z*dz)/Math.hypot(dx,dz)).toBeCloseTo(1,8)
})

it('공원 생성 수목의 실제 수관과 가지가 서로 또는 보존된 운동마당 수목에 겹치지 않는다',()=>{
 const envelopes=plantings.map(treeEnvelope),fixed=fitnessWorldTrees.map(treeEnvelope),overlaps:string[]=[]
 for(let i=0;i<fixed.length;i++){for(let j=0;j<i;j++)if(treesOverlap(fixed[i]!,fixed[j]!))overlaps.push(`fitness-${i},fitness-${j}`);const e=fixed[i]!;expect(Math.hypot(e.tree.position[0]-WEST_REST_ROW.bench[0],e.tree.position[2]-WEST_REST_ROW.bench[1])).toBeGreaterThan(e.radius+2.5)}
 for(let i=0;i<envelopes.length;i++){for(let j=0;j<i;j++)if(treesOverlap(envelopes[i]!,envelopes[j]!))overlaps.push(`${i},${j}`);for(let j=0;j<fixed.length;j++)if(treesOverlap(envelopes[i]!,fixed[j]!))overlaps.push(`${i},fitness-${j}`)}
 const vr=site('vr');expect(plantings.filter(p=>p.position[2]>vr.z+5&&p.position[2]<vr.z+15&&Math.abs(p.position[0]-vr.x)<12.5)).toEqual([])
 expect(overlaps).toEqual([]);expect(treeCount).toBeGreaterThan(450);expect(treeOverlapCleanup.removed+treeOverlapCleanup.resized).toBeGreaterThan(0)
})

it('360개 충돌 전용 벽은 기와돌담의 실제 선을 따라 틈 없이 이어지고 전망대보다 훨씬 높다',()=>{
 expect(PERIMETER_COLLIDERS).toHaveLength(360);expect(PERIMETER_COLLISION.top).toBeGreaterThan(200)
 for(let i=0;i<360;i++){const c=PERIMETER_COLLIDERS[i]!,a=boundaryFrame(i/360*Math.PI*2),b=boundaryFrame((i+1)/360*Math.PI*2)
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz)
  expect(c.center[0]-dz/length*c.half[2]).toBeCloseTo((a.x+b.x)/2-dz/length*PERIMETER_COLLISION.innerDepth,8);expect(c.center[2]+dx/length*c.half[2]).toBeCloseTo((a.z+b.z)/2+dx/length*PERIMETER_COLLISION.innerDepth,8);expect(c.half[0]).toBeGreaterThan(length/2)
  for(const y of[5,22,45,100,512]){const inner=boundaryFrame(i/360*Math.PI*2,-2),outer=boundaryFrame(i/360*Math.PI*2,2);expect(insideMovementBoundary(outer.x,outer.z,y)).toBe(false);expect(clearMotionSegment([inner.x,inner.z],[outer.x,outer.z],y,{air:true,water:true})).toBe(false)}
 }
})

it('점프맵과 오르막의 같은 경계에 두 겹 울타리가 남지 않고 시작 발판 및 안내판은 열려 있다',()=>{
 for(const run of jumpFenceRuns)for(let i=1;i<run.length;i++){const a=run[i-1]!,b=run[i]!,x=(a[0]+b[0])/2,z=(a[2]+b[2])/2,y=(a[1]+b[1])/2;expect(jumpFenceOpening(x,z)).toBe(false);expect(hillEdgeSections.some(e=>Math.abs((e.a[1]!+e.z[1]!)/2-y)<1&&distanceToSegment(x,z,[e.a[0]!,e.a[2]!],[e.z[0]!,e.z[2]!])<.8)).toBe(false)}
})
