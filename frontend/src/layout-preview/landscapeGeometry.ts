import { SIMPLE_MAP } from '../world/art/mapRenderProfile'
import { PropBuilder } from '../world/art/propGeometry'
import type { Part } from '../world/art/Instances'
import { SETTINGS,DRAFT_PAVILIONS,DRAFT_FOUNTAIN,PAVILION_COURT,VR_COURT, FENCE_RUNS,ROUND_COURTS, LIFE_PLAZA, PATHS, PERIMETER, SITES,nearSegment } from './layout'
import { buildPathNetwork } from './pathNetwork'
import { cutFountainFromPaving } from './fountainPaving'
const routes=[...PATHS,{id:'perimeter',points:PERIMETER,width:SETTINGS.park.perimeterWidth}]
function courtOrPlaza(x:number,z:number) {
  return Math.hypot((x-SITES.cart.x)/4.4,(z-SITES.cart.z)/3.6)<1
    ||Math.hypot(x-LIFE_PLAZA.x,z-LIFE_PLAZA.z)<LIFE_PLAZA.pavingRadius+.6
    ||DRAFT_PAVILIONS.some(p=>Math.abs(x-p.x)<(p.id==='P0'?14:PAVILION_COURT.width/2+.8)&&Math.abs(z-p.z)<(p.id==='P0'?16.3:PAVILION_COURT.depth/2+.8))
    ||ROUND_COURTS.some(c=>Math.hypot((x-c.x)/(c.rx+.8),(z-c.z)/(c.rz+.8))<1)
    ||Math.abs(x-SITES.pagoda.x)<18&&Math.abs(z-SITES.pagoda.z)<18
    ||Math.abs(x-VR_COURT.x)<VR_COURT.width/2+.5&&Math.abs(z-VR_COURT.z)<VR_COURT.depth/2+.5
    ||Math.hypot((x-SITES.lake.x)/(SITES.lake.rx+1.5),(z-SITES.lake.z)/(SITES.lake.rz+1.5))<1
    ||Math.hypot(x-SITES.fountain.x,z-SITES.fountain.z)<DRAFT_FOUNTAIN.plazaRadius+.7
}
const network=buildPathNetwork(routes)
export const pathPaving=cutFountainFromPaving(network.geometry)
network.geometry.dispose()
export const pathCurbs:Part[]=[]
for(const edge of network.edges)for(let i=1;i<edge.length;i++) {
  const a=edge[i-1]!,b=edge[i]!,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),count=Math.ceil(length/(SIMPLE_MAP?3:.75))
  for(let n=0;n<count;n++) {
    const t=(n+.5)/count,x=a[0]+dx*t,z=a[1]+dz*t
    if(courtOrPlaza(x,z)||routes.some(r=>r.points.slice(1).some((p,k)=>nearSegment(x,z,r.points[k]!,p)<r.width/2-.15)))continue
    pathCurbs.push({p:[x,.13,z],s:[.18,.18,length/count*.95],r:[0,Math.atan2(dx,dz),0],c:'#aaa892'})
  }
}
const fences=new PropBuilder([6,4])
for(const run of FENCE_RUNS) {
  const [x,z]=run.from,dx=run.to[0]-x,dz=run.to[1]-z,length=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz)
  fences.box('stone','#afa58c',[x+dx/2,.1,z+dz/2],[.32,.2,length],[0,yaw,0])
  for(const y of [.38,.95])fences.box('wood','#826b46',[x+dx/2,y,z+dz/2],[.12,.14,length],[0,yaw,0])
  const count=Math.ceil(length/1.9)
  for(let i=0;i<=count;i++) {
    const px=x+dx*i/count,pz=z+dz*i/count
    fences.box('wood','#68553b',[px,.59,pz],[.22,1.18,.22])
    fences.box('tile','#40574a',[px,1.21,pz],[.34,.12,.34])
    if(i<count)for(const fraction of [.33,.67]) {
      fences.box('wood','#a28b5d',[x+dx*(i+fraction)/count,.62,z+dz*(i+fraction)/count],[.075,.6,.075])
    }
  }
}
export const fenceArt=fences.finish()

export { plazaArt } from './plazaGeometry'
