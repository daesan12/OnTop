import { ExtrudeGeometry,Shape,RingGeometry } from 'three'
import { PropBuilder,hipRoof } from '../world/art/propGeometry'
import { SITES,VR_STONE_SETS,EVENT_BENCHES } from './layout'

const gate=new PropBuilder([12,8])
// A single narrow doorway with solid stone wings meeting the continuous park wall.
for(const x of [-2.6,2.6]) {
  gate.cylinder('stone','#b7b2a4',[x,.16,90],.46,.5,.32,[0,0,0],8)
  gate.cylinder('paint','#8f5037',[x,2.08,90],.24,.3,3.85,[0,0,0],16)
  gate.box('paint','#45614b',[x,3.89,90],[.9,.24,.8])
  for(const side of [-1,1])gate.box('wood','#8c6541',[x+side*.32,4.04,90],[1.05,.18,.62],[0,0,side*.2])
}
for(const side of [-1,1]) {
  gate.box('glow','#ffcd8c',[side*2.65,3.35,91.25],[.35,.46,.35])
  gate.box('tile','#40554c',[side*2.65,3.65,91.25],[.56,.12,.6])
  // Timber doors are held open against the stone piers, leaving the centre unobstructed.
  gate.box('wood','#69472d',[side*2.55,1.75,89.3],[.14,3.1,1.5],[0,side*.16,0])
}
gate.box('paint','#42614d',[0,4.08,90],[6.8,.32,1])
gate.box('wood','#986d47',[0,4.32,90],[7.5,.18,1.4])
const gateRoof=new PropBuilder([12,8]);hipRoof(gateRoof,9.2,4.8,4.42,1.35)
for(const kind of Object.keys(gateRoof.parts) as Array<keyof typeof gateRoof.parts>)for(const geometry of gateRoof.parts[kind]){geometry.translate(0,0,90);gate.parts[kind].push(geometry)}


export const mainGateArt=gate.finish()

const grove=new PropBuilder([10,7])
// A small elliptical cart apron joins the southern side of the single woodland loop.
const apron=new Shape();apron.moveTo(-2.5,-2.7);apron.lineTo(2.5,-2.7);apron.quadraticCurveTo(3.3,-2.7,3.3,-1.9);apron.lineTo(3.3,1.9);apron.quadraticCurveTo(3.3,2.7,2.5,2.7);apron.lineTo(-2.5,2.7);apron.quadraticCurveTo(-3.3,2.7,-3.3,1.9);apron.lineTo(-3.3,-1.9);apron.quadraticCurveTo(-3.3,-2.7,-2.5,-2.7)
const apronGeometry=new ExtrudeGeometry(apron,{depth:.1,bevelEnabled:false,curveSegments:40});apronGeometry.rotateX(-Math.PI/2)
grove.add('stone',apronGeometry,'#c8bda5',[SITES.cart.x,.005,SITES.cart.z])
for(const {x:bx,z:bz,side} of EVENT_BENCHES) {
  for(const dx of [-1,1])grove.box('metal','#48584a',[bx+dx,.3,bz],[.15,.6,.7])
  for(let slat=0;slat<4;slat++)grove.box('wood','#a78b60',[bx,.57,bz-.28+slat*.18],[2.8,.12,.14])
  grove.box('wood','#96784f',[bx,1,bz-side*.38],[2.8,.65,.12])
}
export const eventGroveArt=grove.finish()

const furniture=new PropBuilder([10,7])
function stoneSlab(cx:number,cy:number,cz:number,width:number,depth:number,height:number) {
  const s=new Shape(),r=.16
  s.moveTo(-width/2+r,-depth/2);s.lineTo(width/2-r,-depth/2);s.quadraticCurveTo(width/2,-depth/2,width/2,-depth/2+r)
  s.lineTo(width/2,depth/2-r);s.quadraticCurveTo(width/2,depth/2,width/2-r,depth/2);s.lineTo(-width/2+r,depth/2)
  s.quadraticCurveTo(-width/2,depth/2,-width/2,depth/2-r);s.lineTo(-width/2,-depth/2+r);s.quadraticCurveTo(-width/2,-depth/2,-width/2+r,-depth/2)
  const g=new ExtrudeGeometry(s,{depth:height-.08,bevelEnabled:true,bevelSize:.04,bevelThickness:.04,bevelSegments:3,curveSegments:6});g.rotateX(-Math.PI/2)
  furniture.add('stone',g,'#bebcae',[cx,cy-height/2+.04,cz])
}
for(const set of VR_STONE_SETS) {
  stoneSlab(set.x,.95,set.z,2.4,1.5,.24)
  for(const side of [-1,1]) {
    stoneSlab(set.x+side*.72,.43,set.z,.38,.9,.8)
    const cz=set.z+side*1.8
    stoneSlab(set.x,.49,cz,1.05,.85,.22)
    stoneSlab(set.x,.21,cz,.65,.55,.38)
    stoneSlab(set.x,.88,cz+side*.37,1.05,.15,.65)
  }
  furniture.add('stone',new RingGeometry(.28,.31,32),'#8d9489',[set.x,1.078,set.z],[1,1,1],[-Math.PI/2,0,0])
}
export const vrStoneFurnitureArt=furniture.finish()
