import {PERIMETER_COLLIDERS} from '../perimeterCollision'
import mapping from '../../../generated/park-renewal/mapping.json' with {type:'json'}
import bindings from '../../../generated/park-renewal/park-bindings.local.json' with {type:'json'}
import {JUMP_SEQUENCE,JUMP_STAGES,JUMP_REWARDS,JUMP_START,JUMP_FINISH} from '../jump10Plan'
import {heightAt,inLake,LAKE,site,onBridge,bridgeDeckHeight} from '../plan'
import {parkWalkSurface} from '../surfaceHeight'
import type {MappedAnchor} from './types'
import {renewalWalkSupports} from '../walkSupportExport'
import {accessSurfaceHeight} from '../accessSurfaces'
import {renewalSolidBoxes,renewalRoundTables} from '../solidCollision'

/** Separate local backend handoff. The deployed park and its course files are never overwritten. */
export function backendHandoff(base:Record<string,any>){
 const rows=mapping.coordinates as unknown as MappedAnchor[],normal=(r:MappedAnchor)=>({id:r.id,kind:r.kind.toUpperCase(),position:r.position,yaw:r.yaw,radius:r.radius??3,heightTolerance:r.heightTolerance??.7,use:r.use,exit:r.exit,seats:r.seats})
 const interactions:Record<string,unknown>={};for(const [kind,key]of [['bench','benches'],['fitness','fitness'],['telescope','telescopes']])interactions[key!]=rows.filter(r=>r.kind===kind&&r.status==='mapped').map(normal)
 const note=rows.find(r=>r.kind==='notes')!,mail=rows.find(r=>r.id==='feedback-mailbox')!
 interactions.notes={...normal(note),reachPosition:[note.reach!.x,note.reach!.y,note.reach!.z],heightReference:'legacy-avatar-origin',radiusComparison:'less-than-or-equal',heightComparison:'strict-less-than'}
 interactions.mailbox={...normal(mail),reachPosition:[mail.reach!.x,mail.reach!.y,mail.reach!.z]}
 const vr=rows.find(r=>r.kind==='game-entry'&&r.id==='vr-experience-hall'&&r.status==='mapped')!
 const facilities=[{...normal(vr),reachPosition:[vr.reach!.x,vr.reach!.y,vr.reach!.z]}]
 const vertices:number[]=[],indices:number[]=[],half=110,side=221
 // Keep the regular ground sampler below layered structures. Bridge, plinths,
 // smooth stairs and all spiral turns are independent exact support meshes.
 for(let z=0;z<side;z++)for(let x=0;x<side;x++){
  const px=x-half,pz=z-half,support=accessSurfaceHeight(px,pz),t=site('tower'),underTower=Math.hypot(px-t.x,pz-t.z)<=8.1
  const floor=support!==null?Math.min(heightAt(px,pz)+.085,support-.15):onBridge(px,pz)?Math.min(heightAt(px,pz)+.085,bridgeDeckHeight(px)-.15):underTower?heightAt(px,pz)+.085:parkWalkSurface(px,pz,heightAt(px,pz))
  vertices.push(px,inLake(px,pz)?LAKE.y-3:floor,pz)
 }
 for(let z=0;z<side-1;z++)for(let x=0;x<side-1;x++){const a=z*side+x;indices.push(a,a+side,a+1,a+1,a+side,a+side+1)}
 const tower=site('tower'),towerBase=heightAt(tower.x,tower.z)
 const supports=renewalWalkSupports(),boxes=[...PERIMETER_COLLIDERS,...renewalSolidBoxes(rows)]
 const hulls=[...supports.hulls,...renewalRoundTables(rows).map(t=>({id:t.id,role:'solid',vertices:[t.bottom,t.top].flatMap(y=>Array.from({length:32},(_,i)=>[t.x+Math.cos(i*Math.PI/16)*t.radius,y,t.z+Math.sin(i*Math.PI/16)*t.radius]).flat())}))]
 const scene:Record<string,any>={...base,sourceSha256:mapping.mappingVersion,world:{...base.world,halfSize:110},spawn:{first:mapping.world.spawn,spacing:1.35,yaw:Math.PI,groundAligned:true},tables:rows.filter(r=>r.kind==='table'&&r.status==='mapped').map(r=>({id:r.id,position:r.position})),boxes,hulls,meshes:[{id:'renewal-walk-surfaces',role:'terrain',vertices,indices},...supports.meshes],lake:{...base.lake,x:LAKE.x,z:LAKE.z,radiusX:LAKE.rx,radiusZ:LAKE.rz,surfaceY:LAKE.y},tower:{...base.tower,x:tower.x,z:tower.z,surfaceOffset:towerBase+.12*40/18,height:40,topY:towerBase+40+.12*40/18}}
 for(const key of ['furniturePolicy','fountainPolicy','pavilionJumpSpeed','pavilionTunedJumpSpeed','pavilions','steppingStones'])delete scene[key]
 const data={world:{half:110},tables:scene.tables,facilities,bindings:bindings.bindings,interactions,physics:{units:'m',upAxis:'Y',coordinateSpace:'world',playerInflation:0,collisionMargin:0,character:{radius:base.movement.radius,halfHeight:base.movement.halfHeight,offset:base.movement.offset},spawn:{position:mapping.world.spawn,yaw:Math.PI,origin:'capsule-center'},boxes,hulls,meshes:scene.meshes,sceneData:scene}}
 const pads=JUMP_SEQUENCE.map((p,block)=>({...p,block,stage:p.stage+1,top:p.height,thickness:p.thickness??.24}))
 const colliders=pads.map(p=>({id:p.id,block:p.block,stage:p.stage,gate:p.gate??null,shape:p.radius==null?'box':'cylinder',camera:false,center:[p.x,p.top-p.thickness/2,p.z],half:[p.radius??p.halfX,p.thickness/2,p.radius??p.halfZ],radius:p.radius??null,yaw:p.collisionYaw??p.yaw,top:p.top,thickness:p.thickness}))
 return{world:{format:'ontop.park-map',mapId:'park-renewal-local',schemaVersion:2,mapVersion:mapping.mappingVersion,data},course:{schemaVersion:1,mapVersion:mapping.mappingVersion,courseVersion:'park220-jump10-v1',rulesVersion:'v4',physics:{tickRate:30,coyoteTicks:3,jumpBufferTicks:4,colliderCoordinates:'uninflated; metres; Y up; center = top - thickness/2',avatarCollision:false},stages:JUMP_STAGES.map((s,i)=>({...s,stage:i+1,count:pads.filter(p=>p.stage===i+1&&!p.gate).length,reward:JUMP_REWARDS[i]})),start:JUMP_START,finish:JUMP_FINISH,returnTo:{x:JUMP_START.x,z:JUMP_START.z+1.6},pads,colliders}}
}
