import {WEST_MEADOW_ISLAND as FOLK_FRONT_GROVE} from '../../src/park-renewal/siteFinishingPlan'
import {guardFloorY} from '../../src/park-renewal/groundSurface'
import {it,expect} from 'vitest'
import {Mesh,MeshBasicMaterial,Raycaster,Vector3,Group,DoubleSide} from 'three'
import {readFileSync} from 'node:fs'
import {outdoorStoneTableParts} from '../../src/features/tables/outdoorStoneTableParts'
import {site,heightAt,NODES,EDGES,STATION_STEPS,STATION_STAIRS,STATION_SCALE,STATION_APPROACH,underStation,FISHING_SUPPORTS,FISHING_BENCHES,FISHING_UPPER,FISHING_DECK,FISHING_STAIRS,onFishingDeck,footprintDistance} from '../../src/park-renewal/plan'
import {onLand,isPlantingGround} from '../../src/park-renewal/groundPlan'
import {parkGround} from '../../src/park-renewal/groundGeometry'
import {curbGeometry} from '../../src/park-renewal/curbGeometry'
import {factory} from '../../src/park-renewal/assetFactories'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
import {guardRuns,guardPosts,guardRailGeometry} from '../../src/park-renewal/guardLayout'
import {lamps,treePositions} from '../../src/park-renewal/landscape'
import {SUMMIT_LAMP_ANCHORS} from '../../src/park-renewal/landscapeRefinementPlan'
import {onSummitEdge,inSummit} from '../../src/park-renewal/hybridTerrainPlan'
import {canTravel} from '../../src/park-renewal/travelMotion'
const material=new MeshBasicMaterial({side:DoubleSide}),paved=new Mesh(parkGround.paving,material);paved.updateMatrixWorld(true)
const hit=(obj:Mesh|Group,x:number,z:number,y:number,max=.25)=>new Raycaster(new Vector3(x,y+.12,z),new Vector3(0,-1,0),0,max).intersectObject(obj,true)
it('dev 광장과 로컬 미리보기가 같은 상판·금속 받침·두 벤치 좌석 형상을 공유',()=>{
 const p=outdoorStoneTableParts(2);expect(p.stone).toEqual([{p:[0,.99,0],s:[2.1,.14,1.6],c:'#c7c6b9'},{p:[0,.48,1.25],s:[2.1,.16,.52],c:'#c3c3b7'},{p:[0,.48,-1.25],s:[2.1,.16,.52],c:'#c3c3b7'}]);expect(p.supports).toHaveLength(6)
 expect(readFileSync('src/features/tables/TableShell.tsx','utf8')).toContain('return outdoorStoneTableParts(seatCount)');expect(readFileSync('src/park-renewal/DevPlazaTable.tsx','utf8')).toContain('outdoorStoneTableParts(2)')
})
it('승강장 계단 아래 포장·경계석은 제거되고 실제 6개 발판과 보행 높이가 맞음',()=>{
 const s=site('balloon'),station=new Group();station.position.set(s.x,heightAt(s.x,s.z),s.z);station.add(factory('station',{scale:STATION_SCALE}));station.updateMatrixWorld(true)
 for(const dx of[-3,0,3])for(let i=0;i<6;i++){const z=s.z+STATION_STAIRS.zBottom-(i+.5)*(STATION_STAIRS.zBottom-STATION_STAIRS.zTop)/6,x=s.x+dx,y=parkWalkSurface(x,z);expect(underStation(x,z)).toBe(true);expect(onLand(x,z)).toBe(false);expect(hit(station,x,z,y)[0]?.point.y).toBeCloseTo(y,3);expect(hit(paved,x,z,30,40)).toHaveLength(0)}
 const a=curbGeometry.getAttribute('position');for(let i=0;i<a.count;i++)expect(Math.abs(a.getX(i)-s.x)<3.8&&a.getZ(i)>s.z+16.3&&a.getZ(i)<s.z+STATION_STEPS.z1-.1).toBe(false)
 for(let t=0;t<=1;t+=.1){const x=STATION_APPROACH.a[0]+(STATION_APPROACH.b[0]-STATION_APPROACH.a[0])*t,z=STATION_APPROACH.a[1]+(STATION_APPROACH.b[1]-STATION_APPROACH.a[1])*t;if(t<.98)expect(hit(paved,x,z,22.085).length).toBeGreaterThan(0)}
})
it('난간 봉은 꺾임마다 끊긴 상자 대신 닫힌 연속 단면을 사용하고 기둥은 2m 이내 간격',()=>{
 const g=guardRailGeometry([[[0,0,0],[0,.5,2],[2,.5,3]]],1.25),index=g.getIndex()!,counts=new Map<string,number>();for(let i=0;i<index.count;i+=3)for(let j=0;j<3;j++){const a=index.getX(i+j),b=index.getX(i+(j+1)%3),k=Math.min(a,b)+':'+Math.max(a,b);counts.set(k,(counts.get(k)??0)+1)}expect([...counts.values()].every(n=>n===2)).toBe(true)
 for(const run of guardRuns)for(const p of run)expect(guardPosts.some(q=>Math.hypot(p[0]-q[0]!,p[2]-q[2]!)<1.05)).toBe(true)
 for(const p of guardPosts)expect(p[1]).toBeCloseTo(guardFloorY(p[0]!,p[2]!),5)
})
it('정상 가로등은 울타리 안쪽이고 오르막 끝 여유 공간에도 한 개 있음',()=>{
 for(const p of lamps)if(inSummit(...p))expect(onSummitEdge(...p,1.55)).toBe(false)
 const end=SUMMIT_LAMP_ANCHORS[2];expect(lamps.some(p=>Math.hypot(p[0]-end[0],p[1]-end[1])<3)).toBe(true)
 for(const p of lamps)expect(isPlantingGround(...p)).toBe(true)
})
it('호수 옹벽 옆 길은 6m 직선 폭을 유지하고 끝은 순차 곡선으로 다리에 이어짐',()=>{
 expect(NODES['lake-nw']![0]).toBe(NODES.lakeWestBend![0]);expect(NODES.lakeWestBend![0]).toBe(NODES['lake-west-north']![0]);for(let z=-59;z<=-35;z+=.75)for(const x of[27.9,30.6,33.3]){expect(onLand(x,z)).toBe(true);expect(isPlantingGround(x,z)).toBe(false);expect(hit(paved,x,z,heightAt(x,z)+.085).length).toBeGreaterThan(0)}
 for(const n of['lakeCurve0','lakeCurve1','lakeCurve2','lakeCurve3'])expect(NODES[n]).toBeDefined()
})
it('광장–분수 6m 진입로 전체에 포장이 있고 자전거·킥보드가 양방향으로 통과',()=>{
 for(const [a,b]of[['southEastPlaza','fountainGate'],['fountainGate','fountainCourt']]){const p=NODES[a]!,q=NODES[b]!,w=EDGES.find(e=>e[0]===a&&e[1]===b)![2],d=Math.hypot(q[0]-p[0],q[1]-p[1]);expect(w).toBeGreaterThanOrEqual(6);for(let t=.02;t<1;t+=.04){const x=p[0]+(q[0]-p[0])*t,z=p[1]+(q[1]-p[1])*t;if(Math.hypot(x-47,z-58)<17.61)continue;for(const lane of[-1.5,0,1.5]){const xx=x-(q[1]-p[1])/d*lane,zz=z+(q[0]-p[0])/d*lane;expect(hit(paved,xx,zz,heightAt(xx,zz)+.085).length).toBeGreaterThan(0);for(const travel of['bicycle','scooter']as const)for(const sign of[-1,1]){const next=[xx+(q[0]-p[0])/d*.1*sign,zz+(q[1]-p[1])/d*.1*sign]as const;expect(canTravel([xx,zz],next,parkWalkSurface(xx,zz),travel,Math.atan2((q[0]-p[0])*sign,(q[1]-p[1])*sign))).toBe(true)}}}}
})
it('낚시 지지대의 전체 단면이 데크 안에 있고 추가 벤치 두 개가 계단을 비움',()=>{
 const deck=factory('fishing-deck');deck.updateMatrixWorld(true);for(const [level,points]of Object.entries(FISHING_SUPPORTS))for(const [x,z]of points){for(const dx of[-.18,.18])for(const dz of[-.18,.18])expect(onFishingDeck(x+dx,z+dz)).toBe(true);expect(hit(deck,x,z,level==='upper'?FISHING_UPPER.top:FISHING_DECK.top).length).toBeGreaterThan(0)}
 expect(FISHING_BENCHES).toHaveLength(3);for(const [x,z,yaw]of FISHING_BENCHES)for(const dx of[-.79,.79])for(const dz of[-.33,.33]){const xx=x+Math.cos(yaw)*dx+Math.sin(yaw)*dz,zz=z-Math.sin(yaw)*dx+Math.cos(yaw)*dz;expect(onFishingDeck(xx,zz)).toBe(true);expect(Math.abs(xx-FISHING_STAIRS.x)<FISHING_STAIRS.width/2&&zz>FISHING_STAIRS.zTop&&zz<FISHING_STAIRS.zBottom).toBe(false)}
})
it('민속놀이 앞 잔디를 넓히고 이동한 두 보드 뒤에 나무를 두되 앞은 비움',()=>{
 expect(isPlantingGround(FOLK_FRONT_GROVE.x,FOLK_FRONT_GROVE.z)).toBe(true);expect(treePositions.filter(p=>Math.hypot(p[0]-FOLK_FRONT_GROVE.x,p[1]-FOLK_FRONT_GROVE.z)<5).length).toBeGreaterThanOrEqual(2)
 const a=site('ranking'),b=site('mailbox');expect(a.x).toBe(-24);expect(a.z).toBe(26);expect(b.x).toBeGreaterThan(a.x);for(const s of[a,b])expect(isPlantingGround(s.x,s.z)).toBe(true)
 expect(treePositions.filter(p=>p[0]>-26&&p[0]<-16&&p[1]>13&&p[1]<21).length).toBeGreaterThanOrEqual(3)
 for(const s of[a,b])expect(footprintDistance(site('mole'),s.x,s.z)).toBeGreaterThan(0)
})
