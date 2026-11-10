import {BoxGeometry,Matrix4,Quaternion,Vector3} from 'three'
import {PropBuilder} from '../world/art/propGeometry'
import {PropModel} from '../world/art/PropModel'
import {summitWalls} from './summitWalls'
import {guardRuns,guardPosts,guardPostRailBases,guardRailGeometry} from './guardLayout'
function beam(b:PropBuilder,color:string,a:number[],z:number[],width:number,depth:number){const p=new Vector3(...a),q=new Vector3(...z),d=q.clone().sub(p),g=new BoxGeometry(width,d.length(),depth);g.applyMatrix4(new Matrix4().compose(p.add(q).multiplyScalar(.5),new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()),new Vector3(1,1,1)));b.add('stone',g,color)}
export const hillGuardPostPositions=guardPosts
const art=(()=>{const b=new PropBuilder([5,3]);for(const w of summitWalls)beam(b,'#c3beab',[w.a[0]-w.nx*.22,22.12,w.a[1]-w.nz*.22],[w.b[0]-w.nx*.22,22.12,w.b[1]-w.nz*.22],.2,.46)
 for(const [i,p]of guardPosts.entries()){b.box('stone','#b8b3a1',[p[0]!,p[1]!,p[2]!],[.22,.22,.22]);const bottom=p[1]!+.04,top=Math.max(bottom+.7,guardPostRailBases[i]!+1.33);b.box('wood','#6e6246',[p[0]!,(bottom+top)/2,p[2]!],[.13,top-bottom,.13])}
 for(const h of[.7,1.25])b.add('wood',guardRailGeometry(guardRuns,h),'#8d7d58')
 return b.finish()})()
export function HillsideFinishing(){return <PropModel name="finished-hill-stone-edges-and-timber-guards" art={art}/>}
