import {FACILITY_TARGETS,PAVILION_TARGETS,STONE_TABLE_TARGETS} from './identities'
import {rpsCabinetPlacement} from '../../features/rpsRoulette/placement'
import {PARK_DATA as DEV,PARK_LAYOUT as DEV_LAYOUT,PARK_DEFINITION} from '../../map/park'
import {PARK_MAP_VERSION} from '../../map/park/generated/mapVersion'
import {SITES,site,NODES,SUB_PAVILION_SCALE,LAKE,FISHING_BENCHES,FISHING_DECK,facilityGroundY,heightAt,EDGES,ENTRANCE_PATHS,MONUMENT_STAIRS} from '../plan'
import {TOWER_TOP,telescopeYaw} from '../towerFurniturePlan'
import {benches,lamps,treePositions,willowPositions} from '../landscape'
import {underConstruction} from '../constructionStatus'
import {constructionEntries} from '../constructionPlan'
import {facilityYaw,facilityBase} from '../facilityPlacement'
import {ARCADE_SCALE} from '../assetSizing'
import {JUMP_PADS,JUMP_GATES,JUMP_START,JUMP_FINISH,JUMP_REWARDS} from '../jump10Plan'
import {pose,transform,transformPose,type V3,type MappedAnchor,type MappedSeat} from './types'
const records:MappedAnchor[]=[]
const v3=(p:readonly number[]):V3=>[p[0]!,p[1]!,p[2]!]
const put=(kind:string,id:string,label:string,source:V3,siteId:string|null,position:V3|null,yaw=0,extra:Partial<MappedAnchor>={})=>{
 const r:MappedAnchor={key:kind+':'+id,id,kind,label,source,siteId,position,yaw,scale:[1,1,1],status:position?(siteId&&underConstruction(siteId)?'construction':'mapped'):'unplaced',...extra};records.push(r);return r
}
const origin=(id:string,offset=0):V3=>{const s=site(id);return[s.x,facilityBase(id)+offset,s.z]}
const near=(id:string):V3=>{const s=site(id),p=ENTRANCE_PATHS.find(p=>p.id===id)?.b??NODES[s.node]!;return[p[0],heightAt(...p)+.8,p[1]]}
for(const f of DEV.facilities){const id=FACILITY_TARGETS[f.id]!,s=site(id),y=['pagoda','fountain','fitness','tower','jump'].includes(id)?heightAt(s.x,s.z):facilityBase(id)
 put('facility',f.id,s.name,f.position,id,[s.x,y+(id==='pagoda'?1.8:0),s.z],id==='tower'?Math.PI:['pagoda','fountain','fitness','jump'].includes(id)?0:facilityYaw(s),{reach:pose(near(id)),radius:3,heightTolerance:.7})}
/** Explicit persistent identities; removed pavilions are reserved, never silently reused. */
function pavilionPlacement(id:string){const target=PAVILION_TARGETS[id];if(!target)return null;const s=site(target),main=id==='P0',yaw=main?Math.PI:target==='island-pavilion'?-Math.PI/2:s.yaw!,scale=main?1:1.1*SUB_PAVILION_SCALE,ground=main?facilityBase(target):heightAt(s.x,s.z),floor=ground+(main?2.6:.57*scale);return{target,s,main,yaw,scale,ground,floor}}
for(const p of DEV.pavilions){const q=pavilionPlacement(p.id);put('pavilion',p.id,q?.s.name??p.id,[p.x,p.floor,p.z],q?.target??null,q?[q.s.x,q.ground,q.s.z]:null,q?.yaw??0,{floorY:q?.floor,reason:q?undefined:'현재 공원에 대응 팔각정 없음 · ID 보존',scale:q?[q.scale,q.scale,q.scale]:[1,1,1]})}
for(const t of DEV.tables){
 const pav=t.pavilionId?pavilionPlacement(t.pavilionId):null,stone=STONE_TABLE_TARGETS[t.id]
 if(!pav&&!stone){put('table',t.id,t.id,t.position,null,null,0,{assetId:t.assetId,pavilionId:t.pavilionId,reason:'현재 배치에 대응 테이블 없음 · 기존 ID와 채널 binding 보존'});continue}
 const target=pav?.target??(t.id==='table-16'?'jump':'plaza'),yaw=pav?.yaw??0,point=stone??[pav!.s.x,pav!.s.z],floor=pav?.floor??heightAt(...point)+.12
 const surface=floor+(pav?pav.main?1.15:.795*pav.scale:1.06),base=surface-1.06,center:V3=[point[0],base,point[1]],r=pav?pav.main?2.95:1.05*pav.scale:1.25,side=pav?r:1.45,seatContact=floor+(pav?pav.main?.66:.51*pav.scale:.56)
 const local:V3[]=[[0,0,r],[0,0,-r],[-side,0,0],[side,0,0]],seatYaw=[Math.PI,0,Math.PI/2,-Math.PI/2]
 const seats=local.map((p,i):MappedSeat=>{const w=transform(p,[point[0],seatContact+.24,point[1]],yaw),exit=transform([p[0]*1.45,0,p[2]*1.45],[point[0],floor+.8,point[1]],yaw);return{seatIndex:i,use:pose(w,seatYaw[i]!+yaw),exit:pose(exit,seatYaw[i]!+yaw),contactY:seatContact,presented:i<2}})
 put('table',t.id,t.id,t.position,target,center,yaw,{assetId:pav?t.assetId:'procedural/stone-game-table',pavilionId:t.pavilionId,floorY:floor,surfaceY:surface,seats,reach:pose([point[0],floor+.8,point[1]],yaw),radius:pav?.main?7.2:4,heightTolerance:.7,camera:{look:[point[0],surface+.02,point[1]],position:transform([0,3.2,pav?.main?7:5.5],[point[0],surface,point[1]],yaw)}})
}
function benchRecord(old:typeof DEV.interactions.benches[number],target:string|null,p:V3|null,yaw:number,width=1.4,contact?:number){
 const floor=p?.[1]??0,contactY=contact??floor+.56,seats:MappedSeat[]=p?[0,1].map(i=>{const offset=(i?1:-1)*Math.min(.65,width*.55),use=pose(transform([offset,contactY+.24-floor,.07],p,yaw),yaw),exit=pose(transform([0,.8,1.5],p,yaw),yaw);return{seatIndex:i,use,exit,contactY,presented:true}}):[]
 return put('bench',old.id,old.siteId,old.position,target,p,yaw,{seats,radius:old.radius,heightTolerance:old.heightTolerance,reason:p?undefined:'대응 실물 벤치 없음 · 이전 ID 예약 보존'})
}
const gym=site('fitness'),oldGym=PARK_DEFINITION.sites.fitness,gymOffset:V3=[gym.x-oldGym.x,heightAt(gym.x,gym.z),gym.z-oldGym.z]
for(const b of DEV.interactions.benches){
 const match=b.siteId.match(/^bench-(P\d)-bay-(\d)$/)
 if(match){const q=pavilionPlacement(match[1]!);if(!q){benchRecord(b,null,null,0);continue}const side=Number(match[2]),index=[0,2,3,4,6,7].indexOf(side),a=(index+1)*Math.PI/4,r=q.main?5.38*Math.cos(Math.PI/8):2.12*Math.cos(Math.PI/8)*q.scale,local:V3=q.main?[Math.sin(a)*r,0,-Math.cos(a)*r]:[Math.sin(a)*r,0,Math.cos(a)*r],yaw=q.main?q.yaw-a:q.yaw+a+Math.PI,world=transform(local,[q.s.x,q.floor,q.s.z],q.yaw);benchRecord(b,q.target,world,yaw,q.main?2.05:.85*q.scale,q.floor+(q.main?.7:.585*q.scale));continue}
 if(b.siteId.startsWith('bench-fitness-ring-')){put('bench',b.id,b.siteId,b.position,'fitness',transform(b.position,gymOffset),b.yaw,{radius:b.radius,heightTolerance:b.heightTolerance,seats:b.seats.map((s,i)=>({seatIndex:i,use:transformPose(s.use,gymOffset),exit:transformPose(s.exit,gymOffset),contactY:heightAt(gym.x,gym.z)+.62,presented:true}))});continue}
 if(b.siteId.startsWith('bench-fountain-')){const f=site('fountain'),o=PARK_DEFINITION.sites.fountain,d:V3=[f.x-o.x,heightAt(f.x,f.z),f.z-o.z];put('bench',b.id,b.siteId,b.position,'fountain',transform(b.position,d),b.yaw,{radius:b.radius,heightTolerance:b.heightTolerance,seats:b.seats.map((s,i)=>({seatIndex:i,use:transformPose(s.use,d),exit:transformPose(s.exit,d),contactY:transform(b.position,d)[1]+.56,presented:true}))});continue}
 if(b.siteId.startsWith('layout-tower-bench-')){const i=Number(b.siteId.at(-1))-1,[x,z]=TOWER_TOP.benches[i]!,t=site('tower');benchRecord(b,'tower',[t.x+x,facilityGroundY(t)+TOWER_TOP.floor+.015,t.z+z],Math.atan2(-x,-z));continue}
 const forests=['bench-forest-southwest','bench-forest-northeast','bench-forest-southeast'];const i=forests.indexOf(b.siteId)
 if(i>=0){const v=benches[i];benchRecord(b,v?'plaza':null,v?[v.point[0],heightAt(...v.point)+.12,v.point[1]]:null,v?.yaw??0);continue}
 if(b.siteId==='layout-fishing-deck-bench'||b.siteId==='layout-fishing-east-bench'){const [x,z,yaw]=FISHING_BENCHES[b.siteId==='layout-fishing-deck-bench'?0:1]!;benchRecord(b,'fishing',[x,FISHING_DECK.top,z],yaw,1.15,FISHING_DECK.top+.46);continue}
 benchRecord(b,null,null,0)
}
for(const f of DEV.interactions.fitness)put('fitness',f.id,f.id,f.position,'fitness',transform(f.position,gymOffset),f.yaw,{use:transformPose(f.use,gymOffset),exit:transformPose(f.exit,gymOffset),radius:f.radius,heightTolerance:f.heightTolerance})
const tower=site('tower'),deckY=facilityGroundY(tower)+TOWER_TOP.floor
for(const [i,t]of DEV.interactions.telescopes.entries()){const [x,z]=TOWER_TOP.telescopes[i]!,p:V3=[tower.x+x,deckY+.015,tower.z+z],yaw=telescopeYaw(p[0],p[2]),landing=(d:number)=>pose([p[0]-Math.sin(yaw)*d,p[1]+.8,p[2]-Math.cos(yaw)*d],yaw);put('telescope',t.id,t.id,t.position,'tower',p,yaw,{radius:t.radius,heightTolerance:t.heightTolerance,use:landing(.85),exit:landing(2.5)})}
const notes:V3=[tower.x+TOWER_TOP.notes[0],deckY+.015,tower.z+TOWER_TOP.notes[1]],noteYaw=Math.atan2(-TOWER_TOP.notes[0],-TOWER_TOP.notes[1])
put('notes',DEV.interactions.notes.id,'익명 메모함',DEV.interactions.notes.position,'tower',notes,noteYaw,{reach:pose([notes[0],notes[1]+.8,notes[2]],noteYaw),radius:DEV.interactions.notes.radius,heightTolerance:.7})
for(const [id,key,label]of[['feedback-mailbox','mailbox','소리함'],['layout-photo','ranking','랭킹 보드'],['layout-drink','lottery','복권방'],['layout-shop','gacha','뽑기기계']]as const){const s=site(key),yaw=facilityYaw(s),base=facilityBase(key),front=key==='lottery'?yaw+Math.PI:yaw,d=key==='mailbox'?2.8:key==='ranking'?2.8:3.2,entry:V3=[s.x+Math.sin(front)*d,heightAt(s.x,s.z)+.8,s.z+Math.cos(front)*d],from=id==='feedback-mailbox'?v3(DEV.interactions.mailbox.position):id==='layout-photo'?DEV.interactions.rankingBoard.position:id==='layout-drink'?[PARK_DEFINITION.sites.drink.x,0,PARK_DEFINITION.sites.drink.z]as V3:[PARK_DEFINITION.sites.shop.x,0,PARK_DEFINITION.sites.shop.z]as V3;put('interaction',id,label,from,key,[s.x,base,s.z],yaw,{reach:pose(entry,front+Math.PI),radius:id==='feedback-mailbox'?2.6:3,heightTolerance:.7})}
const oldCabinet=rpsCabinetPlacement({...PARK_DEFINITION.sites.cart,...PARK_DEFINITION.fishBreadShop}).cabinet
for(const [id,target,label]of[['fish-bread','bread','붕어빵 게임'],['vr-experience-hall','vr','VR 꼬치왕'],['whack-a-mole','mole','두더지 잡기'],['speed-mole','mole','스피드 두더지']]as const)put('game-entry',id,label,target==='bread'?[PARK_DEFINITION.sites.cart.x,0,PARK_DEFINITION.sites.cart.z]:target==='vr'?[PARK_DEFINITION.sites.vr.x,0,PARK_DEFINITION.sites.vr.z]:[oldCabinet.x,0,oldCabinet.z],target,origin(target),facilityYaw(site(target)),{reach:pose(near(target)),radius:2.8,heightTolerance:.9,reason:id==='fish-bread'||id==='vr-experience-hall'?undefined:'기존 오락기 메뉴의 게임을 새 두더지 건물에 연결'})
const arcade=site('arcade'),arcadeYaw=facilityYaw(arcade),arcadeOrigin=origin('arcade')
for(const [i,id]of ['rps-roulette-cabinet','plus-minus-cabinet'].entries()){const p=transform([i===0?-6:-2,.14,-3.6],arcadeOrigin,arcadeYaw,ARCADE_SCALE),r=transform([0,.8,1.3*ARCADE_SCALE[2]],p,arcadeYaw);put('game-entry',id,i===0?'가위바위보 룰렛':'더하기 빼기',[oldCabinet.x,0,oldCabinet.z],'arcade',p,arcadeYaw,{scale:ARCADE_SCALE,reach:pose(r,arcadeYaw),radius:1.7,heightTolerance:.9})}
for(const p of DEV.paths)put('route',p.id,p.id,[p.points[0]![0],0,p.points[0]![1]],null,null,0,{reason:'기존 길 제어점은 재사용하지 않음 · 새 공원 EDGES와 출입구 경로로 대체'})
for(const [i,l]of DEV_LAYOUT.DRAFT_LAMPS.entries()){const p=lamps[i];put('lamp','lamp-'+i,'가로등 '+(i+1),l,null,p?[p[0],heightAt(...p),p[1]]:null)}
export const DEV_ASSET_MAPPING=records
export const MAPPING_SOURCE={mapVersion:PARK_MAP_VERSION,unit:'metre',up:'Y',north:'-Z',yawUnit:'radian',avatarOrigin:'legacy-ground-plus-0.8',tableFrame:'game origin = tabletopY - 1.06; explicit seat/use poses override legacy flat assumptions'} as const
export const MAPPING_WORLD={constructionSites:constructionEntries,size:[220,220],capacity:40,facilities:SITES.filter(s=>!s.kind).map(s=>({id:s.id,name:s.name,status:underConstruction(s.id)?'construction':'mapped',position:[s.x,facilityBase(s.id),s.z],yaw:facilityYaw(s)})),spawn:[NODES.entry![0],heightAt(...NODES.entry!)+.8,NODES.entry![1]],entry:NODES.entry,paths:EDGES.map(([a,b,width])=>({id:a+'--'+b,points:[NODES[a]!,NODES[b]!],width})),entrances:ENTRANCE_PATHS,monumentStairs:MONUMENT_STAIRS,lake:LAKE,trees:treePositions,willows:willowPositions}
export const MAPPING_JUMP={start:JUMP_START,finish:JUMP_FINISH,pads:JUMP_PADS,gates:JUMP_GATES,rewards:JUMP_REWARDS,lapReward:250,requiresFirstPad:true,finalTheme:'duck',gimmicks:{lily:{standSeconds:3},mole:{dip:.48,duration:.95},pigeon:{amplitude:.42,period:3.8},duck:null}}
