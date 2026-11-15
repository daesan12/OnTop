import {BufferGeometry,Float32BufferAttribute} from 'three'
import {MONUMENT_STAIRS as s,forestHeightAt} from './plan.ts'
import { MONUMENT_STAIR_CHEEK_WIDTH, MONUMENT_TREAD_OFFSET } from './monumentStairPlan.ts'
/** Solid masonry cheeks support every outer rail post, down to the actual terrain. */
export function createStairCheeks(){
 const p:number[]=[],quad=(a:number[],b:number[],c:number[],d:number[])=>p.push(...a,...b,...c,...a,...c,...d)
 const length=s.zBottom-s.zTop,rise=s.top-s.bottom
 for(const side of[-1,1]){
  const outer=side*(s.width/2+MONUMENT_STAIR_CHEEK_WIDTH),inner=side*s.width/2
  const left=Math.min(outer,inner),right=Math.max(outer,inner)
  for(let i=0;i<s.steps;i++){
   const z0=i*length/s.steps,z1=(i+1)*length/s.steps
   const top=rise*(s.steps-i)/s.steps+MONUMENT_TREAD_OFFSET
   const bottom=(x:number,z:number)=>Math.min(top-.1,forestHeightAt(s.x+x,s.zTop+z)-s.bottom-.22)
   const leftNear=bottom(left,z0),leftFar=bottom(left,z1)
   const rightNear=bottom(right,z0),rightFar=bottom(right,z1)
   quad([left,top,z0],[left,top,z1],[right,top,z1],[right,top,z0])
   quad([left,leftNear,z0],[left,leftFar,z1],[left,top,z1],[left,top,z0])
   quad([right,rightFar,z1],[right,rightNear,z0],[right,top,z0],[right,top,z1])
   const next=i+1<s.steps?rise*(s.steps-i-1)/s.steps+MONUMENT_TREAD_OFFSET:undefined
   quad([left,next??leftFar,z1],[right,next??rightFar,z1],[right,top,z1],[left,top,z1])
   if(i===0)quad([right,rightNear,z0],[left,leftNear,z0],[left,top,z0],[right,top,z0])
  }
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(p,3));geometry.computeVertexNormals();geometry.computeBoundingBox();return geometry
}
export const stairCheeks=createStairCheeks()
export function stairTreadAt(z:number){const length=s.zBottom-s.zTop,rise=s.top-s.bottom;return rise*(s.steps-Math.min(s.steps-1,Math.max(0,Math.floor(Math.max(0,z)/length*s.steps-1e-6))))/s.steps}
export const stairRailAnchors=Array.from({length:21},(_,i)=>{const length=s.zBottom-s.zTop,tread=length/s.steps,z=Math.min(length-tread/2,(Math.floor(i/20*s.steps)+.5)*tread);return{z,y:stairTreadAt(z)+MONUMENT_TREAD_OFFSET}})
