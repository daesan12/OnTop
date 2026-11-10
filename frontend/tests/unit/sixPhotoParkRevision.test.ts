import {it,expect} from 'vitest'
import {Box3,Raycaster,Vector3,Mesh} from 'three'
import {factory} from '../../src/park-renewal/assetFactories'
import {mailboxArt} from '../../src/world/art/mailboxGeometry'
import {GACHA_ASSET} from '../../src/features/gacha/parkAsset/gachaMachineGeometry'
import {MAILBOX_SCALE,SUB_PAVILION_SCALE,TABLES,JUMP_TABLES,BRIDGE,BRIDGE_LANDINGS,bridgeDeckHeight,site,MONUMENT_STAIRS,inLake} from '../../src/park-renewal/plan'
import {TOWER_TOP,onSolidTowerDeck} from '../../src/park-renewal/towerFurniturePlan'
import {JUMP_PADS,JUMP_GATES,JUMP_FINISH,inFinish} from '../../src/park-renewal/jump10Plan'
import {jumpFenceSegments} from '../../src/park-renewal/motionPlan'
import {hillEdgeSections} from '../../src/park-renewal/hillEdgesPlan'
import {isPlantingGround} from '../../src/park-renewal/groundPlan'

it('일반 팔각정의 기둥 안쪽에 8명이 서로 겹치지 않고 서는 공간 확보',()=>{
 const inner=2.38*1.1*SUB_PAVILION_SCALE*Math.cos(Math.PI/8),slots=Array.from({length:8},(_,i)=>[Math.cos(i/8*Math.PI*2)*3.5,Math.sin(i/8*Math.PI*2)*3.5])
 expect(inner).toBeGreaterThan(4.8)
 for(const [i,p]of slots.entries()){expect(Math.hypot(...p)+.4).toBeLessThan(inner);for(const q of slots.slice(i+1))expect(Math.hypot(p[0]!-q[0]!,p[1]!-q[1]!)).toBeGreaterThan(.8)}
 const g=factory('sub',{scale:SUB_PAVILION_SCALE}),floor=g.getObjectByName('pavilion-floor')!.getWorldPosition(new Vector3());expect(floor.y).toBeCloseTo(.572*1.1*SUB_PAVILION_SCALE,4)
})
it('축소한 소리함도 읽을 수 있는 높이를 유지하고 뽑기기계보다 작음',()=>{
 const bounds=new Box3();for(const geometry of Object.values(mailboxArt.near)){geometry.computeBoundingBox();bounds.union(geometry.boundingBox!)}
 const height=(bounds.max.y-bounds.min.y)*MAILBOX_SCALE;expect(height).toBeGreaterThan(3);expect(height).toBeLessThan(GACHA_ASSET.height)
})
it('돌 테이블은 광장에 여섯 개, 점프 시작부 잔디에 한 개이며 점프맵에는 입구를 비운 울타리가 있음',()=>{
 expect(TABLES).toHaveLength(6);expect(JUMP_TABLES).toHaveLength(1);expect(jumpFenceSegments().length).toBeGreaterThan(100)
 for(const [x,z]of JUMP_TABLES)for(const dx of[-2.2,0,2.2])for(const dz of[-2.2,0,2.2])expect(isPlantingGround(x+dx,z+dz),`table corner ${x+dx},${z+dz}`).toBe(true)
})
it('비둘기까지 높은 코스를 유지하고 검정·흰 바둑알 뒤 오리에서 섬에 도착',()=>{
 const stones=JUMP_PADS.filter(p=>p.theme==='gomoku');expect(new Set(stones.map(p=>p.stoneTone))).toEqual(new Set(['white','black']))
 for(const p of JUMP_PADS.filter(p=>p.stage>=6&&p.stage<=8))expect(p.height).toBeGreaterThanOrEqual(JUMP_GATES.find(g=>g.gate===6)!.height)
 expect(inLake(JUMP_FINISH.x,JUMP_FINISH.z)).toBe(false);expect(inFinish(JUMP_FINISH.x,JUMP_FINISH.z)).toBe(true)
 expect(Math.hypot(JUMP_FINISH.x-62,JUMP_FINISH.z+18)).toBeLessThan(15)
})
it('긴 계단과 대석탑 사방 계단 사이에 평평한 길을 두고 바깥 울타리를 연결',()=>{
 const s=site('pagoda');expect(MONUMENT_STAIRS.zTop-(s.z+17)).toBeGreaterThanOrEqual(8)
 expect(hillEdgeSections.filter(e=>Math.abs((e.a[0]!+e.z[0]!)/2-s.x)<27&&(e.a[2]!+e.z[2]!)/2<s.z+28)).not.toHaveLength(0)
 expect(site('mobility-hill').node).toBe('summitRentals')
})
it('전망대 가구의 모서리까지 단단한 상부 데크 위에 있고 바닥 높이를 맞춤',()=>{
 expect(TOWER_TOP.floor).toBeCloseTo(40+.12*40/18,6)
 for(const [x,z]of TOWER_TOP.telescopes)for(let a=0;a<Math.PI*2;a+=.2)expect(onSolidTowerDeck(x+Math.cos(a)*.65,z+Math.sin(a)*.65,.15)).toBe(true)
 for(const [x,z]of TOWER_TOP.benches){const yaw=Math.atan2(-x,-z);for(const dx of[-1.5,1.5])for(const dz of[-.5,.5])expect(onSolidTowerDeck(x+dx*Math.cos(yaw)+dz*Math.sin(yaw),z-dx*Math.sin(yaw)+dz*Math.cos(yaw),.15)).toBe(true)}
})
it('호수 다리와 양쪽 돌길 사이 실제 메시 표면에 빈 틈이 없음',()=>{
 const g=factory('bridge');g.traverse(o=>{if(o instanceof Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.side=2});g.updateMatrixWorld(true)
 for(let x=BRIDGE_LANDINGS[0].x0;x<=BRIDGE_LANDINGS[1].x1;x+=.17)for(const z of[-1.5,0,1.5]){
  const hit=new Raycaster(new Vector3(x,30,BRIDGE.z+z),new Vector3(0,-1,0)).intersectObject(g,true)[0];expect(hit).toBeDefined()
  const y=x<BRIDGE.x0?4.685:x>BRIDGE.x1?4.285:bridgeDeckHeight(x);expect(Math.abs(hit!.point.y-y)).toBeLessThan(.07)
 }
})
