import { FITNESS, type FitnessStation } from '../../config/fitness'
import { TELESCOPES, TELESCOPE } from '../../config/telescopes'
import { FOUNTAIN_BENCH_SITES } from '../../config/plazaGarden'
import { FOUNTAIN, TOWER_SITE, PARK_PAVILIONS, PAVILION_CLOSED_SIDES, pavilionBenchRadius, pavilionBenchHalfWidth } from '../../config/parkPlan'
import { BENCHES } from '../../config/world'
import { NOTES_BOX } from '../../config/notes'
import type { ParkDefinition } from './definition'

export type Point3 = readonly [number,number,number]
export type MapPose = {x:number;y:number;z:number;yaw:number}
export type BenchSite = {id:string;siteId:string;x:number;y:number;z:number;yaw:number;halfWidth:number;seatHeight:number;exitDistance:number}
type FlatBench = {id:string;x:number;z:number;yaw:number}
interface Input {
  definition:ParkDefinition
  pavilions:readonly {id:string;x:number;z:number;floor:number;scale:number}[]
  towerBenches:readonly {id:string;x:number;y:number;z:number;yaw:number}[]
  plazaBenches:readonly FlatBench[]
  restBenches:readonly FlatBench[]
  fitness:readonly FitnessStation[]
  decks:readonly {id:string;x:number;z:number;wood:boolean}[]
}
const at=(x:number,y:number,z:number,yaw:number):MapPose=>({x,y,z,yaw})
/** IDs describe the physical site, not its order in an exported array or a DB tableId. */
export function buildInteractionData(i:Input) {
  const d=i.definition,benchSites:BenchSite[]=[]
  const add=(b:FlatBench,y:number,halfWidth=1.4,seatHeight=.56,exitDistance=1.5,original?:Point3)=>{
    const legacy=original?BENCHES.findIndex(p=>p.every((v,n)=>Math.abs(v-original[n]!)<1e-6)):-1
    if(original&&legacy<0)throw new Error(`Missing original bench identity: ${b.id}`)
    benchSites.push({...b,id:legacy<0?b.id:'bench-'+legacy,siteId:b.id,y,halfWidth,seatHeight,exitDistance})
  }
  for(const p of i.pavilions)for(const side of PAVILION_CLOSED_SIDES) {
    const a=(side+1)*Math.PI/4,r=pavilionBenchRadius(p.scale)
    const old=PARK_PAVILIONS.find(o=>o.id===p.id)!
    add({id:`bench-${p.id}-bay-${side}`,x:p.x+Math.cos(a)*r,z:p.z+Math.sin(a)*r,yaw:-Math.PI/2-a},p.floor,pavilionBenchHalfWidth(p.scale),.56,1.1,[old.x+Math.cos(a)*r,old.floor,old.z+Math.sin(a)*r])
  }
  for(const b of i.towerBenches)add(b,b.y,1.4,.56,1.5,[b.x-d.sites.tower.x+TOWER_SITE.x,b.y,b.z-d.sites.tower.z+TOWER_SITE.z])
  for(const b of [...i.plazaBenches,...i.restBenches])add(b,.14)
  for(const b of d.event.benches)add({id:`bench-event-${b.side<0?'west':'east'}`,x:b.x,z:b.z,yaw:b.side<0?Math.PI:0},0,1.4,.57)
  for(const [index,b] of FOUNTAIN_BENCH_SITES.entries()) {
    const x=d.sites.fountain.x+(b.x-FOUNTAIN.x)*d.fountain.scale,z=d.sites.fountain.z+(b.z-FOUNTAIN.z)*d.fountain.scale
    // ParkFountain scales its furniture horizontally with the fountain group.
    add({id:`bench-fountain-${[1,3,5,7][index]}`,x,z,yaw:b.yaw},b.y,1.4*d.fountain.scale,.56,1.5,[b.x,b.y,b.z])
  }
  for(const deck of i.decks)add({id:deck.id+'-bench',x:deck.x-(deck.wood?1:-1)*.7,z:deck.z-2.15,yaw:0},.32,1.15,.46)
  for(const bench of d.forestBenches)add(bench,0)
  // Explicit quadrant/seat identity survives adding or reordering other benches.
  for(const quadrant of [0,1,2,3]) {
    const a=quadrant*Math.PI/2+Math.PI/4
    add({id:`bench-fitness-ring-${quadrant}`,x:d.sites.fitness.x+Math.cos(a)*2.95,z:d.sites.fitness.z-Math.sin(a)*2.95,yaw:Math.PI/2+a},0,1.4,.62,1.4)
  }
  const benches=benchSites.map(b=>({
    id:b.id,siteId:b.siteId,kind:'BENCH' as const,position:[b.x,b.y,b.z] as Point3,yaw:b.yaw,radius:3,heightTolerance:.7,
    // Preserve the service's seating pose convention (ground + 0.8), not the visual seat height.
    seats:[0,1].map(seatIndex=>{
      const offset=(seatIndex?1:-1)*Math.min(.65,b.halfWidth*.55),ring=b.id.startsWith('bench-fitness-ring-')
      const a=b.yaw-Math.PI/2+(seatIndex?1:-1)*(Math.PI/2-.4)*.2,yaw=ring?Math.PI/2+a:b.yaw
      const x=ring?d.sites.fitness.x+Math.cos(a)*2.95:b.x+Math.cos(b.yaw)*offset+Math.sin(b.yaw)*.07
      const z=ring?d.sites.fitness.z-Math.sin(a)*2.95:b.z-Math.sin(b.yaw)*offset+Math.cos(b.yaw)*.07
      return {seatIndex,use:at(x,b.y+.8,z,yaw),
        exit:at(b.x+Math.sin(b.yaw)*b.exitDistance,b.y+.8,b.z+Math.cos(b.yaw)*b.exitDistance,b.yaw)}
    }),
  }))
  const fitness=i.fitness.map(s=>({id:s.id,kind:'FITNESS' as const,position:s.position,yaw:s.yaw,radius:FITNESS.interactionRadius,heightTolerance:.7,
    use:at(s.position[0],s.position[1]+s.baseHeight+.8,s.position[2],s.yaw),
    exit:at(s.position[0]-Math.sin(s.yaw)*d.fitness.exitOffset,s.position[1]+FITNESS.padSurfaceHeight+.8,s.position[2]-Math.cos(s.yaw)*d.fitness.exitOffset,s.yaw),
  }))
  const telescopes=TELESCOPES.map(t=>{
    const x=t.position[0]-TOWER_SITE.x+d.sites.tower.x,z=t.position[2]-TOWER_SITE.z+d.sites.tower.z,y=t.position[1]
    const pose=(distance:number)=>at(x-Math.sin(t.yaw)*distance,y+.8,z-Math.cos(t.yaw)*distance,t.yaw)
    return {id:t.id,kind:'TELESCOPE' as const,position:[x,y,z] as Point3,yaw:t.yaw,radius:TELESCOPE.interactionRadius,heightTolerance:.7,use:pose(TELESCOPE.standOffset),exit:pose(TELESCOPE.exitOffset)}
  })
  // NOTES_BOX is attached to the tower model; translate its local offset with the new site.
  const position:Point3=[d.sites.tower.x+NOTES_BOX.x-TOWER_SITE.x,NOTES_BOX.y,d.sites.tower.z+NOTES_BOX.z-TOWER_SITE.z]
  const notes={id:'anonymous-notes',position,
    reachPosition:[position[0],position[1]+.8,position[2]] as Point3,
    radius:NOTES_BOX.interactionRadius,heightTolerance:.7,
    radiusComparison:'less-than-or-equal' as const,heightComparison:'strict-less-than' as const,
    heightReference:'legacy-avatar-origin' as const,
  }
  return {benchSites,benches,fitness,telescopes,notes}
}
