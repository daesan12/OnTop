import {it,expect} from 'vitest'
import {Box3,Group,Vector3,Mesh,MeshBasicMaterial,DoubleSide,Raycaster} from 'three'
import {factory} from '../../src/park-renewal/assetFactories'
import {groundObject} from '../../src/park-renewal/assetSizing'
import {SITES,site,rentalYaw,NODES,EDGES,facilityGroundY,heightAt,RENTAL_PAIR_SPACING,FISHING_SHOP,FISHING_DECK,FISHING_ACCESS,DOCK_ACCESS,onFishingDeck,deckHeightAt,distanceToSegment,facilityFootprint} from '../../src/park-renewal/plan'
import {onLand,isPlantingGround} from '../../src/park-renewal/groundPlan'
import {parkGround} from '../../src/park-renewal/groundGeometry'
import {horrorMotion,setHorrorOpen,safeHorrorCamera,HORROR_PORTALS} from '../../src/park-renewal/horrorPlan'

it('8쌍 대여소의 출입구·표지판은 길을 향하고 원본 3칸의 전륜·바닥 앵커에 3대씩 접촉',()=>{
 for(const s of SITES.filter(s=>s.asset==='pair')){
  const yaw=rentalYaw(s),p=NODES[s.node]!,dx=p[0]-s.x,dz=p[1]-s.z;expect((-Math.sin(yaw)*dx-Math.cos(yaw)*dz)/Math.hypot(dx,dz)).toBeGreaterThan(.98)
  for(const [i,kind]of['bicycle','scooter'].entries()){
   const bay=factory('rental-bay',{kind}),vehicles=bay.children.filter(o=>o.name.startsWith(kind+'-parked-vehicle-'));expect(vehicles).toHaveLength(3);bay.updateMatrixWorld(true)
   for(const [j,v]of vehicles.entries()){
    const dock=bay.getObjectByName(kind+'-wheel-dock-'+(j+1))!.getWorldPosition(new Vector3()),floor=bay.getObjectByName(kind+'-parking-bay-'+(j+1))!.getWorldPosition(new Vector3()),wheel=v.getObjectByName(kind==='bicycle'?'bicycle-front-wheel':'scooter-front-wheel')!.getWorldPosition(new Vector3()),box=new Box3().setFromObject(v)
    expect(wheel.x).toBeCloseTo(dock.x,6);expect(wheel.z).toBeCloseTo(dock.z,6);expect(box.min.y-floor.y).toBeCloseTo(.006,5)
   }
   const g=new Group();g.position.set(s.x,facilityGroundY(s)+.1,s.z);g.rotation.y=yaw;bay.position.x+=(i?1:-1)*RENTAL_PAIR_SPACING/2;g.add(bay);g.updateMatrixWorld(true)
   const box=new Box3().setFromObject(g);expect(box.min.y).toBeGreaterThan(heightAt(s.x,s.z)+.085)
  }
  const f=facilityFootprint(s);expect(f.yaw).toBe(yaw)
 }
})
it('대각선 낚시점의 실제 지붕·차양이 공용 길을 침범하지 않음',()=>{
 const g=groundObject(factory('fishing-shop'));g.rotation.y=FISHING_SHOP.yaw;g.position.x=FISHING_SHOP.x;g.position.z=FISHING_SHOP.z;g.updateMatrixWorld(true);const v=new Vector3()
 let clearance=Infinity,nearest='';g.traverse(o=>{if(!(o instanceof Mesh))return;const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i+=3){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);for(const[a,b,w]of EDGES){const gap=distanceToSegment(v.x,v.z,NODES[a]!,NODES[b]!)-w/2;if(gap<clearance){clearance=gap;nearest=a+'→'+b+': '+v.x+','+v.z}}}});console.info('fishing roof clearance',clearance,nearest);expect(clearance,nearest).toBeGreaterThan(.1)

 expect(FISHING_SHOP.yaw).toBe(Math.PI/2);expect(FISHING_DECK.yaw).toBeGreaterThan(-Math.PI/2)
})
it('회전한 낚시 데크의 실메시 바닥·단일 진입로와 보행 높이가 이어짐',()=>{
 const deck=factory('fishing-deck');const scene=new Group();scene.add(deck,factory('lake-access'));scene.updateMatrixWorld(true)
 const a=FISHING_ACCESS.points[0]!,b=FISHING_ACCESS.points[1]!
 expect(onFishingDeck(...b)).toBe(true)
 for(let i=0;i<=30;i++){const t=i/30,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,y=deckHeightAt(x,z);expect(y).not.toBeNull();const hits=new Raycaster(new Vector3(x,y!+.1,z),new Vector3(0,-1,0),0,.2).intersectObject(scene,true);expect(hits.length,JSON.stringify({i,x,z,y,near:new Raycaster(new Vector3(x,y!+.1,z),new Vector3(0,-1,0),0,1).intersectObject(scene,true).map(h=>h.distance)})).toBeGreaterThan(0)}
})
it('매점은 수변 데크 위에 지지되고 진입 폭 전체의 목재 바닥에는 돌길·난간이 겹치지 않음',()=>{
 const scene=new Group(),d=FISHING_DECK,deck=factory('fishing-deck');scene.add(deck,factory('lake-access'));scene.updateMatrixWorld(true)
 const down=(x:number,z:number)=>new Raycaster(new Vector3(x,4.4,z),new Vector3(0,-1,0),0,.25).intersectObject(scene,true)
 for(const x of[-1.5,0,1.5])for(const z of[-1.5,0,1.5]){const p=[FISHING_SHOP.x+x,FISHING_SHOP.z+z]as const;expect(onFishingDeck(...p)).toBe(true);expect(down(...p).length).toBeGreaterThan(0);expect(onLand(...p)).toBe(false)}
 const a=FISHING_ACCESS.points[0]!,b=FISHING_ACCESS.points[1]!,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),yaw=d.yaw
 for(const side of[-1.5,0,1.5]){const x=b[0]-dz/length*side,z=b[1]+dx/length*side;expect(down(x,z).length).toBeGreaterThan(0);expect(new Raycaster(new Vector3(x-dx/length*.4,5.1,z-dz/length*.4),new Vector3(dx/length,0,dz/length),0,.9).intersectObject(scene,true),`entry side ${side}, ${x},${z}`).toHaveLength(0)}
 expect(yaw).toBeGreaterThan(-Math.PI/2)
 const stone=new Mesh(parkGround.paving,new MeshBasicMaterial({side:DoubleSide}));stone.updateMatrixWorld(true)
 for(const access of[DOCK_ACCESS,FISHING_ACCESS])for(let i=1;i<access.points.length;i++){const p=access.points[i-1]!,q=access.points[i]!;for(const t of[.25,.5,.75]){const x=p[0]+(q[0]-p[0])*t,z=p[1]+(q[1]-p[1])*t;expect(onLand(x,z)).toBe(false);expect(new Raycaster(new Vector3(x,8,z),new Vector3(0,-1,0)).intersectObject(stone)).toHaveLength(0)}}
 expect(isPlantingGround(49.5,23)).toBe(true);expect(isPlantingGround(52.5,23)).toBe(true)
})
it('팔각정 앞쪽의 추가 분수 입구가 화단 사이로 실제 원형 바닥까지 연결',()=>{
 const mesh=new Mesh(parkGround.paving,new MeshBasicMaterial({side:DoubleSide}));mesh.updateMatrixWorld(true);expect(NODES.fountainEastGate![1]).toBeGreaterThan(site('rest-4').z)
 for(const [a,b]of[['entranceEast','fountainEastGate'],['fountainEastGate','fountainEastCourt']]){const p=NODES[a]!,q=NODES[b]!;for(let i=0;i<=30;i++){const t=i/30,x=p[0]+(q[0]-p[0])*t,z=p[1]+(q[1]-p[1])*t;if(Math.hypot(x-site('fountain').x,z-site('fountain').z)<17.61)continue;expect(new Raycaster(new Vector3(x,50,z),new Vector3(0,-1,0)).intersectObject(mesh).length).toBeGreaterThan(0)}}
 expect(site('ranking').x).toBe(-24);expect(site('mailbox').z).toBeLessThan(site('ranking').z)
})
it('닫힌 돌문 앞에서는 차체가 문 두께 안에 들어가지 않고 카메라 근평면 여유를 확보',()=>{
 setHorrorOpen(false)
 for(const p of HORROR_PORTALS){const outside=[p.x+p.outward*1.5,p.z]as const,near=[p.x+p.outward*.2,p.z]as const;expect(horrorMotion(outside,near,p.floor)).toBe(false);const eye=[p.x+p.outward*.4,p.floor+1.7,p.z]as const,camera=safeHorrorCamera(eye,[p.x-p.outward,p.floor+1.7,p.z],false);expect((camera[0]-p.x)*p.outward-.225).toBeGreaterThan(.08)}
})
