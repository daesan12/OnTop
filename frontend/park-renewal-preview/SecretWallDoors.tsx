import {HORROR_PORTALS} from './horrorPlan'
import {ParkStoneMaterial} from './ParkStoneMaterial'
import {SUMMIT_WALL_FACE_OFFSET} from './summitWalls'

const edgeOverlap=.002

export function SecretWallDoors(){
 return <>{HORROR_PORTALS.map(({id,x,z,floor,width,height,outward})=>
  <mesh
   key={id}
   name={'secret-wall-door-'+id}
   position={[x+outward*(SUMMIT_WALL_FACE_OFFSET+edgeOverlap),floor+height/2,z]}
   rotation={[0,outward*Math.PI/2,0]}
   userData={{keepOpaque:true}}
  >
   <planeGeometry args={[width+2*edgeOverlap,height+2*edgeOverlap]}/>
   <ParkStoneMaterial large twoSided/>
  </mesh>,
 )}</>
}
