import { PropBuilder,hipRoof } from '../world/art/propGeometry'
import { MAIN_GATE,EVENT_BENCHES } from './layout'

const gate=new PropBuilder([12,8])
// A single narrow doorway with solid stone wings meeting the continuous park wall.
for(const x of [-MAIN_GATE.postX,MAIN_GATE.postX]) {
  gate.cylinder('stone','#b7b2a4',[x,.16,MAIN_GATE.z],.46,.5,.32,[0,0,0],8)
  gate.cylinder('paint','#8f5037',[x,2.08,MAIN_GATE.z],.24,.3,3.85,[0,0,0],16)
  gate.box('paint','#45614b',[x,3.89,MAIN_GATE.z],[.9,.24,.8])
  for(const side of [-1,1])gate.box('wood','#8c6541',[x+side*.32,4.04,MAIN_GATE.z],[1.05,.18,.62],[0,0,side*.2])
}
for(const side of [-1,1]) {
  gate.box('glow','#ffcd8c',[side*(MAIN_GATE.postX+.05),3.35,MAIN_GATE.z+1.25],[.35,.46,.35])
  gate.box('tile','#40554c',[side*2.65,3.65,MAIN_GATE.z+1.25],[.56,.12,.6])
  // Timber doors are held open against the stone piers, leaving the centre unobstructed.
  gate.box('wood','#69472d',[side*(MAIN_GATE.postX-.05),1.75,MAIN_GATE.z-.7],[.14,3.1,1.5],[0,side*.16,0])
}
gate.box('paint','#42614d',[0,4.08,MAIN_GATE.z],[MAIN_GATE.opening+1.6,.32,1])
gate.box('wood','#986d47',[0,4.32,MAIN_GATE.z],[MAIN_GATE.opening+2.3,.18,1.4])
const gateRoof=new PropBuilder([12,8]);hipRoof(gateRoof,MAIN_GATE.opening+4,4.8,4.42,1.35)
for(const kind of Object.keys(gateRoof.parts) as Array<keyof typeof gateRoof.parts>)for(const geometry of gateRoof.parts[kind]){geometry.translate(0,0,MAIN_GATE.z);gate.parts[kind].push(geometry)}


export const mainGateArt=gate.finish()

const grove=new PropBuilder([10,7])
// The cart apron is part of the same unioned paving as its approach.
for(const {x:bx,z:bz,side} of EVENT_BENCHES) {
  for(const dx of [-1,1])grove.box('metal','#48584a',[bx+dx,.3,bz],[.15,.6,.7])
  for(let slat=0;slat<4;slat++)grove.box('wood','#a78b60',[bx,.57,bz-.28+slat*.18],[2.8,.12,.14])
  grove.box('wood','#96784f',[bx,1,bz-side*.38],[2.8,.65,.12])
}
export const eventGroveArt=grove.finish()
