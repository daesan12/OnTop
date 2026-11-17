import {DoubleSide} from 'three'
import {stoneSurface} from './horrorSurface'
/** Opaque world-metre masonry; no downloaded texture or alpha/camera fading. Damp, mossy and hazed (horrorSurface). */
export function HorrorStoneMaterial({color}:{color?:string}={}){
 // Plain primitives carry no colour attribute: give them a colour instead (a missing attribute reads as black).
 return <meshStandardMaterial vertexColors={!color} color={color??'#ffffff'} side={DoubleSide} transparent={false} depthWrite roughness={.93} metalness={0}
  onBeforeCompile={stoneSurface} customProgramCacheKey={()=>'local-horror-stone-v2'}/>
}
