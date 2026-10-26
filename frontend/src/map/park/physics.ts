import { MOVEMENT } from '../../config'
import { createTowerRamp,createTowerDeck,towerPoint,OBSERVATION_TOWER,TOWER_DECK_RAIL_SEGMENTS } from '../../config/parkLayout'
import { PAVILION_CLOSED_SIDES,PAVILION_TIMBER,TOWER_SITE,MAILBOX,MINI_PROPS } from '../../config/parkPlan'
import { GARDEN_PAGODA,PAGODA_COLLIDERS } from '../../config/pagoda'
import { TELESCOPES } from '../../config/telescopes'
import { roundedSquare } from '../geometry'
import type { ParkDefinition } from './definition'
import type { resolveLake } from './lake'
import type { BenchSite,Point3 } from './interactionData'
import type { FitnessStation } from '../../config/fitness'
import type { TableAnchor } from '../../config/world'

export interface PhysicalBox {id:string;center:Point3;half:Point3;yaw:number;role:'solid'|'surface'}
export interface PhysicalMesh {id:string;vertices:number[];indices:number[];role:'terrain'|'surface'}
export interface PhysicalHull {id:string;vertices:number[];role:'solid'|'surface'}
interface Input {
  definition:ParkDefinition;lake:ReturnType<typeof resolveLake>
  terrainHeight:(x:number,z:number)=>number
  supportHeight:(x:number,z:number)=>number
  pavilions:readonly {id:string;x:number;z:number;floor:number;scale:number}[]
  stairs:readonly {id:string;x:number;z:number;floor:number;join:number;count:number;tread:number}[]
  tables:readonly TableAnchor[];fitness:readonly FitnessStation[];benches:readonly BenchSite[]
  kiosks:readonly {kind:string;x:number;z:number;width:number;depth:number;yaw:number}[]
  fences:readonly {id:string;from:readonly [number,number];to:readonly [number,number]}[]
  centralRails:readonly {id:string;from:readonly [number,number];to:readonly [number,number]}[]
  stairRails:readonly {id:string;from:readonly [number,number];to:readonly [number,number]}[]
  lamps:readonly Point3[]
}

/** Numeric collision proxies in metres; no player radius, preview clearance or physics margin baked in. */
export function buildPhysics(i:Input) {
  const d=i.definition,boxes:PhysicalBox[]=[],meshes:PhysicalMesh[]=[],hulls:PhysicalHull[]=[]
  const box=(id:string,center:Point3,half:Point3,yaw=0,role:PhysicalBox['role']='solid')=>boxes.push({id,center,half,yaw,role})
  const segment=(id:string,a:Point3,b:Point3,width:number,height:number)=>{
    // Horizontal segments only. Sloped rails are split into short vertical proxies below.
    box(id,[(a[0]+b[0])/2,(a[1]+b[1])/2+height/2,(a[2]+b[2])/2],[width/2,height/2,Math.hypot(b[0]-a[0],b[2]-a[2])/2],Math.atan2(b[0]-a[0],b[2]-a[2]))
  }
  const strip=(id:string,x0:number,x1:number,z:number,width:number,height:(x:number)=>number,segments=1)=>{
    const vertices:number[]=[],indices:number[]=[]
    for(let n=0;n<=segments;n++){const x=x0+(x1-x0)*n/segments;vertices.push(x,height(x),z-width/2,x,height(x),z+width/2)}
    for(let n=0;n<segments;n++){const k=n*2;indices.push(k,k+1,k+2,k+1,k+3,k+2)}
    meshes.push({id,vertices,indices,role:'surface'})
  }
  // First mesh is a regular square heightfield, compatible with the current Java ground sampler.
  // Bridge/deck/floor tops are separate surfaces, so terrain never makes a lid above swimming water.
  const half=d.park.size/2,step=d.physics.terrainStep,side=Math.round(d.park.size/step)+1,vertices:number[]=[],indices:number[]=[]
  for(let row=0;row<side;row++)for(let col=0;col<side;col++) {
    const x=-half+col*step,z=-half+row*step
    vertices.push(x,i.terrainHeight(x,z),z)
  }
  for(let row=0;row<side-1;row++)for(let col=0;col<side-1;col++) {
    const a=row*side+col,b=a+1,c=a+side,e=c+1
    indices.push(a,c,b,b,c,e)
  }
  meshes.push({id:'terrain',vertices,indices,role:'terrain'})
  const outline=roundedSquare(half,d.park.wallCornerRadius,24)
  outline.forEach((p,n)=>{const q=outline[(n+1)%outline.length]!;segment('boundary-'+n,[p[0],0,p[1]],[q[0],0,q[1]],d.physics.wallThickness,d.physics.wallHeight)})
  for(const p of i.pavilions) {
    // Eight-sided floor prism. Triangle tops use the same octagon as the visible floor.
    const v:number[]=[]
    for(const y of [0,p.floor])for(let n=0;n<8;n++){const a=Math.PI/8+n*Math.PI/4;v.push(p.x+Math.cos(a)*4.5*p.scale,y,p.z+Math.sin(a)*4.5*p.scale)}
    hulls.push({id:p.id+'-floor',vertices:v,role:'surface'})
    for(let n=0;n<8;n++) {
      const a=Math.PI/8+n*Math.PI/4
      box(p.id+'-pillar-'+n,[p.x+Math.cos(a)*3.65*p.scale,p.floor+1.85*p.scale,p.z+Math.sin(a)*3.65*p.scale],[.23*p.scale,1.85*p.scale,.23*p.scale])
    }
    for(const side of PAVILION_CLOSED_SIDES) {
      const a=Math.PI/8+side*Math.PI/4,b=a+Math.PI/4,r=3.65*p.scale
      segment(`${p.id}-balustrade-${side}`,[p.x+Math.cos(a)*r,p.floor,p.z+Math.sin(a)*r],[p.x+Math.cos(b)*r,p.floor,p.z+Math.sin(b)*r],.12,PAVILION_TIMBER.railHeight)
    }
  }
  for(const p of i.stairs)for(const side of [-1,1])for(let n=0;n<p.count;n++) {
    const h=(n+1)*p.floor/p.count
    box(`${p.id}-step-${side}-${n}`,[p.x,h/2,p.z+side*(p.join+(p.count-n-.5)*p.tread)],[1.8,h/2,(p.tread+.035)/2],0,'surface')
  }
  const pg=d.sites.pagoda,ps=d.pagoda
  box('pagoda-terrace',[pg.x,pg.floor/2,pg.z],[ps.terraceHalf,pg.floor/2,ps.terraceHalf],0,'surface')
  for(const axis of ['x','z'] as const)for(const sign of [-1,1])for(let n=0;n<ps.steps;n++) {
    const h=(n+1)*ps.riser,r=sign*(ps.terraceHalf+ps.steps*ps.tread-ps.tread/2-n*ps.tread)
    box(`pagoda-step-${axis}-${sign}-${n}`,[pg.x+(axis==='x'?r:0),h/2,pg.z+(axis==='z'?r:0)],[axis==='x'?(ps.tread+.02)/2:ps.stairHalfWidth,h/2,axis==='z'?(ps.tread+.02)/2:ps.stairHalfWidth],0,'surface')
  }
  // Existing pagoda's actual configured tier proxies, translated onto the new terrace.
  for(const b of PAGODA_COLLIDERS)box(b.id,[b.center[0]-GARDEN_PAGODA.x+pg.x,b.center[1]+pg.floor,b.center[2]-GARDEN_PAGODA.z+pg.z],b.half)
  // The VR tower uses the same stepped model at its own 0.7 scale.
  const vr=d.sites.vrPagoda
  box('vr-pagoda-body',[vr.x,7,vr.z],[3,7,3])
  for(const k of i.kiosks)box('layout-'+k.kind,[k.x,2.3,k.z],[k.width/2,2.3,k.depth/2],k.yaw)
  for(const p of d.plazaRestGardens)box(p.id,[p.x,.4,p.z],[p.width/2,.4,p.depth/2])
  for(const p of d.plazaBins)box(p.id,[p.x,.55,p.z],[.34,.55,.34])
  for(const [n,p] of d.vrEdgeTrees.entries())box('vr-belt-tree-'+n,[p.x,1.8,p.z],[.22,1.8,.22])
  // Aprons are walkable surfaces; never use a building-height box for an entire zone.
  box('vr-court-floor',[d.vrCourt.x,.05,d.vrCourt.z],[d.vrCourt.width/2,.05,d.vrCourt.depth/2],0,'surface')
  box('plaza-floor',[d.plaza.x,.07,d.plaza.z],[d.plaza.width/2,.07,d.plaza.depth/2],0,'surface')
  for(const kind of ['vr','folk'] as const) {
    const p=d.sites[kind],yaw=d.vrCourt.yaw
    const local=(x:number,y:number,z:number):Point3=>[p.x+x*Math.cos(yaw)+z*Math.sin(yaw),y,p.z-x*Math.sin(yaw)+z*Math.cos(yaw)]
    // Three walls leave the front open, instead of blocking an entire building footprint.
    box(kind+'-back',local(0,1.6,-4.3),[6.25,1.6,.1],yaw)
    for(const sign of [-1,1])box(kind+'-side-'+sign,local(sign*6.2,1.35,-.2),[.075,1.35,4.1],yaw)
  }
  for(const t of i.tables)box(t.id+'-top',[t.position[0],t.position[1]+.86,t.position[2]],[t.pavilionId?1:.95,.12,t.pavilionId?1:.75])
  // Fountain basin is round; its collision proxy must not enclose the surrounding sunken plaza.
  const fountainRadius=d.fountain.baseBasinRadius*d.fountain.scale,basin:number[]=[]
  for(const y of [-1.1,-.325])for(let n=0;n<48;n++){const a=n*Math.PI/24;basin.push(d.sites.fountain.x+Math.cos(a)*fountainRadius,y,d.sites.fountain.z+Math.sin(a)*fountainRadius)}
  hulls.push({id:'fountain-basin',vertices:basin,role:'solid'})
  for(const s of i.fitness)box(s.id,[s.position[0],s.position[1]+1,s.position[2]],[1.15,1,1.1],s.yaw)
  for(const b of i.benches) {
    if(b.id.startsWith('bench-fitness-ring-'))continue // continuous curved seat proxy follows below
    box(b.id+'-seat',[b.x,b.y+b.seatHeight-.06,b.z],[b.halfWidth,.06,.38],b.yaw)
    box(b.id+'-back',[b.x-Math.sin(b.yaw)*.38,b.y+.94,b.z-Math.cos(b.yaw)*.38],[b.halfWidth,.3,.06],b.yaw)
  }
  for(const quadrant of [0,1,2,3])for(let n=0;n<16;n++) {
    const a=quadrant*Math.PI/2+.2+(Math.PI/2-.4)*n/16,b=quadrant*Math.PI/2+.2+(Math.PI/2-.4)*(n+1)/16
    const from:Point3=[d.sites.fitness.x+Math.cos(a)*2.98,.56,d.sites.fitness.z-Math.sin(a)*2.98],to:Point3=[d.sites.fitness.x+Math.cos(b)*2.98,.56,d.sites.fitness.z-Math.sin(b)*2.98]
    segment(`fitness-ring-seat-${quadrant}-${n}`,from,to,.76,.06)
  }
  box('fitness-tree',[d.sites.fitness.x,3.2,d.sites.fitness.z],[.8,3.2,.8])
  for(const run of i.fences)segment(run.id,[run.from[0],0,run.from[1]],[run.to[0],0,run.to[1]],.14,1.1)
  for(const run of i.centralRails)segment(run.id,[run.from[0],pg.floor,run.from[1]],[run.to[0],pg.floor,run.to[1]],.5,1.2)
  for(const run of i.stairRails)for(let n=0;n<ps.steps;n++) {
    const at=(t:number):Point3=>[run.from[0]+(run.to[0]-run.from[0])*t,pg.floor*(1-t),run.from[1]+(run.to[1]-run.from[1])*t]
    segment(run.id+'-'+n,at(n/ps.steps),at((n+1)/ps.steps),.46,1.2)
  }
  i.lamps.forEach((p,n)=>box('lamp-'+n,[p[0],2.5,p[2]],[.12,2.5,.12]))
  const lake=i.lake
  lake.SHORE_RUNS.forEach((r,n)=>segment('shore-rail-'+n,[r.from[0],0,r.from[1]],[r.to[0],0,r.to[1]],.14,1.18))
  for(const c of lake.CROSSINGS) {
    if(c.kind==='wood') {
      strip(c.id,c.startX,c.endX,c.z,c.halfWidth*2,x=>lake.crossingHeight(x,c.z)!,96)
      for(const sign of [-1,1])for(let n=0;n<48;n++) {
        const a=c.startX+(c.endX-c.startX)*n/48,b=c.startX+(c.endX-c.startX)*(n+1)/48,z=c.z+sign*c.halfWidth
        segment(c.id+`-rail-${sign}-${n}`,[a,lake.crossingHeight(a,c.z)!,z],[b,lake.crossingHeight(b,c.z)!,z],.16,1.1)
      }
    } else {
      const count=Math.ceil((c.endX-c.startX)/1.55),step=(c.endX-c.startX)/count
      for(let n=0;n<count;n++) {
        const x=c.startX+(n+.5)*step,width=(step-.09)*(1+Math.sin(n*1.7)*.035),depth=(c.halfWidth*2-.12)*(1+Math.cos(n*2.3)*.035),v:number[]=[]
        for(const y of [-.30,.32])for(let j=0;j<10;j++){const a=j*Math.PI/5,noise=1+.1*Math.sin(j*7+n*2.1);v.push(x+Math.cos(a)*width/2*noise,y,c.z+Math.sin(n*2.7)*.1+Math.sin(a)*depth/2*noise)}
        hulls.push({id:c.id+'-stone-'+n,vertices:v,role:'surface'})
      }
    }
  }
  lake.BRIDGE_LANDINGS.forEach((p,n)=>strip('bridge-landing-'+n,p.x0,p.x1,p.z,p.halfWidth*2,x=>lake.landingHeight(x,p.z)!,8))
  for(const p of lake.FISHING_LANDINGS)strip('fishing-landing-'+p.x0,p.x0,p.x1,p.z,3.2,x=>p.y0+(p.y1-p.y0)*(x-p.x0)/(p.x1-p.x0))
  for(const deck of lake.FISHING_DECKS)box(deck.id,[deck.x,.16,deck.z],[deck.w/2,.16,deck.d/2],0,'surface')
  lake.FISHING_RAILS.forEach((r,n)=>segment('fishing-rail-'+n,[r.from[0],.32,r.from[1]],[r.to[0],.32,r.to[1]],.18,1.06))
  for(const r of lake.DRAFT_LAKE_ROCKS)box(r.id,[r.x,r.y,r.z],r.size,r.yaw)
  const dx=d.sites.tower.x-TOWER_SITE.x,dz=d.sites.tower.z-TOWER_SITE.z
  for(const t of TELESCOPES)box(t.id,[t.position[0]+dx,t.position[1]+.65,t.position[2]+dz],[.23,.65,.23])
  for(const [id,create] of [['tower-ramp',createTowerRamp],['tower-deck',createTowerDeck]] as const) {
    const m=create(),v=Array.from(m.vertices);for(let n=0;n<v.length;n+=3){v[n]!+=dx;v[n+2]!+=dz}
    meshes.push({id,vertices:v,indices:Array.from(m.indices),role:'surface'})
  }
  for(const radius of [OBSERVATION_TOWER.inner,OBSERVATION_TOWER.outer])for(let n=0;n<358;n++) {
    const a=towerPoint(n/360,radius),b=towerPoint((n+1)/360,radius)
    const height=radius===OBSERVATION_TOWER.inner?Math.max(.01,Math.min(1.4,OBSERVATION_TOWER.height+.08-(a[1]+b[1])/2)):1.4
    segment(`tower-rail-${radius}-${n}`,[a[0]+dx,a[1],a[2]+dz],[b[0]+dx,b[1],b[2]+dz],.12,height)
  }
  TOWER_DECK_RAIL_SEGMENTS.forEach(([a,b],n)=>segment('tower-deck-rail-'+n,[a[0]+dx,a[1],a[2]+dz],[b[0]+dx,b[1],b[2]+dz],.12,1.4))
  for(const t of d.vrStoneSets){box(t.id,[t.x,.95,t.z],[1.2,.12,.75]);for(const sign of [-1,1])box(t.id+'-chair-'+sign,[t.x,.49,t.z+sign*1.8],[.525,.11,.425])}
  box('fish-bread',[d.sites.cart.x,MINI_PROPS[0].height/2,d.sites.cart.z],[MINI_PROPS[0].width/2,MINI_PROPS[0].height/2,MINI_PROPS[0].depth/2])
  box('feedback-mailbox',[d.sites.mailbox.x,MAILBOX.height/2,d.sites.mailbox.z],[MAILBOX.bodyHalfWidth,MAILBOX.height/2,MAILBOX.bodyHalfDepth])
  const [sx,sz]=d.park.spawn,centerOffset=MOVEMENT.radius+MOVEMENT.halfHeight+MOVEMENT.offset+d.physics.spawnClearance
  let spawnGround=i.supportHeight(sx,sz)
  for(const b of boxes)if(b.role==='surface') {
    const dx=sx-b.center[0],dz=sz-b.center[2],x=dx*Math.cos(b.yaw)-dz*Math.sin(b.yaw),z=dx*Math.sin(b.yaw)+dz*Math.cos(b.yaw)
    if(Math.abs(x)<=b.half[0]&&Math.abs(z)<=b.half[2])spawnGround=Math.max(spawnGround,b.center[1]+b.half[1])
  }
  return {units:'m',upAxis:'Y',coordinateSpace:'world',playerInflation:0,collisionMargin:0,
    character:{radius:MOVEMENT.radius,halfHeight:MOVEMENT.halfHeight,offset:MOVEMENT.offset},
    terrain:{meshId:'terrain',halfSize:half,step,columns:side,rows:side,triangleOrder:'a-c-b,b-c-d'},
    spawn:{position:[sx,spawnGround+centerOffset,sz] as Point3,yaw:Math.PI,origin:'capsule-center',groundClearance:d.physics.spawnClearance},
    boxes,meshes,hulls,
  }
}
