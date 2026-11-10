import {Quaternion,Euler,Vector3} from 'three'
import {buildParkTreeParts,type TreePlanting} from '../world/art/parkTreeParts'
type P=readonly[number,number,number]
type Ball={p:P;r:number}
type Stem={a:P;b:P;r:number}
export function treeEnvelope(tree:TreePlanting){
 const parts=buildParkTreeParts([tree]),balls:Ball[]=[...parts.crowns.map(p=>({p:p.p,r:Math.max(...p.s)})),...parts.cones.map(p=>({p:p.p,r:Math.hypot(Math.max(p.s[0],p.s[2]),p.s[1])}))]
 const stems:Stem[]=parts.wood.map(p=>{const v=new Vector3(0,p.s[1]/2,0).applyQuaternion(new Quaternion().setFromEuler(new Euler(...(p.r??[0,0,0]))));return{a:[p.p[0]-v.x,p.p[1]-v.y,p.p[2]-v.z],b:[p.p[0]+v.x,p.p[1]+v.y,p.p[2]+v.z],r:Math.max(p.s[0],p.s[2])}})
 const radius=Math.max(...balls.map(p=>Math.hypot(p.p[0]-tree.position[0],p.p[2]-tree.position[2])+p.r))
 return {balls,stems,radius,tree}
}
export type TreeEnvelope=ReturnType<typeof treeEnvelope>
const distance=(p:P,a:P,b:P)=>{const d=b.map((v,i)=>v-a[i]!),t=Math.max(0,Math.min(1,d.reduce((s,v,i)=>s+(p[i]!-a[i]!)*v,0)/d.reduce((s,v)=>s+v*v,0)));return Math.hypot(...p.map((v,i)=>v-a[i]!-d[i]!*t))}
export function treesOverlap(a:TreeEnvelope,b:TreeEnvelope,gap=.12){
 if(Math.hypot(a.tree.position[0]-b.tree.position[0],a.tree.position[2]-b.tree.position[2])>a.radius+b.radius+gap)return false
 return a.balls.some(p=>b.balls.some(q=>Math.hypot(...p.p.map((v,i)=>v-q.p[i]!))<p.r+q.r+gap)||b.stems.some(q=>distance(p.p,q.a,q.b)<p.r+q.r+gap))||b.balls.some(p=>a.stems.some(q=>distance(p.p,q.a,q.b)<p.r+q.r+gap))
}
