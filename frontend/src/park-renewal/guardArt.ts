import {BoxGeometry,Matrix4,Quaternion,Vector3} from 'three'
import {PropBuilder} from '../world/art/propGeometry'
import {summitWalls} from './summitWalls'
import {guardRuns,guardPosts,guardPostRailBases,guardRailGeometry} from './guardLayout'
import {jumpFenceRuns} from './jumpFencePlan'
function beam(b:PropBuilder,color:string,a:number[],z:number[],width:number,depth:number){const p=new Vector3(...a),q=new Vector3(...z),d=q.clone().sub(p),g=new BoxGeometry(width,d.length(),depth);g.applyMatrix4(new Matrix4().compose(p.add(q).multiplyScalar(.5),new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()),new Vector3(1,1,1)));b.add('stone',g,color)}

export function createHillGuardArt(){const b=new PropBuilder([5,3]);for(const w of summitWalls)beam(b,'#c3beab',[w.a[0]-w.nx*.22,22.12,w.a[1]-w.nz*.22],[w.b[0]-w.nx*.22,22.12,w.b[1]-w.nz*.22],.2,.46)
 for(const [i,p]of guardPosts.entries()){b.box('stone','#b8b3a1',[p[0]!,p[1]!,p[2]!],[.22,.22,.22]);const bottom=p[1]!+.04,top=Math.max(bottom+.7,guardPostRailBases[i]!+1.33);b.box('wood','#6e6246',[p[0]!,(bottom+top)/2,p[2]!],[.13,top-bottom,.13])}
 for(const h of[.7,1.25])b.add('wood',guardRailGeometry(guardRuns,h),'#8d7d58')
 return b.finish()}
export function createJumpFenceArt(){const b=new PropBuilder();for(const run of jumpFenceRuns){let travelled=2;for(let i=0;i<run.length;i++){const p=run[i]!;if(i)travelled+=Math.hypot(p[0]-run[i-1]![0],p[2]-run[i-1]![2]);if(travelled>=1.8||i===run.length-1){b.box('wood','#6e6246',[p[0],p[1]+.65,p[2]],[.14,1.3,.14]);travelled=0}}}for(const h of[.65,1.15])b.add('wood',guardRailGeometry(jumpFenceRuns,h),'#8d7d58');return b.finish()}
