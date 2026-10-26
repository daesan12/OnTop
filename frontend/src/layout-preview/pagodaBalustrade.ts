import { BoxGeometry,Matrix4,Vector3 } from 'three'
import { PropBuilder } from '../world/art/propGeometry'
import { CENTRAL_RAIL_RUNS,STAIR_RAIL_RUNS,SETTINGS,SITES } from './layout'

export function stairRailFrame(dx:number,dz:number,rise:number){
  const along=new Vector3(dx,-rise,dz).normalize(),across=new Vector3(dz,0,-dx).normalize(),up=new Vector3().crossVectors(along,across).normalize()
  return new Matrix4().makeBasis(across,up,along)
}
export const stairSupportSites:Array<{x:number;z:number;bottom:number}>=[]
const stone=new PropBuilder([12,8]),floor=SITES.pagoda.floor
const posts=new Map<string,[number,number]>()
for(const run of CENTRAL_RAIL_RUNS) {
  const dx=run.to[0]-run.from[0],dz=run.to[1]-run.from[1],length=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz)
  const x=(run.from[0]+run.to[0])/2,z=(run.from[1]+run.to[1])/2
  stone.box('stone','#b7b3a4',[x,floor+.11,z],[.5,.22,length],[0,yaw,0])
  stone.box('stone','#d0cbbd',[x,floor+1.08,z],[.46,.19,length],[0,yaw,0])
  stone.box('stone','#c0bcae',[x,floor+.94,z],[.32,.1,length],[0,yaw,0])
  const count=Math.ceil(length/.85)
  for(let i=0;i<=count;i++) {
    const px=run.from[0]+dx*i/count,pz=run.from[1]+dz*i/count
    if(i===0||i===count){posts.set(`${px},${pz}`,[px,pz]);continue}
    stone.lathe('stone','#c5c0b1',[px,floor+.22,pz],[[.19,0],[.21,.08],[.15,.14],[.105,.26],[.14,.34],[.2,.39],[.2,.46],[.14,.51],[.105,.6],[.16,.68],[.2,.72]])
    for(let flute=0;flute<8;flute++) {
      const a=flute*Math.PI/4
      stone.box('stone','#a9a697',[px+Math.cos(a)*.15,floor+.55,pz+Math.sin(a)*.15],[.018,.13,.018])
    }
  }
}
for(const [x,z] of posts.values()) {
  stone.box('stone','#bbb7a9',[x,floor+.65,z],[.44,1.3,.44])
  stone.box('stone','#d0cabb',[x,floor+1.3,z],[.56,.16,.56])
  stone.lathe('stone','#bcb7a8',[x,floor+1.38,z],[[.23,0],[.24,.08],[.16,.16],[.13,.27],[.06,.35],[0,.38]])
  // Small carved guardian-like finial; restrained to the handrail scale in the reference.
  stone.ball('stone','#b7b2a4',[x,floor+1.56,z],[.17,.18,.19])
  stone.ball('stone','#c3beaf',[x,floor+1.67,z-.08],[.12,.12,.13])
}
// Sloping handrails continue the terrace balusters down both sides of all four stairways.
for(const run of STAIR_RAIL_RUNS) {
  const dx=run.to[0]-run.from[0],dz=run.to[1]-run.from[1],length=Math.hypot(dx,dz)
  const x=(run.from[0]+run.to[0])/2,z=(run.from[1]+run.to[1])/2
  for(const [offset,width,h] of [[1.08,.46,.19],[.94,.32,.1]] as const)
    stone.add('stone',new BoxGeometry(width,h,Math.hypot(length,floor)).applyMatrix4(stairRailFrame(dx,dz,floor)),'#c9c4b5',[x,floor/2+offset,z])
  // Ten stepped foundations fill the space under each baluster and bond to the stair tread.
  for(let n=0;n<SETTINGS.pagoda.steps;n++) {
    const r=SETTINGS.pagoda.terraceHalf+SETTINGS.pagoda.tread/2+n*SETTINGS.pagoda.tread,t=(r-SETTINGS.pagoda.terraceHalf)/length,px=run.from[0]+dx*t,pz=run.from[1]+dz*t,h=(SETTINGS.pagoda.steps-n)*SETTINGS.pagoda.riser
    stone.box('stone','#bcb7a8',[px,h+.09,pz],[Math.abs(dx)>.1?.42:.48,.18,Math.abs(dz)>.1?.42:.48])
  }
  for(let i=1;i<=6;i++) {
    const t=i/6,px=run.from[0]+dx*t,pz=run.from[1]+dz*t,y=floor*(1-t)
    if(i===6){stairSupportSites.push({x:px,z:pz,bottom:0});stone.box('stone','#bbb7a9',[px,y+.65,pz],[.44,1.3,.44]);stone.box('stone','#d0cabb',[px,y+1.3,pz],[.56,.16,.56]);stone.ball('stone','#bcb7a8',[px,y+1.48,pz],[.2,.19,.2])}
    else {
      const step=Math.max(0,Math.min(floor,Math.ceil((SETTINGS.pagoda.terraceHalf+SETTINGS.pagoda.steps*SETTINGS.pagoda.tread-(SETTINGS.pagoda.terraceHalf+length*t))/SETTINGS.pagoda.tread)*SETTINGS.pagoda.riser)),height=y+1.03-step
      stairSupportSites.push({x:px,z:pz,bottom:step})
      stone.box('stone','#bab5a6',[px,step+.06,pz],[.4,.12,.4])
      stone.lathe('stone','#c5c0b1',[px,step+.12,pz],[[.2,0],[.2,.12],[.13,.22],[.11,.4],[.2,.49],[.2,.59],[.12,.7],[.14,.82],[.2,.9]].map(([r,h])=>[r!,h!*(height-.12)/.9]))
    }
  }
}
export const pagodaBalustradeArt=stone.finish()
