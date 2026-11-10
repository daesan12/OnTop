import {it,expect} from 'vitest'
import {Mesh,MeshBasicMaterial,Raycaster,Vector3,DoubleSide} from 'three'
import {parkGround} from '../../src/park-renewal/groundGeometry'
import {curbGeometry,curbPaths,createCurbGeometry} from '../../src/park-renewal/curbGeometry'
import {stairCheeks,stairRailAnchors} from '../../src/park-renewal/stairFinishGeometry'
import {MONUMENT_STAIRS,forestHeightAt,NODES,EDGES,site,footprintDistance} from '../../src/park-renewal/plan'
import {hillEdgeSections} from '../../src/park-renewal/hillEdgesPlan'
import {summitFenceSections} from '../../src/park-renewal/summitWalls'
import {onSummitEdge} from '../../src/park-renewal/hybridTerrainPlan'
import {isPlantingGround} from '../../src/park-renewal/groundPlan'
import {JUMP_PADS,JUMP_STAGES} from '../../src/park-renewal/jump10Plan'
it('연속 경계석은 경사·모서리에도 틈 없는 닫힌 단면이며 얇은 회전 상자를 사용하지 않음',()=>{
 const geometry=createCurbGeometry([[[0,0,0],[0,.6,2],[2,.6,2]]]),index=geometry.getIndex()!,counts=new Map<string,number>()
 for(let i=0;i<index.count;i+=3)for(let j=0;j<3;j++){const a=index.getX(i+j),b=index.getX(i+(j+1)%3),key=Math.min(a,b)+':'+Math.max(a,b);counts.set(key,(counts.get(key)??0)+1)}
 expect([...counts.values()].every(n=>n===2)).toBe(true);expect(curbPaths.length).toBeGreaterThan(5);expect(curbGeometry.getAttribute('position').array.every(Number.isFinite)).toBe(true)
})
it('중앙광장 동쪽과 카페–호수 길의 중심·양옆이 잔디로 끊기지 않음',()=>{
 const mesh=new Mesh(parkGround.paving,new MeshBasicMaterial({side:DoubleSide}));mesh.updateMatrixWorld(true)
 for(const [a,b]of[['square','plazaLakeLink'],['plazaLakeLink','lake-south'],['cafe','lakeSW'],['lakeSW','lake-south']]){const p=NODES[a]!,q=NODES[b]!,length=Math.hypot(q[0]-p[0],q[1]-p[1]),nx=-(q[1]-p[1])/length,nz=(q[0]-p[0])/length;expect(EDGES.find(e=>e[0]===a&&e[1]===b)![2]).toBe(6);for(let t=0;t<=1;t+=.02)for(const side of[-1.2,0,1.2]){const x=p[0]+(q[0]-p[0])*t+nx*side,z=p[1]+(q[1]-p[1])*t+nz*side;if(footprintDistance(site('cafe'),x,z)<.1)continue;expect(isPlantingGround(x,z),`${a} -> ${b}: ${x},${z}`).toBe(false);expect(new Raycaster(new Vector3(x,50,z),new Vector3(0,-1,0)).intersectObject(mesh).length,`actual paving ${x},${z}`).toBeGreaterThan(0)}}
})
it('계단 난간 받침 전체에 실제 벽돌 옹벽 지지가 있고 끝 기둥도 발판에 닿음',()=>{
 const mesh=new Mesh(stairCheeks,new MeshBasicMaterial()),p=MONUMENT_STAIRS,length=p.zBottom-p.zTop;mesh.updateMatrixWorld(true)
 for(const side of[-1,1])for(let i=0;i<=20;i++){const {z,y}=stairRailAnchors[i]!,hit=new Raycaster(new Vector3(side*(p.width/2+.2),y+.01,Math.min(z,length-.001)),new Vector3(0,-1,0),0,.04).intersectObject(mesh)[0];expect(hit,`rail foot ${side},${i}`).toBeDefined();expect(Math.abs(hit!.point.y-y)).toBeLessThan(.01)}
 const pos=stairCheeks.getAttribute('position');for(let i=0;i<pos.count;i++)if(pos.getY(i)<0)expect(pos.getY(i)+p.bottom).toBeLessThanOrEqual(forestHeightAt(pos.getX(i),p.zTop+pos.getZ(i))+.001)
})
it('옹벽 아래쪽 난간을 제거하고 정상·실제 오름길 난간은 유지',()=>{
 expect(summitFenceSections.length).toBeGreaterThan(40);for(const g of hillEdgeSections.filter(g=>!summitFenceSections.includes(g))){const x=(g.a[0]!+g.z[0]!)/2,z=(g.a[2]!+g.z[2]!)/2;if(onSummitEdge(x,z,3.5))expect((g.a[1]!+g.z[1]!)/2).toBeGreaterThanOrEqual(18.8)}
})
it('기믹 코스와 하강 코스는 확정된 발판 수와 착지 폭을 유지',()=>{
 expect(JUMP_STAGES.slice(6).map(s=>s.count)).toEqual([14,16,18,28]);expect(JUMP_PADS.filter(p=>p.stage===6).every(p=>p.radius===1.15)).toBe(true);expect(JUMP_PADS.filter(p=>p.stage===7).every(p=>p.radius===.78)).toBe(true);expect(JUMP_PADS.filter(p=>p.stage===8).every(p=>p.radius===.8)).toBe(true);expect(JUMP_PADS.filter(p=>p.stage===9).every(p=>p.halfX===.85&&p.halfZ===1.02)).toBe(true)
})
