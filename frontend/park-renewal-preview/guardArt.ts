import {BoxGeometry,Matrix4,Quaternion,Vector3} from 'three'
import {PropBuilder} from '../src/world/art/propGeometry'
import {summitWalls} from './summitWalls'
import {ascentFenceRuns,hillsideGuardRuns,onBalloonAscent,guardPosts,guardPostRailBases,guardRailGeometry} from './guardLayout'
import {guardFloorY} from './groundSurface'
import {JUMP_FENCE_HEIGHT,jumpFenceRuns} from './jumpFencePlan'
import {HILLSIDE_RAIL_HEIGHTS} from './guardDimensions'
function beam(b:PropBuilder,color:string,a:number[],z:number[],width:number,depth:number){const p=new Vector3(...a),q=new Vector3(...z),d=q.clone().sub(p),g=new BoxGeometry(width,d.length(),depth);g.applyMatrix4(new Matrix4().compose(p.add(q).multiplyScalar(.5),new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()),new Vector3(1,1,1)));b.add('stone',g,color)}

export function createHillGuardArt(){const b=new PropBuilder([5,3]);for(const w of summitWalls)beam(b,'#c3beab',[w.a[0]-w.nx*.22,22.12,w.a[1]-w.nz*.22],[w.b[0]-w.nx*.22,22.12,w.b[1]-w.nz*.22],.2,.46)
 for(const [i,p]of guardPosts.entries()){if(onBalloonAscent(p[0]!,p[2]!))continue;b.box('stone','#b8b3a1',[p[0]!,p[1]!,p[2]!],[.22,.22,.22]);const bottom=p[1]!+.04,top=Math.max(bottom+.7,guardPostRailBases[i]!+1.33);b.box('wood','#6e6246',[p[0]!,(bottom+top)/2,p[2]!],[.13,top-bottom,.13])}
 for(const h of HILLSIDE_RAIL_HEIGHTS)b.add('wood',guardRailGeometry(hillsideGuardRuns,h),'#8d7d58')
 addJumpFence(b,ascentFenceRuns)
 return b.finish()}
function addJumpFence(builder:PropBuilder,runs:Parameters<typeof guardRailGeometry>[0]){
 for(const run of runs){
  let travelled=2
  for(let i=0;i<run.length;i++){
   const [x,y,z]=run[i]!
   if(i)travelled+=Math.hypot(x-run[i-1]![0],z-run[i-1]![2])
   if(travelled<1.8&&i!==run.length-1)continue
   const bottom=guardFloorY(x,z)-.03,top=y+JUMP_FENCE_HEIGHT
   builder.box('wood','#6e6246',[x,(bottom+top)/2,z],[.14,top-bottom,.14])
   travelled=0
  }
 }
 for(const height of [.48,JUMP_FENCE_HEIGHT-.045])builder.add('wood',guardRailGeometry(runs,height),'#8d7d58')
}
export function createJumpFenceArt(){
 const builder=new PropBuilder()
 addJumpFence(builder,jumpFenceRuns)
 return builder.finish()
}
