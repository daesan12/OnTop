import { PILLARS } from '../../config'
import type { Part } from './Instances'
import { pavilionCeilingBottom, pavilionLanternY } from './pavilionCanopy'
export interface LanternPavilion {id:string;x:number;z:number;floor:number;scale:number}
export function pavilionLanternLayout(pavilions:readonly LanternPavilion[]) {
  const placements:Part[]=pavilions.map(p=>({p:[p.x,pavilionLanternY(p),p.z],s:[1,1,1],c:'#ffffff'}))
  const ceiling=pavilions.map(p=>p.floor+pavilionCeilingBottom*p.scale)
  const main=pavilions.find(p=>p.id==='P0')
  // Keep the four smaller lanterns inside the ceiling and clear of the pillars.
  if(main)for(let i=0;i<8;i+=2){const p=PILLARS[i]!;placements.push({p:[main.x+p[0]*.84*main.scale,pavilionLanternY(main,.9),main.z+(p[2]+3)*.84*main.scale],s:[.9,.9,.9],c:'#ffffff'});ceiling.push(main.floor+pavilionCeilingBottom*main.scale)}
  const chainLinks:Part[]=[],chainCaps:Part[]=[],simpleChains:Part[]=[]
  placements.forEach((p,i)=>{
    // Continue through the eye's empty centre into the finial (top .91),
    // rather than ending at the eye centre (.936) and leaving a visible gap.
    const start=p.p[1]+.895*p.s[1],end=ceiling[i]!,length=end-start,count=Math.max(1,Math.ceil(length/.06))
    if(length>0)simpleChains.push({p:[p.p[0],(start+end)/2,p.p[2]],s:[.022,length,.022],c:'#bb9253'})
    for(let j=0;j<count;j++)chainLinks.push({p:[p.p[0],start+(j+.5)*length/count,p.p[2]],s:[1,1,1],r:[0,j%2?Math.PI/2:0,0],c:'#bb9253'})
    chainCaps.push({p:[p.p[0],end,p.p[2]],s:[1,1,1],c:'#bb9253'})
  })
  return {placements,chainLinks,chainCaps,simpleChains}
}
