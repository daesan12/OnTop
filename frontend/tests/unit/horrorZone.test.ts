import {it,expect,afterEach} from 'vitest'
import {readFileSync} from 'node:fs'
import {Group,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3,Box3} from 'three'
import {HORROR_PORTALS,HORROR_ESCAPE_ROUTE,HORROR_LOOPS,HORROR_SOLIDS,horrorState,setHorrorOpen,inHorror,horrorGround,horrorMotion,horrorWalkable,updateHorrorPresence,horrorInteriorVisible,safeHorrorCamera} from '../../src/park-renewal/horrorPlan'
import {horrorShell,horrorArt,horrorRamp} from '../../src/park-renewal/horrorGeometry'
import {horrorRenderGate,syncHorrorRenderGate} from '../../src/park-renewal/HorrorZone'
import {parkGround} from '../../src/park-renewal/groundGeometry'
import {canTravel} from '../../src/park-renewal/travelMotion'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
import {SITES,heightAt} from '../../src/park-renewal/plan'
const material=new MeshBasicMaterial({side:DoubleSide})
afterEach(()=>setHorrorOpen(false))
it('두 정원 지하를 넓게 사용하고 천장·외벽·바닥은 지상 정원 아래의 두꺼운 밀폐 볼륨',()=>{
 const shell=new Group();for(const g of Object.values(horrorShell))shell.add(new Mesh(g,material));shell.updateMatrixWorld(true)
 const box=new Box3().setFromObject(shell);expect(box.max.x-box.min.x).toBeGreaterThan(83);expect(box.max.z-box.min.z).toBeGreaterThan(56);expect(box.max.y).toBeLessThan(20)
 for(const p of[[-45,-86],[-42,-55],[0,-99],[20,-55],[-25,-91]]as const){expect(inHorror(p[0],p[1])).toBe(true);expect(heightAt(p[0],p[1])).toBe(22);for(const direction of[[0,1,0],[0,-1,0]]as const)expect(new Raycaster(new Vector3(p[0],14,p[1]),new Vector3(direction[0],direction[1],direction[2])).intersectObject(shell,true).length).toBeGreaterThan(0)}
})
it('입구에서 기둥·순환로·기계실·오르막·꺾인 뒷 출구까지 걸음과 달리기의 작은 프레임이 모두 통과',()=>{
 setHorrorOpen(true)
 for(const route of[HORROR_ESCAPE_ROUTE,...HORROR_LOOPS])for(let i=1;i<route.length;i++){
  const a=route[i-1]!,b=route[i]!,n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.1);let previous=a
  for(let j=1;j<=n;j++){const p=[a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]as const;expect(canTravel(previous,p,parkWalkSurface(...previous),'walk',0),`${previous}→${p}`).toBe(true);expect(Math.abs(parkWalkSurface(...p)-parkWalkSurface(...previous))).toBeLessThan(.12);previous=p}
 }
 expect(HORROR_PORTALS[1].x).toBe(-58);expect(HORROR_PORTALS[1].z).toBe(-88)
})
it('실제 바닥과 출구 오르막 메시가 보행 높이를 지지하고 복도에 공중 발판이 없음',()=>{
 setHorrorOpen(true);const floors=new Group();for(const g of Object.values(horrorShell))floors.add(new Mesh(g,material));floors.add(new Mesh(horrorRamp,material));floors.updateMatrixWorld(true)
 for(const p of HORROR_ESCAPE_ROUTE.filter(p=>inHorror(...p,.2))){const y=horrorGround(...p),hit=new Raycaster(new Vector3(p[0],y+.45,p[1]),new Vector3(0,-1,0),0,.7).intersectObject(floors,true)[0];expect(hit,p.toString()).toBeDefined();expect(hit!.point.y).toBeCloseTo(y,4)}
})
it('벽·기둥·우물 충돌을 관통하거나 큰 이동으로 지하를 가로질러 들어갈 수 없음',()=>{
 expect(horrorMotion([28,-82],[24,-82],6.8)).toBe(false);expect(horrorMotion([35,-82],[-65,-82],6.8)).toBe(false)
 setHorrorOpen(true);expect(horrorMotion([28,-72],[20,-72],6.8)).toBe(false)
 for(const s of HORROR_SOLIDS)expect(horrorWalkable((s.x0+s.x1)/2,(s.z0+s.z1)/2)).toBe(false)
 expect(horrorWalkable(-25,-76)).toBe(false);expect(horrorMotion([0,-45],[0,-55],22)).toBe(true)
})
it('입구·출구의 외부 벽에는 정확한 개구부와 상인방이 있고 내부는 두 번 꺾인 차폐벽으로 가림',()=>{
 const exterior=new Mesh(parkGround.retaining,material),shell=new Group();for(const g of Object.values(horrorShell))shell.add(new Mesh(g,material));exterior.updateMatrixWorld(true);shell.updateMatrixWorld(true)
 for(const p of HORROR_PORTALS){const start=new Vector3(p.x+p.outward*2,p.floor+1.6,p.z),direction=new Vector3(-p.outward,0,0),r=new Raycaster(start,direction,0,1.8);expect(r.intersectObject(exterior)).toHaveLength(0)
  const upper=new Raycaster(new Vector3(start.x,p.floor+p.height+.5,p.z),direction,0,2.1);expect(upper.intersectObject(exterior).length).toBeGreaterThan(0)
  const baffle=new Raycaster(start,direction,0,8).intersectObject(shell,true);expect(baffle.length).toBe(0)
  const art=new Group();for(const g of Object.values(horrorArt))art.add(new Mesh(g,material));art.updateMatrixWorld(true);expect(new Raycaster(start,direction,0,8).intersectObject(art,true).length).toBeGreaterThan(0)
 }
})
it('문이 열려도 외부 플레이어·지상 정원·조감도에서 실내 표시를 절대 허용하지 않음',()=>{
 setHorrorOpen(true)
 for(const x of[-58.1,26.1])for(const y of[6.8,11.856,15,22])expect(horrorInteriorVisible(x,y,-82,true)).toBe(false)
 expect(horrorInteriorVisible(0,22,-80,true)).toBe(false);expect(horrorInteriorVisible(0,6.8,-80,false)).toBe(false)
 expect(horrorInteriorVisible(0,6.8,-80,true)).toBe(true);updateHorrorPresence(0,-80,6.8);expect(horrorState.inside).toBe(true);updateHorrorPresence(26.1,-82,6.8);expect(horrorState.inside).toBe(false)
 for(const [eye,target]of[[[27,8.5,-72],[23,8.5,-72]],[[-59,13.5,-80],[-54,13.5,-80]]]as const){const camera=safeHorrorCamera(eye,target,false);expect(inHorror(camera[0],camera[2])).toBe(false)}
 const camera=safeHorrorCamera([24,8.5,-82],[30,8.5,-82],true);expect(camera[0]).toBeLessThan(26)
 const component=readFileSync('src/park-renewal/HorrorZone.tsx','utf8');expect(component).toContain('visible={inside}');expect(component).toContain('visible={!inside}');expect(component).toContain('transparent={false}')
 const content=new Group(),door=new Mesh();horrorRenderGate.content=content;horrorRenderGate.doors.set('test',door);updateHorrorPresence(0,-80,6.8);expect(syncHorrorRenderGate(0,8.5,-80,true)).toBe(true);expect(content.visible).toBe(true);expect(syncHorrorRenderGate(26.01,8.5,-82,true)).toBe(false);expect(content.visible).toBe(false);expect(door.visible).toBe(true);expect(syncHorrorRenderGate(0,8.5,-80,false)).toBe(false);horrorRenderGate.content=null;horrorRenderGate.doors.clear();expect(SITES.some(s=>/공포|황토방/.test(s.name))).toBe(false)
})
