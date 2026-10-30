import { PAVILION_LANTERN,PILLARS } from '../../config'
import type { Part } from './Instances'
export interface LanternPavilion {id:string;x:number;z:number;floor:number;scale:number}
export function pavilionLanternLayout(pavilions:readonly LanternPavilion[]) {
  const placements:Part[]=pavilions.map(p=>({p:[p.x,p.floor+PAVILION_LANTERN.heightFactor*p.scale,p.z],s:[1,1,1],c:'#ffffff'}))
  const ceiling=pavilions.map(p=>p.floor+4.12*p.scale)
  const main=pavilions.find(p=>p.id==='P0')
  if(main)for(let i=0;i<8;i+=2){const p=PILLARS[i]!;placements.push({p:[main.x+p[0]*1.12*main.scale,main.floor+2.9*main.scale,main.z+(p[2]+3)*1.12*main.scale],s:[.9,.9,.9],c:'#ffffff'});ceiling.push(main.floor+3.72*main.scale)}
  const chainLinks:Part[]=[],chainCaps:Part[]=[],simpleChains:Part[]=[]
  placements.forEach((p,i)=>{
    const start=p.p[1]+.96*p.s[1],end=ceiling[i]!,length=end-start,count=Math.max(1,Math.ceil(length/.06))
    if(length>0)simpleChains.push({p:[p.p[0],(start+end)/2,p.p[2]],s:[.022,length,.022],c:'#bb9253'})
    for(let j=0;j<count;j++)chainLinks.push({p:[p.p[0],start+(j+.5)*length/count,p.p[2]],s:[1,1,1],r:[0,j%2?Math.PI/2:0,0],c:'#bb9253'})
    chainCaps.push({p:[p.p[0],end,p.p[2]],s:[1,1,1],c:'#bb9253'})
  })
  return {placements,chainLinks,chainCaps,simpleChains}
}
