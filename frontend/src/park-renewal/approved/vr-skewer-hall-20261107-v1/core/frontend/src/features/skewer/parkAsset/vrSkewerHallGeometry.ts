import {ExtrudeGeometry,Shape} from 'three'
import {PropBuilder,type XYZ} from '../../../../../../../../../world/art/propGeometry.ts'
import {addVrSkewerRoof} from './vrSkewerRoof'
import {addSkewerDisplay,softBox,tube} from './skewerDisplayGeometry'
import {addSkewerAFrame,addSkewerFirepit,addVrGoggleEmblem} from './vrSkewerPropGeometry'

export const VR_SKEWER_HALL={width:12.4,depth:8.6,height:4.6,doorWidth:4.2,stations:[-3.4,0,3.4]} as const
const wood='#98613b',dark='#6f4933',cream='#e9dcc0'
export function addVrHeadset(body:PropBuilder,neon:PropBuilder,x:number,y:number,z:number,scale=1){
 softBox(body,'#28233d',[x,y,z],[1.17*scale,.65*scale,.48*scale],.17*scale)
 const p:XYZ[]=[[-.49,.17,0],[-.36,.26,0],[.34,.26,0],[.49,.15,0],[.49,-.14,0],[.3,-.24,0],[.13,-.22,0],[0,-.09,0],[-.14,-.22,0],[-.36,-.23,0],[-.49,-.12,0],[-.49,.17,0]]
 tube(neon,'#bca0ff',p.map(v=>[x+v[0]*scale,y+v[1]*scale,z+.26*scale]),.026*scale)
 for(const side of [-1,1])softBox(body,'#647fbb',[x+side*.63*scale,y,z-.01*scale],[.16*scale,.4*scale,.28*scale],.06*scale)
}
function lantern(b:PropBuilder,x:number){
 const y=3.86,z=4.78
 b.box('glow','#ffd795',[x,y,z],[.52,.8,.5])
 for(const dx of [-.31,.31])for(const dz of [-.29,.29])b.box('wood',dark,[x+dx,y,z+dz],[.09,.95,.09])
 for(const dy of [-.49,.49])b.box('wood',wood,[x,y+dy,z],[.85,.14,.77])
 tube(b,dark,[[x,y+.57,z],[x,4.65,z],[x,4.65,4.05]],.05)
 b.box('wood',wood,[x,4.65,4.02],[.2,.22,.28])
}
function walls(b:PropBuilder,cutaway=false){
 const {width:w,depth:d,height:h,doorWidth:door}=VR_SKEWER_HALL
 b.box('paint',cream,[0,h/2,-d/2],[w,h,.2])
 b.box('paint','#302543',[0,2.35,-d/2+.13],[w-.35,4.15,.04])
 for(const side of [-1,1]){
  const sh=cutaway&&side<0?1:h,fh=cutaway?1:h,span=(w-door)/2
  b.box('paint',cream,[side*w/2,sh/2,0],[.16,sh,d])
  b.box('paint','#40304e',[side*(w/2-.1),sh/2,0],[.035,sh-.1,d-.3])
  b.box('paint',cream,[side*(door/2+span/2),fh/2,d/2],[span,fh,.18])
  for(const z of [-d/2,0,d/2])b.box('wood',wood,[side*(w/2+.08),sh/2,z],[.23,sh,.24])
  for(const y of [.9,Math.min(3.55,sh-.06)])b.box('wood',wood,[side*(w/2+.09),y,0],[.22,.17,d])
  if(!cutaway){
   const x=side*(w/2+.13)
   b.box('wood',dark,[x,2.42,-.4],[.2,2.3,2.8]);b.box('glow','#e5bf80',[x+side*.12,2.42,-.4],[.05,1.98,2.5])
   for(const dz of [-.95,-.48,0,.48,.95])b.box('wood',wood,[x+side*.17,2.42,-.4+dz],[.08,2.05,.07])
   for(const dy of [-.6,0,.6])b.box('wood',wood,[x+side*.17,2.42+dy,-.4],[.08,.07,2.55])
   for(const z of [-d/2,d/2])if(!(side<0&&z>0))b.box('wood',wood,[side*(w/2+door/2)/2,h/2,z],[.25,h,.28])
   lantern(b,side*5.45)
  }
  for(let z=-3.8;z<4.3;z+=.8)b.box('stone',z>0?'#bcb7aa':'#a9a69e',[side*(w/2+.1),.26,z],[.32,.43,.75])
 }
 for(let x=-5.8;x<6;x+=.8)for(const z of [-4.38,4.4])if(z<0||Math.abs(x)>2.6)b.box('stone','#b5b0a6',[x,.26,z],[.76,.43,.3])
 for(const x of [-6,-2.2,2.2,6])b.box('wood',wood,[x,cutaway?.5:2.3,4.4],[.28,cutaway?1:4.6,.3])
}
function gable(b:PropBuilder,neon:PropBuilder){
 const starts=Object.fromEntries(Object.entries(b.parts).map(([k,v])=>[k,v.length])),neonStarts=Object.fromEntries(Object.entries(neon.parts).map(([k,v])=>[k,v.length]))
 const face=new Shape();face.moveTo(-2.6,4.45);face.lineTo(2.6,4.45);face.lineTo(2.6,5);face.lineTo(0,6.5);face.lineTo(-2.6,5);face.closePath()
 b.add('wood',new ExtrudeGeometry(face,{depth:.16,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:2}),wood,[0,0,4.5])
 const height=(x:number)=>4.93+1.55*(1-Math.abs(x)/2.8)**1.3+.2*(Math.abs(x)/2.8)**6
 for(let z=3.15;z<=4.95;z+=.45)for(const side of [-1,1])tube(b,'#55515e',Array.from({length:17},(_,i)=>{const x=side*2.8*i/16;return [x,height(x),z]}),.18)
 for(const side of [-1,1])tube(b,'#bf915d',Array.from({length:17},(_,i)=>{const x=side*2.8*i/16;return [x,height(x)-.18,5.04]}),.13)
 softBox(b,'#66412e',[0,5.3,4.8],[2.7,1.3,.25],.25)
 b.box('wood','#875837',[0,4.41,4.75],[3.95,.56,.25])
 addVrGoggleEmblem(b,neon)
 for(const [k,parts]of Object.entries(b.parts))for(const g of parts.slice(starts[k]))g.translate(0,0,.45)
 for(const [k,parts]of Object.entries(neon.parts))for(const g of parts.slice(neonStarts[k]))g.translate(0,0,.45)
}
export function buildVrSkewerHall(){
 const body=new PropBuilder(),full=new PropBuilder(),cut=new PropBuilder(),roof=new PropBuilder(),neon=new PropBuilder(),roofNeon=new PropBuilder()
 body.box('stone','#c0b6a2',[0,.08,0],[13.2,.16,9.3])
 body.box('paint','#33263f',[0,.17,0],[12.15,.04,8.4])
 for(let x=-5.5;x<6;x++)for(let z=-3.5;z<4;z++)body.box('paint',(x+z)%2?'#403047':'#4b3650',[x,.197,z],[.97,.014,.97])
 for(const x of [-6.2,6.2])body.box('wood',dark,[x,4.52,0],[.26,.24,8.8])
 for(const z of [-4.3,4.3])body.box('wood',wood,[0,4.52,z],[12.6,.26,.3])
 for(const x of [-2.2,2.2])body.box('wood',wood,[x,1.98,4.42],[.25,3.96,.3])
 body.box('wood',wood,[0,3.94,4.42],[4.7,.25,.34])
 for(const side of [-1,1])tube(neon,'#bf8dff',[[side*2.04,.23,3.95],[side*2.04,3.65,3.95],[side*1.76,3.88,3.95]],.035)
 tube(neon,'#b688ff',[[-1.76,3.88,3.95],[0,3.88,3.95],[1.76,3.88,3.95]],.035)
 tube(neon,'#b78cff',[[-5.7,4.15,-4.12],[0,4.15,-4.12],[5.7,4.15,-4.12]],.03)
 tube(neon,'#a88cff',[[6.05,4.15,-4.05],[6.05,4.15,0],[6.05,4.15,4.05]],.03)
 for(const x of VR_SKEWER_HALL.stations){
  softBox(body,'#5b3e39',[x,.7,-2.55],[2.15,1.0,1.13],.1)
  softBox(body,'#a97c5b',[x,1.26,-2.55],[2.27,.15,1.2],.08)
  body.box('paint','#30324b',[x,.78,-1.97],[1.9,.72,.04])
  tube(neon,'#a6a2ff',[[x-.85,.92,-1.94],[x+.85,.92,-1.94]],.025)
  body.cylinder('metal','#4c536a',[x,1.52,-2.64],.08,.11,.5)
  addVrHeadset(body,neon,x,1.94,-2.55,.95)
  for(const side of [-1,1]){softBox(body,'#c2c9e6',[x+side*.73,1.4,-2.38],[.13,.26,.14],.04);body.ring('paint','#7e9bc9',[x+side*.73,1.58,-2.38],.12,.025,[Math.PI/2,0,0])}
 }
 const circle:XYZ[]=Array.from({length:65},(_,i)=>{const a=i*Math.PI*2/64;return [Math.cos(a)*1.55,.23,Math.sin(a)*1.55+1.3]})
 tube(neon,'#b684ff',circle,.035)
 addSkewerAFrame(body);addSkewerFirepit(body)
 for(const side of [-1,1]){
  roof.box('wood',dark,[side*3.02,3.92,4.6],[1.3,.12,.2])
  roof.box('paint','#bb5453',[side*3.02,2.78,4.61],[.95,2.1,.06])
  for(const y of [1.68,3.84])roof.box('gold','#d8ae69',[side*3.02,y,4.65],[1.08,.09,.13])
 }
 walls(full);walls(cut,true)
 addVrSkewerRoof(roof,VR_SKEWER_HALL);gable(roof,roofNeon)
 // A low continuous timber cradle and short embedded posts ground the roof sign.
 const angle=.12
 roof.box('wood','#ad7947',[0,6.35,.95],[9.8,.2,.72],[0,0,angle])
 for(const x of [-2.9,2.9]){const top=7.23+x*Math.tan(angle),bottom=5.55;roof.box('wood',wood,[x,(top+bottom)/2,.95],[.24,top-bottom,.3])}
 addSkewerDisplay(roof,[0,7.14,.95],1,angle,true)
 return {body:body.finish(),walls:full.finish(),cutWalls:cut.finish(),roof:roof.finish(),neon:neon.finish(),roofNeon:roofNeon.finish()}
}
