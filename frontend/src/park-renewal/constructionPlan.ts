import {SITES,NODES,ENTRANCE_PATHS,heightAt,type Point} from './plan'
import {underConstruction,CONSTRUCTION_MESSAGE} from './constructionStatus'
export const constructionEntries=SITES.filter(s=>underConstruction(s.id)).map(s=>{
 const n=NODES[s.node]!,dx=n[0]-s.x,dz=n[1]-s.z,d=Math.hypot(dx,dz)||1,r=s.asset==='pair'?2.8:s.id==='balloon'?17.5:5
 const point:Point=ENTRANCE_PATHS.find(p=>p.id===s.id)?.b??[s.x+dx/d*r,s.z+dz/d*r]
 return{id:s.id,label:s.name,message:CONSTRUCTION_MESSAGE,reachPosition:[point[0],heightAt(...point)+.8,point[1]]as const,radius:3.5,heightTolerance:1.5}
})
export const nearestConstruction=(p:{x:number;y:number;z:number})=>constructionEntries.filter(s=>Math.abs(p.y-s.reachPosition[1])<s.heightTolerance&&Math.hypot(p.x-s.reachPosition[0],p.z-s.reachPosition[2])<s.radius).sort((a,b)=>Math.hypot(p.x-a.reachPosition[0],p.z-a.reachPosition[2])-Math.hypot(p.x-b.reachPosition[0],p.z-b.reachPosition[2]))[0]
