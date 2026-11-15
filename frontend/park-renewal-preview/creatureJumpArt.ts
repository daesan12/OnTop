import {CylinderGeometry} from 'three'
import {PropBuilder} from '../src/world/art/propGeometry'
/** Local flat-topped creature platforms. Geometry only; no moving or timed gimmicks. */
function animal(kind:'pigeon'|'mole'|'duck'){
 const b=new PropBuilder([12,8]),body=kind==='pigeon'?'#919c9c':kind==='mole'?'#a77645':'#f2dfa9'
 const floor=new CylinderGeometry(kind==='mole'?.68:.72,kind==='mole'?.75:.8,.25,24);if(kind==='duck')floor.scale(.94,1,1.25);b.add('paint',floor,body,[0,-.125,0])
 if(kind==='mole'){
  // Brown capsule, glossy eyes and pink oval nose; all relief stays below the landing plane.
  b.add('paint',new CylinderGeometry(.58,.63,.9,24),'#a77645',[0,-.66,0]);b.ball('paint','#ad7b49',[0,-.23,0],[.58,.24,.58]);
  for(const side of[-1,1]){b.ball('paint','#201e1c',[side*.22,-.28,.52],[.075,.13,.045]);b.ball('paint','#fff9e9',[side*.22-.014,-.23,.558],[.024,.035,.012])}
  b.ball('paint','#d96183',[0,-.58,.61],[.24,.13,.1]);b.ball('paint','#ee91aa',[-.06,-.545,.697],[.075,.025,.008]);
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2;b.ball('stone',i%2?'#898981':'#a2a096',[Math.cos(a)*.69,-1.05,Math.sin(a)*.69],[.23,.19,.23])}
 }else{
  const duck=kind==='duck',head=duck?'#f2dfa9':'#a5b2af';b.ball('paint',body,[0,-.27,.03],[.7,.3,duck?.88:.7]);b.ball('paint',head,[0,.1,-.55],[.27,.28,.3]);b.ball('paint',duck?'#d6a145':'#b2a179',[0,.065,-.85],[duck?.25:.13,.07,.19]);for(const s of[-1,1]){b.ball('paint','#29352f',[s*.2,.2,-.68],[.035,.04,.04]);b.ball('paint',duck?'#e1c47e':'#5b7671',[s*.5,-.04,.12],[.19,.07,.46]);for(const z of[.03,.2,.37])b.box('paint',duck?'#c6a75b':'#445f59',[s*.57,.025,z],[.1,.018,.05])}b.ball('paint',duck?'#e6cb8d':'#607c76',[0,-.12,.7],[.28,.14,.32])
 }
 return b.finish()
}
export const creatureJumpArt={pigeon:animal('pigeon'),mole:animal('mole'),duck:animal('duck')}
