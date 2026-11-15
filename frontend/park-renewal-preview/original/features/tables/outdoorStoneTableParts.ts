import {GOMOKU,TABLE_SEATS} from '../../../../src/config/index.ts'
import type {Part} from '../../../../src/world/art/Instances.tsx'
/** Canonical dev plaza table: preserve its 1.06 m top and original bench anchors. */
export function outdoorStoneTableParts(seatCount=4){
 const stone:Part[]=[{p:[0,.99,0],s:[2.1,.14,1.6],c:'#c7c6b9'}],supports:Part[]=[]
 for(const x of[-.7,.7])supports.push({p:[x,.46,0],s:[.28,.92,1.15],c:'#545e57'})
 for(const z of GOMOKU.seatZ){stone.push({p:[0,.48,z],s:[2.1,.16,.52],c:'#c3c3b7'});for(const x of[-.7,.7])supports.push({p:[x,.2,z],s:[.28,.4,.43],c:'#545e57'})}
 for(const {x,z}of TABLE_SEATS.slice(2,seatCount)){stone.push({p:[x,.48,z],s:[.52,.16,.85],c:'#c3c3b7'});supports.push({p:[x,.2,z],s:[.32,.4,.6],c:'#545e57'})}
 return {stone,supports}
}
