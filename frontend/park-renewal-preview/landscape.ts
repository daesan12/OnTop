import {RENEWAL_PARK_ENABLED} from '../src/park/mapSelection'
import bakedTrees from './static/trees.json'
import {treeEnvelope,treesOverlap,type TreeEnvelope} from './treeSpacing'
import {fitnessWorldTrees} from './fitnessTreesPlan'
import {lakeBank} from './shoreGeometry'
import {MAPPED_GROUND_SUPPORTS} from './mappedGroundSupports'
import {BufferGeometry,Float32BufferAttribute,Vector3,Shape,ShapeGeometry,CylinderGeometry} from 'three'
import {site,JUMP_TABLES,TABLES,PARK,walkHeightAt,heightAt,insidePark,inLake,LAKE,SITES,FISHING_SHOP,FISHING_NOTICE,footprintDistance,onRoad,MONUMENT_STAIRS,parkRadius,FACILITY_APPROACHES,type Point} from './plan'
import {buildParkTreeParts,type TreePlanting} from '../src/world/art/parkTreeParts'

import {onSummitEdge} from './hybridTerrainPlan'
import {FOREST_TRAILS,SIGNPOSTS} from './landscapePlan'
import {distanceToSegment} from './plan'
import {parkGround} from './groundGeometry'
export {plantedBeds,inBed} from './groundPlan'
import {isPlantingGround} from './groundPlan'
import {HORROR_PORTALS,hiddenExitGrade} from './horrorPlan'
import {WEST_REST_ROW,SUMMIT_LAMP_ANCHORS} from './landscapeRefinementPlan'
const ground=parkGround
export const terrain=ground.grass,paving=ground.paving,retaining=ground.retaining
export function ribbon(points:readonly Point[],width:number,lift=.1){
 const p:number[]=[],indices:number[]=[]
 let row=0
 for(let s=0;s<points.length-1;s++){
  const a=points[s]!,b=points[s+1]!,length=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.max(1,Math.ceil(length/1.3)),nx=-(b[1]-a[1])/length,nz=(b[0]-a[0])/length
  for(let i=0;i<=count;i++){const t=i/count,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t
   for(const side of [-1,1]){const xx=x+nx*width/2*side,zz=z+nz*width/2*side;p.push(xx,walkHeightAt(xx,zz)+lift,zz)}
   if(i<count){const k=row*2;indices.push(k,k+2,k+1,k+1,k+2,k+3)}row++
  }
 }
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();return g
}
export function oval(x:number,z:number,rx:number,rz:number,y:number){const s=new Shape();s.absellipse(x,-z,rx,rz,0,Math.PI*2,false,0);const g=new ShapeGeometry(s,96);g.rotateX(-Math.PI/2);g.translate(0,y,0);return g}
export const lakeWater=oval(LAKE.x,LAKE.z,LAKE.rx,LAKE.rz,LAKE.y)
export const lakeShore=lakeBank
export const lakeBed=oval(LAKE.x,LAKE.z,LAKE.rx,LAKE.rz,LAKE.y-2.6)
export const island=oval(LAKE.island.x,LAKE.island.z,LAKE.island.rx,LAKE.island.rz,4.285)
export const islandShore=(()=>{const g=new CylinderGeometry(1,1.035,.84,192,1,true);g.scale(LAKE.island.rx,1,LAKE.island.rz);g.translate(LAKE.island.x,3.865,LAKE.island.z);return g})()

export const forestTrailMeshes=FOREST_TRAILS.map(t=>({id:t.id,geometry:ribbon(t.points,t.width,.095)}))
export const benches:{point:Point;yaw:number}[]=[],forestLamps:Point[]=[]
for (const trail of FOREST_TRAILS.filter(t => t.id !== 'northeast-woodland')) {
 const a = trail.points[0]!, b = trail.points[1]!
 const dx = b[0]-a[0], dz = b[1]-a[1], length = Math.hypot(dx,dz)
 const nx = -dz/length, nz = dx/length
 for (const t of [.25,.75]) {
  const trailPoint: Point = [a[0]+dx*t,a[1]+dz*t]
  // Leave room for the bench back between the southern rest bay and the stone wall.
  const point: Point = [trailPoint[0]-nx*2.05,trailPoint[1]-nz*2.05]
  forestTrailMeshes.push({id:trail.id+'-rest-bay-'+t,geometry:ribbon([trailPoint,point],3.4,.095)})
  benches.push({point,yaw:Math.atan2(nx,nz)})
  forestLamps.push([trailPoint[0]-nx*3.4+dx/length*1.9,trailPoint[1]-nz*3.4+dz/length*1.9])
 }
}
benches.push({point:WEST_REST_ROW.bench,yaw:Math.PI});forestLamps.push(WEST_REST_ROW.lamp)
function random(seed:number){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
export const willowPositions:Point[]=Array.from({length:22},(_,i)=>{const a=i/22*Math.PI*2;return[LAKE.x+Math.cos(a)*(LAKE.rx+2.4),LAKE.z+Math.sin(a)*(LAKE.rz+2.4)] as Point}).filter(([x,z])=>insidePark(x,z,5)&&Math.hypot(x-FISHING_SHOP.x,z-FISHING_SHOP.z)>FISHING_SHOP.clearance&&!onRoad(x,z,3.1)&&!SITES.some(s=>s.radius&&Math.hypot(x-s.x,z-s.z)<s.radius+1.5))
for(const a of[-2.1,-1.3,-.3,.7,1.4,2.1]){const p:Point=[LAKE.x+Math.cos(a)*12,LAKE.z+Math.sin(a)*15];if(Math.hypot(p[0]-62,p[1]+5)>4)willowPositions.push(p)}
/** Deterministic placement used by the baker and the authoring preview. */
export function createTreeLayout() {
 const siteEntrance=SITES.find(s=>s.id==='fortune')!
 const rand=random(20261109)
 const plantings:TreePlanting[]=[]
 const treePositions:Point[]=[]
 const nearForestTrail=(x:number,z:number)=>FOREST_TRAILS.some(t=>distanceToSegment(x,z,t.points[0]!,t.points[1]!)<t.width/2+1)
 const addTree=(x:number,z:number,scale=1.3,forceKind?:TreePlanting['kind'])=>{const slope=Math.hypot(heightAt(x+.5,z)-heightAt(x-.5,z),heightAt(x,z+.5)-heightAt(x,z-.5)),kind=forceKind??(slope>.3?'slender':rand()<.4?'cone':rand()<.58?'broadleaf':'slender'),crown=(kind==='cone'?1.2:kind==='slender'?1.5:3.2)*scale,jump=SITES.find(s=>s.id==='jump')!;if(Math.abs(x-MONUMENT_STAIRS.x)<MONUMENT_STAIRS.width/2+crown+.9&&z>MONUMENT_STAIRS.zTop-crown-1&&z<MONUMENT_STAIRS.zBottom+crown+1||SUMMIT_LAMP_ANCHORS.some(p=>Math.hypot(x-p[0],z-p[1])<crown+1)||hiddenExitGrade(x,z).distance<crown+1.65||HORROR_PORTALS.some(p=>distanceToSegment(x,z,[p.x,p.z],[p.x+p.outward*3.6,p.z])<crown+1.6)||Math.hypot(x-FISHING_NOTICE.x,z-FISHING_NOTICE.z)<crown+1.8||benches.some(b=>Math.hypot(x-b.point[0],z-b.point[1])<crown+2)||forestLamps.some(p=>Math.hypot(x-p[0],z-p[1])<.7)||!isPlantingGround(x,z)||['ranking','mailbox'].some(id=>{const s=site(id),dx=x-s.x,dz=z-s.z,front=dx*Math.sin(s.yaw!)+dz*Math.cos(s.yaw!),side=dx*Math.cos(s.yaw!)-dz*Math.sin(s.yaw!);return front>0&&front<10+crown&&Math.abs(side)<(id==='ranking'?5:2.5)+crown})||Math.hypot(x-site('pavilion').x,z-site('pavilion').z)<17.8+crown+.7||onSummitEdge(x,z,crown+.6)||[...JUMP_TABLES,...TABLES].some(p=>Math.hypot(x-p[0],z-p[1])<crown+2.6)||slope>.68||Math.hypot(x-jump.x,z-jump.z)<16||SITES.some(s=>!s.kind&&s.radius&&footprintDistance(s,x,z)<crown+.8)||Math.hypot(x-FISHING_SHOP.x,z-FISHING_SHOP.z)<FISHING_SHOP.clearance||!insidePark(x,z,crown+1.2)||inLake(x,z,4)||onRoad(x,z,crown+.7)||nearForestTrail(x,z)||FACILITY_APPROACHES.some(p=>p.id==='cafe'&&distanceToSegment(x,z,p.a,p.b)<p.width/2+crown+.7)||SIGNPOSTS.some(s=>Math.hypot(x-s.x,z-s.z)<3))return;treePositions.push([x,z]);plantings.push({position:[x,heightAt(x,z),z],kind,scale,blossom:rand()<.16?'#e3b4bb':undefined})}
 // Conceal the western outlet with layered foliage, keeping its small approach clear.
 for(const [x,z]of[[-62.5,-92],[-62.5,-84],[-65.5,-94],[-66.5,-82],[-67,-88]]as const)addTree(x,z,.95,'slender')
 // Priority planting around the new resting row, gym lawns and the discreet woodland approach.
 for(const [x,z]of [[31.5,-79],[31.5,-85],[35.5,-82],[35,-76],[36,-88],[32,-73]]as const)addTree(x,z,1.1,'broadleaf')
 for(const [x,z]of [[-25,17],[-23,19],[-26,21],[-22,16],[-38,56],[-33,56],[-29,56],[-24,56]]as const)addTree(x,z,.9,'slender')
 // Narrow trees fit the mole's western and rear verges without hiding its door.
 for(const [x,z]of [[-45.5,28],[-45.5,31],[-45.5,34],[-43,23.2],[-40,23.2],[-37,23.2],[-34,23.2]]as const)addTree(x,z,.65,'slender')
 // Dense planting behind the relocated pair and along the mole lawn; entrances stay clear.
 for(let x=-46;x<=-19;x+=2.8)for(let z=13;z<=24;z+=2.8)if(!treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<2.5))addTree(x,z,.78,'slender')
 for(let x=-47;x<=-24;x+=3)for(let z=26;z<=39;z+=3)if(!treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<2.6))addTree(x,z,.8,'cone')
 for(let x=-46;x<=-2;x+=3.5)for(let z=54;z<=94;z+=4)if(!treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<3.3))addTree(x,z,.85,'slender')
 for(const [x,z]of [[12.5,19],[14,17.8]]as const)addTree(x,z,.65,'cone')
 for(const [x,z]of [[19.3,56.2],[21.5,56.2]]as const)addTree(x,z,.7,'cone')
 for(let x=18;x<=25;x+=.5)for(let z=52;z<=59;z+=.5)if(Math.hypot(x-21.8,z-54.8)<4.1&&!treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<2.2))addTree(x,z,.65,'cone')
 for(let x=-41;x<=-23;x+=3)for(let z=53.2;z<=56;z+=2.8)if(!treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<2.8))addTree(x,z,.8,'cone')
 for(const [x,z]of [[-23,17.5],[-20.5,16],[-17.5,17],[-56,64],[-53,65.5],[-53.5,62.5]]as const)addTree(x,z,.8,'slender')
 for(let x=-59;x<=-50;x+=1)for(let z=61;z<=67;z+=1)if(Math.hypot(x+54.5,z-65.3)<5&&!treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<2.4))addTree(x,z,.65,'cone')
 // Priority canopy belt behind and beside the mole, clear of its entry and signs.
 for(let a=0;a<Math.PI*2;a+=.23){const x=-36+Math.cos(a)*11.2,z=31+Math.sin(a)*9.5;if(!treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<2.1))addTree(x,z,.85,'slender')}
 // Young trees on the levelled north shore, with the same road/building exclusions.
 for(const a of[-2.85,-2.65,-2.45,-2.25,-2.05,-1.15,-.95,-.75,-.55,-.35])for(const r of[5.2,7.4]){const x=LAKE.x+Math.cos(a)*(LAKE.rx+r),z=LAKE.z+Math.sin(a)*(LAKE.rz+r);if(!treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<2.4))addTree(x,z,.7,'slender')}
 // Prioritise a full-height evergreen belt on the eastern perimeter before general infill.
 // Young conifers fit the new fishing-road wall verge while keeping the full road clear.
 for(let a=-.55;a<-.1;a+=.055){const r=parkRadius(a),x=Math.cos(a)*(PARK.rx-2.6)*r,z=Math.sin(a)*(PARK.rz-2.6)*r;if(!treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<2))addTree(x,z,.45,'cone')}
 for(const inset of[3.5,6.8])for(let a=.1;a<1.27;a+=.035){const r=parkRadius(a),x=Math.cos(a)*(PARK.rx-inset)*r,z=Math.sin(a)*(PARK.rz-inset)*r;if(!treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<2.5))addTree(x,z,.9,inset<4?'cone':'slender')}
 // Keep a mixed woodland ring outside the preserved fountain benches, with road gaps.
 for(const radius of[22,25,28])for(let i=0;i<48;i++){const a=(i+(radius===25?.5:0))/48*Math.PI*2,x=site('fountain').x+Math.cos(a)*radius,z=site('fountain').z+Math.sin(a)*radius;if(!treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<3.2))addTree(x,z,.95,i%3?'slender':'cone')}
 for(const x of[-16.5,16.5])for(const z of[-96.5,-63.5])addTree(x,z,.8,'cone')
 // Purposeful tree belts surround every extra pavilion, with the entrance/steps clear.
 for(const s of SITES.filter(s=>s.id.startsWith('rest-'))){for(let i=0;i<14;i++){const a=i/14*Math.PI*2,front=Math.sin(a)*(Math.cos(s.yaw??0))+Math.cos(a)*(Math.sin(s.yaw??0));if(front>.74)continue;addTree(s.x+Math.cos(a)*15,s.z+Math.sin(a)*15,1.15+(i%3)*.12)}}
 for(let x=-82;x<-12;x+=6.5)for(let z=-84;z<-30;z+=6.5){const xx=x+rand()*2,zz=z+rand()*2;if(heightAt(xx,zz)<7||onRoad(xx,zz,3)||SITES.some(s=>s.radius&&Math.hypot(xx-s.x,zz-s.z)<s.radius+1.5)||treePositions.some(p=>Math.hypot(xx-p[0],zz-p[1])<4))continue;addTree(xx,zz,1.05+rand()*.3)}
 for(let i=0;i<24000&&plantings.length<900;i++){
  const x=(rand()-.5)*228,z=(rand()-.5)*228
  if(!insidePark(x,z,5)||inLake(x,z,6)||onRoad(x,z,2.2)||nearForestTrail(x,z)||Math.abs(x)<9&&z>84)continue
  if(SITES.some(s=>{if(s.kind==='reserve')return Math.abs(x-s.x)<s.radius+3&&Math.abs(z-s.z)<(s.id==='reserve-north'?10:9)+3;return s.kind?s.radius&&Math.hypot(x-s.x,z-s.z)<s.radius+2:s.radius&&footprintDistance(s,x,z)<1.5}))continue
  if(Math.abs(x)<5&&z>-67&&z<99||Math.hypot(x,z-38)<21||SIGNPOSTS.some(s=>Math.hypot(x-s.x,z-s.z)<3))continue
  if(treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<3.5))continue
  addTree(x,z,.8+rand()*.65)
 }
 // Fill remaining lawns with a secondary young woodland layer, preserving every
 // road, roof, stair, bench, wall and reserved plot exclusion in addTree.
 for(let x=-100;x<=100&&plantings.length<1050;x+=3.2)for(let z=-98;z<=100&&plantings.length<1050;z+=3.2){if(treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<3))continue;addTree(x,z,.82,Math.round((x+z)/3.2)%3?'slender':'cone')}
 // Low entrance trees keep the fortune kiosk visible from the gate.
 for(let x=-65;x<=65;x+=3.8)for(let z=86;z<=103;z+=3.8){if(treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<3.5)||Math.abs(x)<9||Math.hypot(x-siteEntrance.x,z-siteEntrance.z)<7)continue;addTree(x,z,.8)}
 // Plant the former decorative perimeter road as a continuous mixed tree belt.
 for(const [inset,scale,kind]of [[2.6,.6,'cone'],[6.3,.92,'slender'],[10.5,1.0,'broadleaf']]as const)for(let i=0;i<420;i++){
  const a=i/420*Math.PI*2,r=parkRadius(a),x=Math.cos(a)*(PARK.rx-inset)*r,z=Math.sin(a)*(PARK.rz-inset)*r
  if(Math.abs(x)<8&&z>92||treePositions.some(p=>Math.hypot(x-p[0],z-p[1])<(scale<.7?1.65:2.9)))continue
  addTree(x,z,scale,kind)
 }
 // Remove the two VR entrance trees after seeded planting: preserve all other random choices.
 for(let i=plantings.length-1;i>=0;i--){const p=treePositions[i]!;if([[-58.4,-11.6],[-68,-11.6]].some(([x,z])=>Math.hypot(p[0]-x!,p[1]-z!)<.1)){plantings.splice(i,1);treePositions.splice(i,1)}}
 // Keep the preserved exercise grove and lakeside willows; resolve overlap in the generated layer.
 const reserved:TreeEnvelope[]=[...fitnessWorldTrees.map(treeEnvelope),...willowPositions.map(([x,z],i)=>({tree:{position:[x,heightAt(x,z),z]as [number,number,number],kind:'willow' as const,scale:1},balls:[],stems:[{a:[x,heightAt(x,z)+.5,z]as const,b:[x,heightAt(x,z)+8.2+i%3,z]as const,r:2.6}],radius:2.6}))]
 const vrEntrance=site('vr')
 const accepted:TreeEnvelope[]=[],resolved:TreePlanting[]=[]
 const cleanup={removed:0,resized:0}
 for(const original of plantings){let selected:TreeEnvelope|undefined;for(const factor of[1,.85,.7]){const scale=original.scale*factor;if(scale<.4)continue;const candidate=treeEnvelope({...original,scale}),[x,,z]=candidate.tree.position;if(z>vrEntrance.z+5&&z<vrEntrance.z+15&&Math.abs(x-vrEntrance.x)<12.5||onRoad(x,z,candidate.radius+.2)||!insidePark(x,z,candidate.radius+.6)||SITES.some(s=>!s.kind&&s.radius&&footprintDistance(s,x,z)<candidate.radius+.2)||[...reserved,...accepted].some(p=>treesOverlap(candidate,p)))continue;selected=candidate;break}if(selected){accepted.push(selected);resolved.push(selected.tree);if(selected.tree.scale!==original.scale)cleanup.resized++}else cleanup.removed++}
 // Remove only the three trees in the seating and return lanes beside the pagoda.
 const stoneRumbleClearing: readonly Point[] = [[7.11,-63.73],[5.6,-59.6],[8.84,-57.14]]
 const kept = resolved.filter(({position:[x,,z]}) =>
   !stoneRumbleClearing.some(([treeX,treeZ]) => Math.hypot(x-treeX,z-treeZ)<.03))
 cleanup.removed += resolved.length - kept.length
 plantings.splice(0,plantings.length,...kept)
 return {plantings,cleanup}
}
const treeLayout = RENEWAL_PARK_ENABLED ? bakedTrees as unknown as ReturnType<typeof createTreeLayout> : createTreeLayout()
export const plantings = treeLayout.plantings
export const treePositions: Point[] = plantings.map(({position:[x,,z]})=>[x,z])
export const treeOverlapCleanup = treeLayout.cleanup
export const trees=buildParkTreeParts(plantings),treeCount=plantings.length
// The mapped supports own lamp positions and stable indices.
export const lamps:Point[]=MAPPED_GROUND_SUPPORTS.filter(p=>p.id.startsWith('lamp:')).map(p=>[p.x,p.z])
export function perimeterPoints(){return Array.from({length:201},(_,i)=>{const a=i/200*Math.PI*2,r=parkRadius(a),x=Math.cos(a)*PARK.rx*r,z=Math.sin(a)*PARK.rz*r;return new Vector3(x,heightAt(x,z)-.15,z)})}
