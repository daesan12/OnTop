import {it,expect} from 'vitest'
import receipt from '../park-detail-220/evidence/dev-jump-six-verified.json'
import {JUMP_PADS,JUMP_GATES,DEV_JUMP_TRANSLATION,JUMP_START} from '../../src/park-renewal/jump10Plan'
import {site,NODES,EDGES,DOCK_ACCESS,distanceToSegment,LAKE,footprintDistance} from '../../src/park-renewal/plan'
import {isPlantingGround} from '../../src/park-renewal/groundPlan'
import {summitFenceSections} from '../../src/park-renewal/summitWalls'
import {hillEdgeSections} from '../../src/park-renewal/hillEdgesPlan'

it('현재 dev 배포 JS에서 추출한 93개 발판·6개 관문의 크기·간격·단차가 평행 이동 후에도 동일',()=>{
 const original=[...receipt.data.pads,...receipt.data.gates],local=[...JUMP_PADS,...JUMP_GATES].filter(p=>p.stage<6)
 expect(original).toHaveLength(99);expect(local).toHaveLength(99)
 for(const p of original){const q=local.find(q=>q.sourceId===p.id)!;expect(q,p.id).toBeDefined();expect(q.x-p.x).toBeCloseTo(DEV_JUMP_TRANSLATION.x,8);expect(q.z-p.z).toBeCloseTo(DEV_JUMP_TRANSLATION.z,8);expect(q.height-p.height).toBeCloseTo(DEV_JUMP_TRANSLATION.y,8);for(const key of['halfX','halfZ','radius','thickness','yaw']as const)expect(q[key],p.id+': '+key).toBe(p[key])}
})
it('새 점프맵 진입 길이 첫 발판 앞까지 이어지고 안내 비석은 길 옆 잔디에 있음',()=>{
 const edge=EDGES.find(([a,b])=>a==='jump'&&b==='jumpEntry')!;expect(edge[2]).toBeGreaterThanOrEqual(4.5)
 expect(NODES.jumpEntry).toEqual([JUMP_START.x,JUMP_START.z]);const s=site('stele');expect(isPlantingGround(s.x,s.z)).toBe(true);expect(s.node).toBe('jumpApproach');expect(Math.hypot(s.x-JUMP_START.x,s.z-JUMP_START.z)).toBeGreaterThan(7);expect(Math.hypot(s.x-JUMP_START.x,s.z-JUMP_START.z)).toBeLessThan(13)
 for(const x of[-69.4,-62.6])expect(isPlantingGround(x,24)).toBe(true)
})
it('두더지 옆길 7m·낚시터 순환 길 6m·분수 동쪽 8m 통행 폭 유지',()=>{
 for(const [a,b]of[['arcadeEast','moleWest'],['moleWest','pigeon'],['east-mid','fishing'],['fishing','fishingBypass'],['fishingBypass','east-north'],['entranceEast','entranceEastNorth'],['entranceEastNorth','pavilionBypass'],['pavilionBypass','east-south']])expect(EDGES.find(e=>e[0]===a&&e[1]===b)![2]).toBeGreaterThanOrEqual(a==='entranceEast'||a==='entranceEastNorth'||a==='pavilionBypass'?8:a==='east-mid'||a==='fishing'||a==='fishingBypass'?6:7)
 expect(site('fountain').z).toBe(58)
 const s=site('mobility-lake');for(const[a,b,w]of EDGES)for(let t=0;t<=1;t+=.025){const p=NODES[a]!,q=NODES[b]!;expect(footprintDistance(s,p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t)-w/2).toBeGreaterThan(.1)}
})
it('선착장 목재 진입로는 주 도로의 가장자리에서 30cm만 겹쳐 닿음',()=>{
 const p=DOCK_ACCESS.points[0]!,a=NODES.dock!,b=NODES['east-south']!;expect(distanceToSegment(...p,a,b)).toBeCloseTo(2.2,5);expect(p[1]).toBeLessThan(27);expect(DOCK_ACCESS.top).toBeGreaterThan(LAKE.y)
})
it('정상 울타리의 직각 모서리가 같은 점에서 맞물리고 오름길 난간과도 연결',()=>{
 const key=(p:number[])=>p.map(v=>v.toFixed(3)).join(',');const count=new Map<string,number>();for(const s of summitFenceSections)for(const p of[s.a,s.z])count.set(key(p),(count.get(key(p))??0)+1)
 const loose=[...count].filter(([,n])=>n===1);expect(loose.length).toBeLessThanOrEqual(8)
 for(const [k]of loose){const p=k.split(',').map(Number);if(p[0]!< -25&&p[2]!> -65)expect(hillEdgeSections.some(s=>[s.a,s.z].some(q=>key(q)===k)&&!summitFenceSections.includes(s)),k).toBe(true)}
})
// The previous sauna contract was replaced by horrorZone.test.ts.
