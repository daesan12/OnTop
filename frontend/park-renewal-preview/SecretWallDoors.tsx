import {useSyncExternalStore} from 'react'
import {horrorState,HORROR_PORTALS,subscribeHorror} from './horrorPlan'
import {ParkStoneMaterial} from './ParkStoneMaterial'
import {SUMMIT_WALL_FACE_OFFSET} from './summitWalls'

const isOpen=()=>horrorState.open
const edgeOverlap=.002

export function SecretWallDoors(){
 const open=useSyncExternalStore(subscribeHorror,isOpen)
 if(open)return null

 return <>{HORROR_PORTALS.map(({id,x,z,floor,width,height,outward})=>
  <mesh
   key={id}
   name={'secret-wall-door-'+id}
   position={[x+outward*(SUMMIT_WALL_FACE_OFFSET+edgeOverlap),floor+height/2,z]}
   rotation={[0,outward*Math.PI/2,0]}
  >
   <planeGeometry args={[width+2*edgeOverlap,height+2*edgeOverlap]}/>
   <ParkStoneMaterial large/>
  </mesh>,
 )}</>
}
