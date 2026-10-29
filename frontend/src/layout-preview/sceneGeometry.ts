import { inKioskEntrance,inMailboxClearing } from '../map/park/planting'
import { SIMPLE_MAP } from '../world/art/mapRenderProfile'
import { roundedSquare,insideRoundedSquare } from '../world/art/roundedOutline'
import { ExtrudeGeometry,Path, Shape, ShapeGeometry } from 'three'
import { PropBuilder } from '../world/art/propGeometry'
import { beam, seeded, type Part } from '../world/art/Instances'
import { DRAFT_PARK,SETTINGS,KIOSKS, DRAFT_PAVILIONS,DRAFT_STAIRS,PAVILION_COURT,DRAFT_FITNESS_AREA,DRAFT_FOUNTAIN,VR_COURT, DRAFT_BOXES, FENCE_BLOCKERS, LIFE_PLAZA, SITES, DRAFT_LAMPS, onPath } from './layout'
import { FISHING_DECKS,FISHING_LANDINGS,shoreAccess } from './lakeLayout'

// All geometry and instances are static and shared. No per-frame construction.
const shape=new Shape();roundedSquare(DRAFT_PARK.half,SETTINGS.park.wallCornerRadius,24).forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath()
for(const [x,z,rx,rz] of [[SITES.lake.x,SITES.lake.z,SITES.lake.rx,SITES.lake.rz],[SITES.fountain.x,SITES.fountain.z,DRAFT_FOUNTAIN.plazaRadius,DRAFT_FOUNTAIN.plazaRadius]]) {
  const hole=new Path();hole.absellipse(x!,-z!,rx!,rz!,0,Math.PI*2,true,0);shape.holes.push(hole)
}
export const lawn=new ShapeGeometry(shape,96);lawn.rotateX(-Math.PI/2)
const uv=lawn.getAttribute('uv');for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)/3,uv.getY(i)/3)

const b=new PropBuilder([8,6]);
// Rectangular forecourts, garden edging and the continuous arrival axis.
for(const p of DRAFT_PAVILIONS) {
  const main=p.id==='P0',w=main?26:PAVILION_COURT.width,d=main?31:PAVILION_COURT.depth
  b.box('stone','#d1c7ae',[p.x,.045,p.z],[w,.09,d])
  for(const side of [-1,1])b.box('stone','#a49c80',[p.x+side*(w/2+.1),.17,p.z],[.28,.34,d])
}
const stairs=new PropBuilder([6,4])
for(const p of DRAFT_STAIRS)for(const side of [-1,1])for(let i=0;i<p.count;i++) {
  const h=(i+1)*p.floor/p.count
  stairs.box('stone','#c5baa0',[p.x,h/2,p.z+side*(p.join+(p.count-i-.5)*p.tread)],[3.6,h,p.tread+.035])
}
export const pavilionStairsArt=stairs.finish()
b.box('stone','#b9b6a6',[SITES.pagoda.x,SITES.pagoda.floor/2,SITES.pagoda.z],[SETTINGS.pagoda.terraceHalf*2,SITES.pagoda.floor,SETTINGS.pagoda.terraceHalf*2])
for(const side of [-1,1])for(let step=0;step<SETTINGS.pagoda.steps;step++) {
  const h=(step+1)*SETTINGS.pagoda.riser,offset=SETTINGS.pagoda.terraceHalf+SETTINGS.pagoda.steps*SETTINGS.pagoda.tread-SETTINGS.pagoda.tread/2-step*SETTINGS.pagoda.tread
  b.box('stone','#d4cebc',[SITES.pagoda.x+side*offset,h/2,SITES.pagoda.z],[SETTINGS.pagoda.tread+.02,h,SETTINGS.pagoda.stairHalfWidth*2])
  b.box('stone','#d4cebc',[SITES.pagoda.x,h/2,SITES.pagoda.z+side*offset],[SETTINGS.pagoda.stairHalfWidth*2,h,SETTINGS.pagoda.tread+.02])
}
// Uniform apron shared by the two east-facing houses and the original pagoda.
b.box('stone','#c8c0ad',[VR_COURT.x,.05,VR_COURT.z],[VR_COURT.width,.1,VR_COURT.depth])
if(!SIMPLE_MAP){
  for(let x=VR_COURT.x-VR_COURT.width/2+.5;x<VR_COURT.x+VR_COURT.width/2;x+=1)b.box('stone','#afa997',[x,.102,VR_COURT.z],[.018,.012,VR_COURT.depth])
  for(let z=VR_COURT.z-VR_COURT.depth/2+.5;z<VR_COURT.z+VR_COURT.depth/2;z+=1)b.box('stone','#afa997',[VR_COURT.x,.102,z],[VR_COURT.width,.012,.018])
}
export const gardenArt=b.finish()

// Static landscaped grove batches. Keep all structural footprints and routes clear.
export const trunks:Part[]=[],crowns:Part[]=[],flowers:Part[]=[],shrubs:Part[]=[]
const random=seeded(1802026)
const candidates: [number,number][]=[]
for(let z=-79;z<=79;z+=3.15)for(let x=-79;x<=79;x+=3.15)candidates.push([x+(random()-.5)*1.2,z+(random()-.5)*1.2])
function reserved(x:number,z:number) {
  if(inKioskEntrance(x,z,KIOSKS))return true
  if(onPath(x,z,1.4)||DRAFT_LAMPS.some(p=>Math.hypot(x-p[0],z-p[2])<2))return true
  if(Math.hypot(x-LIFE_PLAZA.x,z-LIFE_PLAZA.z)<LIFE_PLAZA.pavingRadius+4)return true
  if(Math.abs(x-SITES.pagoda.x)<18&&z<SITES.pagoda.z+17&&z>SITES.pagoda.z-19)return true
  if(DRAFT_PAVILIONS.some(p=>Math.abs(x-p.x)<(p.id==='P0'?15:PAVILION_COURT.width/2+1.5)&&Math.abs(z-p.z)<(p.id==='P0'?18:PAVILION_COURT.depth/2+1.5)))return true
  if(Math.hypot((x-SITES.lake.x)/(SITES.lake.rx+3),(z-SITES.lake.z)/(SITES.lake.rz+3))<1)return true
  if(Math.hypot(x-SITES.fountain.x,z-SITES.fountain.z)<DRAFT_FOUNTAIN.plazaRadius+2||Math.hypot(x-SITES.tower.x,z-SITES.tower.z)<12)return true
  if(Math.abs(x-VR_COURT.x)<VR_COURT.width/2+2&&Math.abs(z-VR_COURT.z)<VR_COURT.depth/2+2)return true
  if(Math.hypot((x-SITES.fitness.x)/(DRAFT_FITNESS_AREA.rx+3),(z-SITES.fitness.z)/(DRAFT_FITNESS_AREA.rz+3))<1)return true
  // Woodland follows the reference: trees remain inside the reserve, clear only routes and pockets.
  if(DRAFT_BOXES.some(c=>Math.abs(x-c.x)<c.halfX+3&&Math.abs(z-c.z)<c.halfZ+3))return true
  if(FENCE_BLOCKERS.some(c=>Math.abs(x-c.x)<c.halfX+2&&Math.abs(z-c.z)<c.halfZ+2))return true
  if(Math.abs(x+35)<6&&Math.abs(z-29)<7)return true
  return false
}
for(const [x,z] of candidates) {
  if(!insideRoundedSquare(x,z,82,7)||reserved(x,z)||random()<.05)continue
  const h=4.2+random()*3.7,r=1.05+random()*.65,pink=random()<.19
  trunks.push({p:[x,h*.3,z],s:[.22,h*.6,.22],c:'#72553c'})
  crowns.push({p:[x,h*.72,z],s:[r,h*.37,r],c:pink?'#c98f9e':['#537e55','#6f965d','#456d4c','#87a265'][Math.floor(random()*4)]!})
  if(random()<.4)shrubs.push({p:[x+1.4,.5,z+1],s:[1,.65,.9],c:'#66875b'})
}
// Continuous inner wall planting, leaving the south entrance and perimeter path clear.
export const PERIMETER_TREE_SITES:Array<{x:number;z:number}>=[]
const wallTrees=roundedSquare(87.6,3.6,5)
for(let i=0;i<wallTrees.length;i++) {
  const a=wallTrees[i]!,b=wallTrees[(i+1)%wallTrees.length]!,length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(length/5)
  for(let j=0;j<n;j++) {
    const t=j/n,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t
    if(z>86&&Math.abs(x)<10)continue
    PERIMETER_TREE_SITES.push({x,z})
    const h=5.2+random()*1.5
    trunks.push({p:[x,h*.3,z],s:[.2,h*.6,.2],c:'#72553c'})
    crowns.push({p:[x,h*.76,z],s:[1.15,2,1.15],c:['#537e55','#6f965d','#456d4c'][i%3]!})
  }
}
// Dedicated shoreline row: isolated so the tree model can later be replaced with willows.
export const shoreTrunks:Part[]=[],shoreCrowns:Part[]=[]
export const SHORE_TREE_SITES:Array<{id:string;x:number;z:number}>=[]
for(let i=0;i<74;i++) {
  const a=i*Math.PI*2/74,x=SITES.lake.x+Math.cos(a)*(SITES.lake.rx+2.1),z=SITES.lake.z+Math.sin(a)*(SITES.lake.rz+3)
  if(inKioskEntrance(x,z,KIOSKS)||shoreAccess(x,z)||onPath(x,z,.05)||Math.abs(x-25)<9&&Math.abs(z-38)<8)continue
  SHORE_TREE_SITES.push({id:`shore-tree-${i}`,x,z})
  const h=5.5+random()*1.8
  shoreTrunks.push({p:[x,h*.32,z],s:[.2,h*.64,.2],c:'#776045'})
  shoreCrowns.push({p:[x,h*.75,z],s:[1.45,2.15,1.45],c:i%3?'#739562':'#568263'})
}
for(const side of [-1,1])for(let z=-75;z<84;z+=7) {
  const x=side*7
  if(reserved(x,z))continue
  shrubs.push({p:[x,.4,z],s:[.85,.5,.8],c:'#78945e'})
  for(let i=0;i<5;i++)flowers.push({p:[x+(random()-.5)*1.5,.65,z+(random()-.5)*1.5],s:[.15,.2,.15],c:i%2?'#e3b887':'#d89ea2'})
}

// Filter after seeded construction so clearing one facility does not reshuffle the forest.
for(let i=trunks.length-1;i>=0;i--)if(inMailboxClearing(trunks[i]!.p[0],trunks[i]!.p[2],SITES.mailbox,SETTINGS.planting.mailboxTreeClearance)){
  trunks.splice(i,1);crowns.splice(i,1)
}
for(let i=shrubs.length-1;i>=0;i--)if(inMailboxClearing(shrubs[i]!.p[0],shrubs[i]!.p[2],SITES.mailbox,SETTINGS.planting.mailboxTreeClearance))shrubs.splice(i,1)

// A separate background ring: decorative, never included in walking bounds/colliders.
const city=new PropBuilder([6,4]);
const ringWidth=(DRAFT_PARK.backgroundSize-DRAFT_PARK.size)/2,ringCenter=(DRAFT_PARK.backgroundSize+DRAFT_PARK.size)/4
for(const side of [-1,1]) {
  city.box('stone','#b3b6af',[side*ringCenter,-.22,0],[ringWidth,.3,DRAFT_PARK.backgroundSize])
  city.box('stone','#b3b6af',[0,-.22,side*ringCenter],[DRAFT_PARK.size,.3,ringWidth])
  city.box('stone','#aab3a2',[side*479,-.6,0],[642,.3,1600])
  city.box('stone','#aab3a2',[0,-.6,side*479],[316,.3,642])
}
export const cityArt=city.finish()

// Review furniture, docks and service footprints. Existing principal models are reused separately.
const extra=new PropBuilder([8,6])
for(const deck of FISHING_DECKS) {
  extra.box(deck.wood?'wood':'stone',deck.wood?'#917249':'#b8b4a6',[deck.x,.15,deck.z],[deck.w,.3,deck.d])
  const n=Math.round(deck.w/.25)
  for(let i=0;i<n;i++)extra.box(deck.wood?'wood':'stone',deck.wood?(i%3?'#b59668':'#a88b5f'):(i%3?'#cec9b8':'#bfbcae'),[deck.x-deck.w/2+(i+.5)*deck.w/n,.31,deck.z],[deck.w/n-.014,.02,deck.d-.12])
  for(const sx of [-1,1])for(const sz of [-1,1]) {
    const x=deck.x+sx*(deck.w/2-.18),z=deck.z+sz*(deck.d/2-.18)
    extra.cylinder('wood','#6d5539',[x,-.25,z],.2,.23,1.5,[0,0,0],12)
    extra.box('wood','#755b3c',[x,.84,z],[.18,1.06,.18]);extra.box('wood','#b59a68',[x,1.39,z],[.28,.12,.28])
  }
  for(const sz of [-1,1])for(const h of [.78,1.25])extra.box('wood','#92784f',[deck.x,h,deck.z+sz*(deck.d/2-.18)],[deck.w-.36,.1,.1])
  // Open land-side arrival; two knee-high rod rests at the water-facing edge.
  const toward=deck.wood?1:-1
  for(const sz of [-1,1]){
    const x=deck.x+toward*(deck.w/2-.35),z=deck.z+sz*1.5
    extra.cylinder('metal','#4c6155',[x,.56,z],.035,.035,.5)
    extra.box('wood','#8f7754',[x,.81,z],[.26,.06,.16])
  }
  // Compact seating faces the lake and stays outside the access centre line.
  const bx=deck.x-toward*.7,bz=deck.z-2.15
  for(const dx of [-1,1])extra.box('metal','#48584a',[bx+dx*.8,.53,bz],[.12,.42,.55])
  for(let j=0;j<4;j++)extra.box('wood','#a98b5e',[bx,.78,bz-.23+j*.15],[2.3,.08,.12])
  extra.box('wood','#8c724c',[bx,.98,bz-.28],[2.3,.38,.08])
}
for(const p of FISHING_LANDINGS) {
  const profile=new Shape();profile.moveTo(p.x0,0);profile.lineTo(p.x1,0);profile.lineTo(p.x1,p.y1);profile.lineTo(p.x0,p.y0);profile.closePath()
  extra.add('stone',new ExtrudeGeometry(profile,{depth:3.2,bevelEnabled:false}),'#c5bea9',[0,0,p.z-1.6])
}
// Forest benches are shared ReferenceBench instances derived from interaction data.
export const detailArt=extra.finish()

const lakeBank:Part[]=[]
for(let i=0;i<120;i++) {
  const a=i*Math.PI/60,c=(i+1)*Math.PI/60
  if(shoreAccess(SITES.lake.x+Math.cos(a)*(SITES.lake.rx+.3),SITES.lake.z+Math.sin(a)*(SITES.lake.rz+.3)))continue
  lakeBank.push(beam([SITES.lake.x+Math.cos(a)*(SITES.lake.rx+.3),.13,SITES.lake.z+Math.sin(a)*(SITES.lake.rz+.3)],[SITES.lake.x+Math.cos(c)*(SITES.lake.rx+.3),.13,SITES.lake.z+Math.sin(c)*(SITES.lake.rz+.3)],.28,'#b5b29e'))
}
export {lakeBank}
