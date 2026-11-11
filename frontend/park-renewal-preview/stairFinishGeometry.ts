import {BufferGeometry,Float32BufferAttribute} from 'three'
import {MONUMENT_STAIRS as s,forestHeightAt} from './plan.ts'
/** Solid masonry cheeks support every outer rail post, down to the actual terrain. */
export function createStairCheeks(){
 const p:number[]=[],quad=(a:number[],b:number[],c:number[],d:number[])=>p.push(...a,...c,...b,...a,...d,...c),length=s.zBottom-s.zTop,rise=s.top-s.bottom
 for(const side of[-1,1]){const inner=side*(s.width/2+.01),outer=side*(s.width/2+.46)
  for(let i=0;i<s.steps;i++){const z0=i*length/s.steps,z1=(i+1)*length/s.steps,top=rise*(s.steps-i)/s.steps+.085,bottom=(x:number,z:number)=>Math.min(top-.1,forestHeightAt(s.x+x,s.zTop+z)-s.bottom-.22),a=bottom(outer,z0),b=bottom(outer,z1),c=bottom(inner,z0),d=bottom(inner,z1)
   if(side>0){quad([outer,a,z0],[outer,b,z1],[outer,top,z1],[outer,top,z0]);quad([inner,c,z0],[inner,top,z0],[inner,top,z1],[inner,d,z1])}else{quad([outer,a,z0],[outer,top,z0],[outer,top,z1],[outer,b,z1]);quad([inner,c,z0],[inner,d,z1],[inner,top,z1],[inner,top,z0])}
   if(side>0)quad([inner,top,z0],[outer,top,z0],[outer,top,z1],[inner,top,z1]);else quad([inner,top,z0],[inner,top,z1],[outer,top,z1],[outer,top,z0]);quad([inner,c,z0],[outer,a,z0],[outer,top,z0],[inner,top,z0]);quad([outer,b,z1],[inner,d,z1],[inner,top,z1],[outer,top,z1])
  }
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(p,3));geometry.computeVertexNormals();geometry.computeBoundingBox();return geometry
}
export const stairCheeks=createStairCheeks()
export function stairTreadAt(z:number){const length=s.zBottom-s.zTop,rise=s.top-s.bottom;return rise*(s.steps-Math.min(s.steps-1,Math.max(0,Math.floor(Math.max(0,z)/length*s.steps-1e-6))))/s.steps}
export const stairRailAnchors=Array.from({length:21},(_,i)=>{const length=s.zBottom-s.zTop,tread=length/s.steps,z=Math.min(length-tread/2,(Math.floor(i/20*s.steps)+.5)*tread);return{z,y:stairTreadAt(z)+.085}})
